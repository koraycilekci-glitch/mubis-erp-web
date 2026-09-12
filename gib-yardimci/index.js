// ============================================================
// MUBiS GIB Yardimci Servisi - Gorev Motoru
// ------------------------------------------------------------
// Luca Baglanti Merkezi mantiginda calisir:
//   - Bilgisayarda kucuk bir yerel servis (port 8765)
//   - MUBiS web uygulamasi is (job) gonderir, servis Chrome/Edge ile
//     GIB sayfalarini acar ve otomatik islemleri yapar
//
// Desteklenen isler:
//   gib-odeme      : GIB "Belge Numarasi Ile Odeme" formunu doldurur
//   gib-giris      : Dijital Vergi Dairesi'ne giris yapar (config.json)
//   etebildirge    : e-Bildirge'ye giris acar, belge indirme icin hazirlar
//   beyanname-indir: Dijital VD'de beyanname sorgulama sayfasini acar
//   tahakkuk-indir : Tahakkuk fisini bulup PDF olarak indirir
//
// Kurulum: klasorde "kur.bat" (bir kere) -> "baslat.bat" her acilista
// Kimlik bilgileri: config.json (sadece bu bilgisayarda durur)
// ============================================================

const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { exec } = require('child_process')
const puppeteer = require('puppeteer-core')
const { createWorker } = require('tesseract.js')

const PORT = 8765

// ------------------------------------------------------------
// Yapilandirma (config.json)
// Exe modunda config, exe'nin YANINDA aranir; gelistirmede __dirname
// ------------------------------------------------------------
let CONFIG = {}
const exeDizini = path.dirname(process.execPath)
const configYolu = fs.existsSync(path.join(exeDizini, 'config.json'))
  ? path.join(exeDizini, 'config.json')
  : path.join(__dirname, 'config.json')
try {
  CONFIG = JSON.parse(fs.readFileSync(configYolu, 'utf8'))
  console.log('[config] config.json yuklendi')
} catch (e) {
  console.log('[config] config.json bulunamadi - giris gerektiren isler kimlik bilgisi isteyecek')
}

// Indirme klasoru: exe modunda exe'nin YANINDA, gelistirmede proje icinde
const isExe = /mubis-gib-yardimci/i.test(path.basename(process.execPath))
const indirmeKlasoru = isExe
  ? path.join(exeDizini, 'indirilenler')
  : path.join(__dirname, 'indirilenler')
if (!fs.existsSync(indirmeKlasoru)) fs.mkdirSync(indirmeKlasoru, { recursive: true })

const CAPTCHA_API_KEY = CONFIG.captcha_api_key || process.env.CAPTCHA_API_KEY || null
const CAPTCHA_API_URL = CONFIG.captcha_api_url || 'https://2captcha.com'

// ------------------------------------------------------------
// Loglar hem konsola hem dosyaya yazilsin (hata ayiklama icin)
// ------------------------------------------------------------
const logDosyasi = path.join(indirmeKlasoru, 'yardimci.log')
const origConsoleLog = console.log
const origConsoleError = console.error

function logYaz(...args) {
  const satir = '[' + new Date().toISOString() + '] ' + args.map(a => {
    if (a instanceof Error) return a.stack || a.message
    if (typeof a === 'object') try { return JSON.stringify(a) } catch (e) { return String(a) }
    return String(a)
  }).join(' ') + '\n'
  try { fs.appendFileSync(logDosyasi, satir) } catch (e) { /* yoksay */ }
  origConsoleLog.apply(console, args)
}

function hataYaz(...args) {
  const satir = '[' + new Date().toISOString() + '] [HATA] ' + args.map(a => {
    if (a instanceof Error) return a.stack || a.message
    if (typeof a === 'object') try { return JSON.stringify(a) } catch (e) { return String(a) }
    return String(a)
  }).join(' ') + '\n'
  try { fs.appendFileSync(logDosyasi, satir) } catch (e) { /* yoksay */ }
  origConsoleError.apply(console, args)
}

console.log = logYaz
console.error = hataYaz

// Eski loglar da artik dosyaya duser
console.log('[log] yardimci.log dosyasi:', logDosyasi)

// Beklenmeyen cokmeler log dosyasina yazilsin - sessiz olum olmasin
process.on('uncaughtException', (err) => {
  hataYaz('[uncaughtException]', err)
})
process.on('unhandledRejection', (err) => {
  hataYaz('[unhandledRejection]', err)
})

// ------------------------------------------------------------
// Tarayici yonetimi
// ------------------------------------------------------------
function tarayiciBul() {
  const adaylar = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
  ]
  for (const yol of adaylar) {
    try { if (fs.existsSync(yol)) return yol } catch (e) { /* yoksay */ }
  }
  return null
}

let browser = null

async function tarayiciAl() {
  if (browser && browser.connected) return browser
  const exePath = tarayiciBul()
  if (!exePath) throw new Error('Chrome veya Edge bulunamadi. Lutfen Chrome kurun.')
  browser = await puppeteer.launch({
    executablePath: exePath,
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized', '--no-first-run', '--no-default-browser-check']
  })
  browser.on('disconnected', () => { browser = null })
  return browser
}

async function sayfaAc(url) {
  const b = await tarayiciAl()
  const page = await b.newPage()
  // PDF indirmeleri klasore dussun
  const cdp = await page.createCDPSession()
  await cdp.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: indirmeKlasoru
  })
  if (url) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await new Promise(r => setTimeout(r, 500))
  }
  await page.bringToFront()
  return page
}

// ------------------------------------------------------------
// Yardimcilar (sayfa icinde calisan fonksiyonlar)
// ------------------------------------------------------------
async function sayfadaDoldur(page, esle) {
  // esle: [{seciciTip: 'etiket', desen: /kimlik/, deger: '...'}, ...]
  return page.evaluate(({ kurallar }) => {
    const tr = (s) => String(s || '').toLocaleLowerCase('tr')
    function etiket(el) {
      let n = el
      let t = ''
      for (let i = 0; i < 8 && n; i++) {
        t = (n.getAttribute && (n.getAttribute('aria-label') || n.getAttribute('placeholder'))) || ''
        if (!t && n.textContent) t = n.textContent
        if (t && t.trim().length > 2) break
        n = n.parentElement
      }
      return tr(t || '')
    }
    function yaz(inp, v) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      if (setter) setter.call(inp, v)
      else inp.value = v
      inp.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
      inp.dispatchEvent(new Event('input', { bubbles: true }))
      inp.dispatchEvent(new Event('change', { bubbles: true }))
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
      inp.dispatchEvent(new KeyboardEvent('keypress', { key: 'a', bubbles: true }))
      inp.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }))
      inp.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
    }
    function sec(sl, want) {
      want = String(want || '').toLocaleUpperCase('tr')
      if (!want) return false
      const op = Array.from(sl.options).find(o => o.text.trim().toLocaleUpperCase('tr').includes(want))
      if (op) { sl.value = op.value; sl.dispatchEvent(new Event('change', { bubbles: true })); return true }
      return false
    }

    const rapor = {}
    const inputs = Array.from(document.querySelectorAll('input[type=text],input[type=password],input[type=email],input[type=tel],input[type=number],input:not([type])'))

    for (const kural of kurallar) {
      const desen = new RegExp(kural.desen, 'i')
      if (kural.tip === 'select') {
        const sl = Array.from(document.querySelectorAll('select')).find(s => desen.test(etiket(s)))
        if (sl) rapor[kural.anahtar] = sec(sl, kural.deger)
      } else {
        // Once etikete gore bul; bulunamazsa input type'ina gore yedekle
        let inp = inputs.find(i => desen.test(etiket(i)) && !(kural.sadecebos && i.value))
        if (!inp && /sifre|parola|password/.test(kural.desen)) {
          inp = inputs.find(i => i.type === 'password' && !i.value)
        }
        if (!inp && /kullan|kimlik|tc|vkn|username|user/.test(kural.desen)) {
          inp = inputs.find(i => (i.type === 'text' || i.type === 'number' || i.type === 'tel' || !i.type) && !i.value)
        }
        if (inp) { yaz(inp, kural.deger); rapor[kural.anahtar] = true }
      }
    }
    return rapor
  }, { kurallar: esle })
}

// ------------------------------------------------------------
// GIB odeme formunu bekle + doldur
// ------------------------------------------------------------
async function gibOdemeDoldur(page, bilgi) {
  await page.goto('https://dijital.gib.gov.tr/hizliOdemeler/belgeNumarasiIleOdeme', {
    waitUntil: 'domcontentloaded', timeout: 60000
  })
  // Angular gec render edebilir: en az 2 input olusana kadar bekle (max 20 sn)
  try {
    await page.waitForFunction(
      () => document.querySelectorAll('input[type=text],input:not([type])').length >= 2,
      { timeout: 20000 }
    )
  } catch (e) { /* yine de doldurmayi dene */ }
  await new Promise(r => setTimeout(r, 2000))

  return page.evaluate(async (b) => {
    const rapor = { yontem: {}, notlar: [] }
    const bekle = (ms) => new Promise(r => setTimeout(r, ms))

    // Angular/React gibi frameworklerin de Algilayacagi Sekilde Deger Yaz
    function yaz(el, v) {
      const proto = el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
      if (setter) setter.call(el, v)
      else el.value = v
      // React/Angular ve diger framework'ler icin gercek kullanici olay zinciri
      const etkinlikler = ['focus', 'input', 'change', 'blur']
      etkinlikler.forEach(et => {
        if (et === 'focus') el.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
        else if (et === 'blur') el.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
        else el.dispatchEvent(new Event(et, { bubbles: true }))
      })
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
      el.dispatchEvent(new KeyboardEvent('keypress', { key: 'a', bubbles: true }))
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }))
      el.dataset.gibdolu = '1'
    }

    function gorunur(el) {
      return el.offsetParent !== null || el.getClientRects().length > 0
    }

    function etiketMetni(el) {
      const parcalar = []
      // 1) label[for=id]
      if (el.id) {
        const lb = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
        if (lb) parcalar.push(lb.textContent)
      }
      // 2) en yakin label / aria-label / placeholder
      if (el.getAttribute('aria-label')) parcalar.push(el.getAttribute('aria-label'))
      if (el.placeholder) parcalar.push(el.placeholder)
      let n = el.closest('label')
      if (n) parcalar.push(n.textContent)
      // 3) parent zincirinde ilerle, kisa metin topla (tum formu tek seferde almamak icin)
      n = el.parentElement
      for (let i = 0; i < 5 && n; i++) {
        const kendiMetni = Array.from(n.childNodes)
          .filter(x => x.nodeType === 3)
          .map(x => x.textContent)
          .join(' ')
        if (kendiMetni.trim()) parcalar.push(kendiMetni)
        const lbl = n.querySelector(':scope > label, :scope > span, :scope > div > label')
        if (lbl) parcalar.push(lbl.textContent)
        n = n.parentElement
      }
      return parcalar.join(' ').toLocaleLowerCase('tr')
    }

    function sec(sl, want) {
      want = String(want || '').toLocaleUpperCase('tr').trim()
      if (!want) return false
      const norm = (s) => String(s).toLocaleUpperCase('tr').replace(/[İI]/g, 'I').replace(/\s+/g, ' ')
      const op = Array.from(sl.options).find(o =>
        norm(o.text).includes(norm(want)) || norm(want).includes(norm(o.text).trim())
      )
      if (op) {
        sl.value = op.value
        sl.dispatchEvent(new Event('change', { bubbles: true }))
        sl.dispatchEvent(new Event('input', { bubbles: true }))
        sl.dataset.gibdolu = '1'
        return true
      }
      return false
    }

    const inputs = Array.from(document.querySelectorAll('input[type=text],input:not([type])')).filter(gorunur)
    const selects = Array.from(document.querySelectorAll('select')).filter(gorunur)

    // ---- 1. Asama: etiketle eslestir ----
    inputs.forEach(inp => {
      if (inp.dataset.gibdolu || inp.value) return
      const l = etiketMetni(inp)
      if (/kimlik/.test(l)) { yaz(inp, b.vkn || ''); rapor.yontem.vkn = 'etiket' }
      else if (/takip|tahakkuk|belge|fis/.test(l)) { yaz(inp, b.tahakkukNo || ''); rapor.yontem.belge = 'etiket' }
    })

    // ---- 2. Asama: eslesmeyenleri siraya gore doldur (yedek) ----
    const bosInputs = inputs.filter(i => !i.dataset.gibdolu && !i.value && !/guvenlik|captcha/i.test(etiketMetni(i)))
    if (!rapor.yontem.vkn && bosInputs[0] && b.vkn) { yaz(bosInputs[0], b.vkn); rapor.yontem.vkn = 'sira' }
    if (!rapor.yontem.belge && bosInputs[0] && b.tahakkukNo) { yaz(bosInputs[0], b.tahakkukNo); rapor.yontem.belge = 'sira' }

    // ---- 3. Asama: acilir listeler (il once, vergi dairesi sonra) ----
    // GIB'in il/vergi dairesi alanlari gercek <select> DEGIL, Angular ozel
    // bileşeni (tiklayinca acilan liste). Oncelik native select denenir,
    // bulunamazsa ozel bileşene tiklanip secenekte tiklanir.
    const normDeger = (s) => String(s || '').toLocaleUpperCase('tr').replace(/İ/g, 'I').replace(/\s+/g, ' ').trim()

    function tikla(el) {
      const rect = el.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      ;['mousedown', 'focus', 'mouseup', 'click'].forEach(et => {
        el.dispatchEvent(new MouseEvent(et, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }))
      })
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.focus()
    }

    // Etiket metnine yakin tiklanabilir kontrol bulur (input, combobox, ng-select...)
    function kontrolBul(desen) {
      const etiketler = Array.from(document.querySelectorAll('label, span, div, td, th'))
        .filter(el => el.children.length === 0 && desen.test(el.textContent.trim().toLocaleLowerCase('tr')) && gorunur(el))
      for (const t of etiketler) {
        let n = t.parentElement
        for (let i = 0; i < 5 && n; i++) {
          const kontrol = n.querySelector('input, [role=combobox], [role=listbox], .ng-select-container, .mat-select-trigger, button, .dropdown-toggle, .select2, [class*=select]')
          if (kontrol && gorunur(kontrol)) return kontrol
          n = n.parentElement
        }
      }
      return null
    }

    // Ozel bileşen: tetikleyiciye tikla -> acilan listeden eslesen secenekte tikla
    async function ozelSec(desen, want) {
      want = normDeger(want)
      if (!want) return false
      const trigger = kontrolBul(desen)
      if (!trigger) return false
      tikla(trigger)
      await bekle(800)
      const secenekler = Array.from(document.querySelectorAll(
        '.ng-option, .mat-option, [role=option], .dropdown-menu .dropdown-item, .dropdown-menu li, [class*=option], [class*=menu-item] li'
      )).filter(gorunur)
      const hedef = secenekler.find(el => normDeger(el.textContent).includes(want))
      if (!hedef) {
        // Listeyi kapat
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return false
      }
      tikla(hedef)
      await bekle(400)
      return true
    }

    function ilSelectiniBul() {
      const etiketle = selects.find(sl => /(^|[^a-z])il([^a-z]|$)|iller/.test(etiketMetni(sl)))
      return etiketle || null
    }
    function daireSelectiniBul() {
      const etiketle = selects.find(sl => /dairesi|daire/.test(etiketMetni(sl)))
      return etiketle || null
    }

    let ilSecildi = false, daireSecildi = false
    for (let deneme = 0; deneme < 12; deneme++) {
      // Native select varsa once onu dene
      if (!ilSecildi && b.il) {
        const sl = ilSelectiniBul()
        if (sl && sec(sl, b.il)) { ilSecildi = true; rapor.yontem.il = 'liste' }
      }
      if (ilSecildi && !daireSecildi && b.vergiDairesi) {
        const sl = daireSelectiniBul()
        if (sl && sec(sl, b.vergiDairesi)) { daireSecildi = true; rapor.yontem.daire = 'liste' }
      }
      // Native yoksa Angular ozel bileşeni dene
      if (!ilSecildi && b.il) {
        if (await ozelSec(/^il$|(^|\s)il(\s|$)|iller/, b.il)) { ilSecildi = true; rapor.yontem.il = 'ozel' }
      }
      if (ilSecildi && !daireSecildi && b.vergiDairesi) {
        if (await ozelSec(/dairesi|daire/, b.vergiDairesi)) { daireSecildi = true; rapor.yontem.daire = 'ozel' }
      }
      if ((ilSecildi || !b.il) && (daireSecildi || !b.vergiDairesi)) break
      await bekle(1000)
    }

    // Eslesmeyenlerde sebep raporlanir
    if (!ilSecildi) {
      if (!b.il) rapor.notlar.push('il degeri BOS geldi (musteri kaydinda il yok)')
      else rapor.notlar.push(`il secilemedi. Gelen: "${b.il}" (metin kutulari: ${inputs.length})`)
    }
    if (!daireSecildi) {
      if (!b.vergiDairesi) rapor.notlar.push('vergiDairesi degeri BOS geldi (musteri kaydinda vergi dairesi yok)')
      else rapor.notlar.push(`vergi dairesi secilemedi. Gelen: "${b.vergiDairesi}"`)
    }

    // Guvenlik kodu alanina odaklan
    const guv = inputs.find(i => /guvenlik|captcha/i.test(etiketMetni(i))) || inputs[inputs.length - 1]
    if (guv) guv.focus()

    rapor.notlar.push(`Metin kutusu: ${inputs.length}, Acilir liste: ${selects.length}`)
    return rapor
  }, bilgi)
}

// ------------------------------------------------------------
// Captcha cozme (Node tarafi Tesseract.js OCR)
// ------------------------------------------------------------

// Yerel Tesseract dosyalarini script/exe ile ayni dizinde arar.
// Kurulum/build asamasinda worker + core dosyalari bu dizine kopyalanir;
// boylece SEA/exe modularda CDN'den worker yuklenme sorunu olmaz.
function tesseractDosyasi(ad) {
  const yol = path.join(__dirname, ad)
  return fs.existsSync(yol) ? yol : null
}

async function coz2captcha(base64Png, timeoutMs = 60000) {
  if (!CAPTCHA_API_KEY) throw new Error('captcha_api_key tanimli degil')
  const key = CAPTCHA_API_KEY
  const baseUrl = CAPTCHA_API_URL.replace(/\/$/, '')

  function post(urlStr, form) {
    return new Promise((resolve, reject) => {
      const u = new URL(urlStr)
      const body = new URLSearchParams(form).toString()
      const req = https.request({
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        let data = ''
        res.on('data', c => { data += c })
        res.on('end', () => resolve(data))
      })
      req.on('error', reject)
      req.write(body)
      req.end()
    })
  }

  function get(urlStr) {
    return new Promise((resolve, reject) => {
      https.get(urlStr, { headers: { 'User-Agent': 'node' } }, (res) => {
        let data = ''
        res.on('data', c => { data += c })
        res.on('end', () => resolve(data))
      }).on('error', reject)
    })
  }

  const body = base64Png.replace(/^data:image\/\w+;base64,/, '')
  console.log('[2captcha] captcha gonderiliyor...')
  const submitRaw = await post(`${baseUrl}/in.php`, {
    key,
    method: 'base64',
    body,
    json: '1'
  })
  let submit = null
  try { submit = JSON.parse(submitRaw) } catch (e) { /* yoksay */ }
  if (!submit || submit.status !== 1) {
    throw new Error('2captcha gonderim hatasi: ' + (submitRaw || 'bos yanit'))
  }
  const id = submit.request
  console.log('[2captcha] id:', id)

  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    await new Promise(r => setTimeout(r, 5000))
    const resRaw = await get(`${baseUrl}/res.php?key=${key}&action=get&id=${id}&json=1`)
    let res = null
    try { res = JSON.parse(resRaw) } catch (e) { /* yoksay */ }
    if (res && res.status === 1) {
      console.log('[2captcha] cevap:', res.request)
      return String(res.request || '').trim()
    }
    if (res && res.request === 'CAPCHA_NOT_READY') {
      console.log('[2captcha] bekleniyor...')
      continue
    }
    console.log('[2captcha] beklenmedik yanit:', resRaw)
  }
  throw new Error('2captcha zaman asimi')
}

async function tesseractOku(base64Png, whitelist = '0123456789', psm = '7') {
  // Node ortaminda dogru worker dosyasi: browser worker.min.js calismaz.
  // Oncelikle yerel Node worker kopyasini, yoksa node_modules kaynagini kullan.
  let workerPath = tesseractDosyasi('tesseract-worker.js')
  if (!workerPath) {
    try {
      workerPath = require.resolve('tesseract.js/src/worker-script/node/index.js')
    } catch (e) {}
  }

  const langDir = tesseractDosyasi('tessdata') // klasor varsa yerel kullan

  const opts = { logger: () => {} }
  if (workerPath) opts.workerPath = workerPath
  opts.langPath = langDir || 'https://tessdata.projectnaptha.com/4.0.0_best'

  console.log('[tesseract] worker:', workerPath || 'varsayilan', '| lang:', opts.langPath, '| psm:', psm)

  const worker = await createWorker('eng', 1, opts)
  try {
    await worker.setParameters({
      tessedit_char_whitelist: whitelist,
      tessedit_pageseg_mode: psm
    })
    const buf = Buffer.from(base64Png.replace(/^data:image\/\w+;base64,/, ''), 'base64')
    const { data: { text } } = await worker.recognize(buf)
    return (text || '').replace(/\s/g, '')
  } finally {
    await worker.terminate()
  }
}

async function sayfaResimBase64(page, src) {
  return page.evaluate(async (s) => {
    try {
      const url = s.startsWith('http') || s.startsWith('data:') ? s : (s.startsWith('/') ? location.origin + s : s)
      const r = await fetch(url, { credentials: 'include', cache: 'no-store' })
      if (!r.ok) return null
      const blob = await r.blob()
      return await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
    } catch (e) { return null }
  }, src)
}

async function sayfaResimBase64Islenmis(page, src) {
  const base64 = await sayfaResimBase64(page, src)
  if (!base64) return null
  return page.evaluate((b64) => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const olcek = 3
        const w = img.width * olcek
        const h = img.height * olcek
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        const imgData = ctx.getImageData(0, 0, w, h)
        const d = imgData.data
        // Grayscale
        for (let i = 0; i < d.length; i += 4) {
          const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
          d[i] = d[i + 1] = d[i + 2] = gray
        }
        // Esikleme (siyah-beyaz)
        for (let i = 0; i < d.length; i += 4) {
          const v = d[i] < 128 ? 0 : 255
          d[i] = d[i + 1] = d[i + 2] = v
          d[i + 3] = 255
        }
        ctx.putImageData(imgData, 0, 0)
        resolve(canvas.toDataURL('image/png'))
      }
      img.onerror = () => resolve(null)
      img.src = b64
    })
  }, base64)
}

// ------------------------------------------------------------
// ISLER (jobs)
// ------------------------------------------------------------

// Arka plan gorevi: hata olursa programi cokertmeden logla
function arkaPlan(fn) {
  fn().catch(err => console.error('[arkaplan]', err?.message || String(err)))
}

// GIB sorgulama sayfalari (en iyi caba: GIB sayfa yollari degisebilir;
// acilamazsa kullanici ana sayfadan 2 tikla ulasir, indirmeler yine de
// otomatik olarak "indirilenler" klasorune duser)
const GIB_SORGU_URL = {
  'beyanname-indir': 'https://dijital.gib.gov.tr/beyannameSorgulamaMenu',
  'tahakkuk-indir': 'https://dijital.gib.gov.tr/tahakkukEkranlari',
  'makbuz-indir': 'https://dijital.gib.gov.tr/odemeKayitlari'
}

// e-Bildirge sorgulama sayfalari (giris sonrasi acilir)
const EB_SORGU_URL = {
  'eb-beyanname-indir': 'https://ebildirge.dib.gov.tr/Pages/BeyannameSorgulama.aspx',
  'eb-tahakkuk-indir': 'https://ebildirge.dib.gov.tr/Pages/TahakkukSorgulama.aspx'
}

// Kullanicinin guvenlik kodu girip giris yapmasini bekler (max 5 dk),
// giris tamamlaninca ilgili sorgulama sayfasini acar.
async function girisSonrasiDevam(page, isAdi) {
  const t0 = Date.now()
  while (Date.now() - t0 < 5 * 60 * 1000) {
    try {
      const sifreAlanVar = await page.evaluate(() => !!document.querySelector('input[type=password]'))
      if (!sifreAlanVar) break
    } catch (e) {
      return // sayfa/kapandi, islem anlamsiz
    }
    await new Promise(r => setTimeout(r, 2500))
  }
  const hedef = GIB_SORGU_URL[isAdi] || EB_SORGU_URL[isAdi]
  if (hedef) {
    await page.goto(hedef, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})
  }
}

// Ortak giris akisi: dijital VD ac, kimlik bilgilerini doldur, arka planda
// giris sonrasi devam planla. Kullanici yalniz guvenlik kodunu girer.
async function gibGirisAkisi(p, isAdi) {
  const kull = p.kullaniciKodu || CONFIG.gib?.kullaniciKodu
  const parola = p.parola || CONFIG.gib?.parola
  if (!kull || !parola) throw new Error('Giris bilgileri yok: musterinin DVS kullanici kodu/parolasi kayitli degil')
  const page = await sayfaAc('https://dijital.gib.gov.tr/')
  await sayfadaDoldur(page, [
    { anahtar: 'kullanici', desen: 'kullanici kodu|kullanici adi|tc|vkn|kimlik', deger: kull },
    { anahtar: 'parola', desen: 'parola|sifre', deger: parola }
  ])
  arkaPlan(() => girisSonrasiDevam(page, isAdi))
  return { not: 'Giris ekrani acildi ve bilgiler dolduruldu. Guvenlik kodunu girip GIRIS\'e basin. Giris sonrasi ilgili sorgulama sayfasi otomatik acilir; indirdiginiz belgeler otomatik olarak MUBiS\'e yuklenir.' }
}

// e-Bildirge giris akisi: ebildirge.dib.gov.tr ac, giris bilgilerini doldur
// (VD kullanici kodu + sifre; MUBiS'teki dvs alanlari kullanilir), kullanici
// yalniz guvenlik kodunu girer. Giris sonrasi sorgulama sayfasi acilir.
async function ebGirisAkisi(p, isAdi) {
  const kull = p.kullaniciKodu || CONFIG.etebligat?.kullaniciKodu || CONFIG.gib?.kullaniciKodu
  const parola = p.parola || CONFIG.etebligat?.parola || CONFIG.gib?.parola
  if (!kull || !parola) throw new Error('Giris bilgileri yok: musterinin VD kullanici kodu/parolasi kayitli degil')
  const page = await sayfaAc('https://ebildirge.dib.gov.tr/')
  await sayfadaDoldur(page, [
    { anahtar: 'kullanici', desen: 'kullanici kodu|kullanici adi|tc|vkn|kimlik', deger: kull },
    { anahtar: 'parola', desen: 'parola|sifre', deger: parola }
  ])
  arkaPlan(() => girisSonrasiDevam(page, isAdi))
  return { not: 'e-Bildirge giris ekrani acildi ve bilgiler dolduruldu. Guvenlik kodunu girip GIRIS\'e basin. Giris sonrasi sorgulama sayfasi otomatik acilir; indirdiginiz belgeler otomatik olarak MUBiS\'e yuklenir.' }
}

// ------------------------------------------------------------
// e-Devlet (turkiye.gov.tr) ortak akisi
// ------------------------------------------------------------

// turkiye.gov.tr servis sayfasini acar; "Kimligimi Simdi Dogrula" varsa
// tiklar, TC + e-Devlet sifresini doldurur. Guvenlik kodu kullaniciya.
async function edevletSayfaHazirla(url, tc, sifre) {
  const page = await sayfaAc(url)
  try {
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll('button, a')].find(el => /kimli[ğg]imi.*do[ğg]rula/i.test(el.textContent || ''))
      if (b) { b.click(); return true }
      return false
    }, { timeout: 8000 })
    // Dogrulama tiklandi: sabit 3 sn yerine giris alanlarini bekle
    await page.waitForSelector('input[type=password]', { timeout: 15000 }).catch(() => {})
  } catch (e) { /* zaten girisli - dogrulama gerekmiyor */ }
  await edevletGirisDoldur(page, tc, sifre)
  return page
}

// e-Devlet giris ekranini doldurur. Aday secimi sayfada yapilir, YAZMA
// puppeteer'in gercek klavye olaylariyla (page.keyboard.type) yapilir -
// Angular/her framework kesin algilar. Alan envanteri raporla doner.
async function edevletGirisDoldur(page, tc, sifre) {
  // Giris sayfasina yonlendirme + render bekle
  try {
    await page.waitForSelector('input[type=password]', { timeout: 20000 })
  } catch (e) { /* zaten girisli olabilir - yine de dene */ }
  await new Promise(r => setTimeout(r, 400))

  const secim = await page.evaluate(() => {
    const gorunur = (el) => el.offsetParent !== null || el.getClientRects().length > 0
    const inputs = [...document.querySelectorAll('input')]
    // e-Devlet giris alanlari: tridField (TC, type=number), egpField (sifre), captchaField
    const tcEl = document.querySelector('#tridField')
      || inputs.find(el => gorunur(el) && (el.type === 'text' || el.type === 'number' || el.type === 'tel' || !el.type)
        && el.getAttribute('maxlength') === '11' && !/captcha|guvenlik|kod/i.test(el.id + ' ' + el.name))
      || inputs.find(el => gorunur(el) && (el.type === 'text' || el.type === 'tel' || !el.type)
        && !/captcha|guvenlik|kod/i.test(el.id + ' ' + el.name))
    const pwdEl = document.querySelector('#egpField') || inputs.find(el => el.type === 'password' && gorunur(el))
    return {
      tcIdx: tcEl ? inputs.indexOf(tcEl) : -1,
      pwdIdx: pwdEl ? inputs.indexOf(pwdEl) : -1,
      envanter: inputs.map((el, i) => ({
        i, type: el.type || '?', id: el.id || '', name: el.name || '',
        ml: el.getAttribute('maxlength') || '', gorunur: gorunur(el)
      }))
    }
  })

  const handles = await page.$$('input')
  const tcYazildi = await (async () => {
    if (secim.tcIdx < 0 || !handles[secim.tcIdx]) return false
    const h = handles[secim.tcIdx]
    await h.click({ clickCount: 3 }).catch(() => {})
    await page.keyboard.press('Backspace').catch(() => {})
    await h.focus().catch(() => {})
    await page.keyboard.type(String(tc || ''), { delay: 8 }).catch(() => {})
    return true
  })()
  const pwdYazildi = await (async () => {
    if (secim.pwdIdx < 0 || !handles[secim.pwdIdx]) return false
    const h = handles[secim.pwdIdx]
    await h.click({ clickCount: 3 }).catch(() => {})
    await page.keyboard.press('Backspace').catch(() => {})
    await h.focus().catch(() => {})
    await page.keyboard.type(String(sifre || ''), { delay: 8 }).catch(() => {})
    return true
  })()

  console.log(`[edevlet] tcIdx=${secim.tcIdx} handles=${handles.length} tc=${tcYazildi ? 'yazildi' : 'BULUNAMADI'} sifre=${pwdYazildi ? 'yazildi' : 'BULUNAMADI'}`)
  try {
    fs.appendFileSync(path.join(indirmeKlasoru, 'edevlet-giris.log'),
      `${new Date().toISOString()} tcIdx=${secim.tcIdx} handles=${handles.length} tc=${tcYazildi}/${String(tc || '').length} hane sifre=${pwdYazildi} envanter=${JSON.stringify(secim.envanter)}\n`)
  } catch (e) { /* log yazilamadi - sorun degil */ }
  return { ...secim, tcYazildi, pwdYazildi }
}

// Giris bitmesini bekler: sifre alani kalkmali VE giris sayfasindan (giris.
// turkiye.gov.tr) cikilmali. Ikili dogrulamada onay bildirimi bekleme
// ekraninda sifre alani yoktur ama hala giris sayfasindadir - o yuzden
// yalniz sifre kontrolu yetmez. Ayrica OAuth izin onayi ekranindaki
// "Onayla" butonu gorunurse otomatik tiklar (bilgi onay ekrani:
// Kimlik Numaraniz / Ad Soyad listesi + Onayla-Iptal butonlari).
// Max 5 dk bekler; onay gelmezse false doner.
async function edevletGirisBekle(page) {
  const t0 = Date.now()
  while (Date.now() - t0 < 5 * 60 * 1000) {
    try {
      const url = page.url() || ''
      const durum = await page.evaluate(() => {
        if (document.querySelector('input[type=password]')) return 'giris'
        // OAuth izin onay ekrani: yalniz "Onayla" yazan buton (Giris Yap / Iptal degil)
        const btn = [...document.querySelectorAll('button, input[type=submit], input[type=button], a')]
          .find(el => /^onayla$/i.test((el.value || el.textContent || '').trim()))
        if (btn) {
          btn.click()
          return 'onayladi'
        }
        return 'bekliyor'
      })
      if (durum === 'onayladi') {
        await new Promise(r => setTimeout(r, 5000)) // yonlendirme icin
        continue
      }
      if (!/giris\.turkiye\.gov\.tr/i.test(url)) return true
    } catch (e) {
      return false // sayfa kapandi
    }
    await new Promise(r => setTimeout(r, 2500))
  }
  return false
}

// SGK WEB TAHSILAT sayfasinda sirayla select doldurur (ASP.NET postback'li).
// icerik null ise ilk gecerli secenegi secer (isveren sicil no).
// NOT: AutoPostBack'li select'lerde inline onchange zaten __doPostBack'i
// tetikler; elle ek cagri cift postback yapip secimleri sifirlar.
async function sgkSelectSec(page, sirano, icerik) {
  return page.evaluate((sirano, icerik) => {
    const sel = [...document.querySelectorAll('select')][sirano]
    if (!sel) return false
    let opt = null
    if (icerik) {
      const want = icerik.toLocaleLowerCase('tr')
      opt = [...sel.options].find(o => o.text.toLocaleLowerCase('tr').includes(want))
    } else {
      opt = sel.options[1] || sel.options[0]
    }
    if (!opt) return false
    sel.value = opt.value
    sel.focus()
    sel.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }, sirano, icerik)
}

// sgk-odeme arka plani: giris sonrasi "Uygulamaya Git" -> OAuth izin onayi
// (Onayla - YENI PENCEREDE acilir, tum pencereler taranir) -> WEB TAHSILAT
// penceresini bekle -> sorgu turu/tipi/sicil secip Borc Sorgula'ya basar.
// Onayla butonunu hangi pencerede gorurse orada tiklar.
async function sgkOdemeDevam(page) {
  if (!await edevletGirisBekle(page)) return
  const browser = page.browser()
  // 1) turkiye.gov.tr servis sayfasindaki "Uygulamaya Git" butonu
  // (OAuth onayi otomatik tiklandiysa bu ekran atlanmis olabilir - zorunlu degil)
  try {
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll('a, button')].find(el => /uygulamaya git/i.test(el.textContent || ''))
      if (b) { b.click(); return true }
      return false
    }, { timeout: 15000 })
  } catch (e) { /* gectik, devam */ }
  // 2+3) TEK DONGU (90 sn): once WEB TAHSILAT sayfasini IÇERIKLE ara
  // (sgk.gov.tr + select'ler yuklu = gercekten acilmis; URL gecici olarak
  // sgk.gov.tr gorundugunde icerik yoktur, sahte eslesme engellenir).
  // Bulunamazsa tum pencerelerin/frame'lerinde Onayla butonu aranir ve tiklanir.
  let tahsilat = null
  const t0 = Date.now()
  while (Date.now() - t0 < 90000) {
    let tiklandi = false
    let hata = null
    try {
      const sayfalar = await browser.pages()
      for (const pg of sayfalar) {
        // a) WEB TAHSILAT icerik kontrolu
        try {
          const hazir = await pg.evaluate(() =>
            /sgk\.gov\.tr/i.test(location.href) &&
            document.readyState === 'complete' &&
            document.querySelectorAll('select').length >= 2)
          if (hazir) { tahsilat = pg; break }
        } catch (e) { /* sayfa yukleniyor/kapandi - devam */ }
        // b) Onayla arama (tum frame'lerde)
        let framlar = []
        try { framlar = pg.frames() } catch (e) { continue }
        for (const fr of framlar) {
          try {
            const r = await fr.evaluate(() => {
              if (document.querySelector('input[type=password]')) return 'giris'
              const btn = [...document.querySelectorAll('button, input[type=submit], input[type=button], a')]
                .find(el => {
                  const t = (el.value || el.textContent || '').trim()
                  return /\bonayla/i.test(t) && !/iptal/i.test(t)
                })
              if (btn) {
                btn.scrollIntoView({ block: 'center' })
                btn.click()
                return true
              }
              return false
            })
            if (r === true) { tiklandi = true; break }
          } catch (e) { /* frame yukleniyor - digerine bak */ }
        }
        if (tahsilat || tiklandi) break
      }
    } catch (e) {
      hata = e.message
    }
    try {
      fs.appendFileSync(path.join(indirmeKlasoru, 'edevlet-giris.log'),
        `${new Date().toISOString()} sgk-dongu tahsilat=${tahsilat ? 'var' : 'yok'} tiklandi=${tiklandi}${hata ? ' hata=' + hata : ''}\n`)
    } catch (e) { /* log yazilamadi */ }
    if (tahsilat) break
    if (tiklandi) { await new Promise(r => setTimeout(r, 5000)); continue }
    await new Promise(r => setTimeout(r, 2000))
  }
  if (!tahsilat) return
  await tahsilat.bringToFront().catch(() => {})
  await tahsilat.waitForSelector('select', { timeout: 30000 }).catch(() => {})
  // 4) Secimler: her select postback ile sonrakini yukledigi icin sirayla
  await sgkSelectSec(tahsilat, 0, 'işveren tahsilat') // Sorgu Turu: 4/1-A ISVEREN TAHSILATLARI
  await new Promise(r => setTimeout(r, 5000))
  await sgkSelectSec(tahsilat, 1, 'işveren cari dönem') // Sorgu Tipi: ISVEREN CARI DONEM
  await new Promise(r => setTimeout(r, 5000))
  await sgkSelectSec(tahsilat, 2, null) // Isveren Sicil No: ilk kayit
  await new Promise(r => setTimeout(r, 3000))
  await tahsilat.evaluate(() => {
    const b = [...document.querySelectorAll('input[type=submit], input[type=button], button, a')]
      .find(el => /bor[çc] sorgula/i.test(el.value || el.textContent || ''))
    if (b) b.click()
  })
}

// etebligat-indir arka plani: giris sonrasi e-Tebligatlarim listesinde
// kuruma gore filtreleyip Goruntule linklerini tek tek acar; PDF'ler
// otomatik olarak "indirilenler" klasorune duser.
async function etebligatlariIndir(page, kaynak) {
  if (!await edevletGirisBekle(page)) return
  const LISTE_URL = 'https://www.turkiye.gov.tr/e-tebligatlarim'
  await page.goto(LISTE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})
  await new Promise(r => setTimeout(r, 5000))
  for (let i = 0; i < 20; i++) {
    let tiklandi = false
    try {
      tiklandi = await page.evaluate((kaynak, atla) => {
        const desen = {
          sgk: /sosyal g[üu]venlik|sgk/i,
          vergi: /gelir idaresi|vergi|gib/i,
          ptt: /ptt/i,
          tumu: /.*/ 
        }[kaynak || 'tumu'] || /.*/
        const ogeler = [...document.querySelectorAll('a, button')].filter(el => {
          const satir = (el.closest('tr, li, div')?.textContent || '') + ' ' + (el.textContent || '')
          return desen.test(satir) && /g[öo]r[üu]nt[üu]le|incele|detay|pdf|indir/i.test(el.textContent || '')
        })
        const el = ogeler[atla]
        if (el) { el.click(); return true }
        return false
      }, kaynak, i)
    } catch (e) { break }
    if (!tiklandi) break
    await new Promise(r => setTimeout(r, 7000)) // PDF inmesi icin bekle
    await page.goto(LISTE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})
    await new Promise(r => setTimeout(r, 4000))
  }
}

const ISLER = {
  // ----- 1) GIB odeme formunu doldur -----
  'gib-odeme': async (p) => {
    const page = await sayfaAc() // bos sayfa; url doldurucuda veriliyor
    try {
      const rapor = await gibOdemeDoldur(page, p)
      console.log('Form dolduruldu:', JSON.stringify(rapor))
      return { rapor, not: 'Guvenlik kodunu girin ve SORGULA\'ya basin.' }
    } catch (err) {
      console.error('gib-odeme hatasi:', err.message)
      throw new Error('Sayfa doldurulamadi: ' + err.message)
    }
  },

  // ----- 2) Dijital Vergi Dairesi giris -----
  'gib-giris': async (p) => {
    const kull = p.kullaniciKodu || CONFIG.gib?.kullaniciKodu
    const parola = p.parola || CONFIG.gib?.parola
    if (!kull || !parola) throw new Error('Giris bilgileri yok: config.json dosyasini doldurun')
    const page = await sayfaAc('https://dijital.gib.gov.tr/')
    await sayfadaDoldur(page, [
      { anahtar: 'kullanici', desen: 'kullanici kodu|kullanici adi|tc|vkn|kimlik', deger: kull },
      { anahtar: 'parola', desen: 'parola|sifre', deger: parola }
    ])
    return { not: 'Bilgiler dolduruldu. Guvenlik kodunu girip GIRIS\'e basin.' }
  },

  // ----- 3) e-Bildirge giris -----
  'etebligat': async (p) => {
    const kull = p.kullaniciKodu || CONFIG.etebligat?.kullaniciKodu || CONFIG.gib?.kullaniciKodu
    const parola = p.parola || CONFIG.etebligat?.parola || CONFIG.gib?.parola
    if (!kull || !parola) throw new Error('Giris bilgileri yok: config.json dosyasini doldurun')
    const page = await sayfaAc('https://ebildirge.dib.gov.tr/')
    await sayfadaDoldur(page, [
      { anahtar: 'kullanici', desen: 'kullanici kodu|kullanici adi|tc|vkn|kimlik', deger: kull },
      { anahtar: 'parola', desen: 'parola|sifre', deger: parola }
    ])
    return { not: 'e-Bildirge giris bilgileri dolduruldu. Guvenlik kodunu girip girise basin.' }
  },

  // ----- 4) Beyanname sorgulama + indirme -----
  'beyanname-indir': async (p) => gibGirisAkisi(p, 'beyanname-indir'),

  // ----- 5) Tahakkuk sorgulama + indirme -----
  'tahakkuk-indir': async (p) => gibGirisAkisi(p, 'tahakkuk-indir'),

  // ----- 6) Odeme makbuzu indirme -----
  'makbuz-indir': async (p) => gibGirisAkisi(p, 'makbuz-indir'),

  // ----- 7/8) e-Bildirge: beyanname + tahakkuk indirme -----
  'eb-beyanname-indir': async (p) => ebGirisAkisi(p, 'eb-beyanname-indir'),
  'eb-tahakkuk-indir': async (p) => ebGirisAkisi(p, 'eb-tahakkuk-indir'),

  // ----- 9) SGK prim odemesi (e-Devlet uzerinden) -----
  // turkiye.gov.tr -> Kimligimi Dogrula -> TC + e-Devlet sifre (captcha
  // kullaniciya) -> Uygulamaya Git -> WEB TAHSILAT: 4/1-A isveren
  // tahsilatlari / isveren cari donem / ilk sicil -> Borc Sorgula
  'sgk-odeme': async (p) => {
    const tc = p.tc
    const sifre = p.edevletSifre
    if (!tc || !sifre) throw new Error('e-Devlet giris bilgileri yok: musteri kaydinda TC ve e-Devlet sifresi olmali')
    const page = await edevletSayfaHazirla(
      'https://www.turkiye.gov.tr/sosyal-guvenlik-sosyal-guvenlik-kurumu-kart-ile-prim-odeme-uygulamasi', tc, sifre)
    arkaPlan(() => sgkOdemeDevam(page))
    return { not: 'e-Devlet giris ekrani acildi ve bilgiler dolduruldu. Guvenlik kodunu girip GIRIS\'e basin. Giris sonrasi uygulama otomatik acilir, sorgu secimleri yapilir ve Borc Sorgula\'ya basilir.' }
  },

  // ----- 9a) SGK borcu sorgulama (e-Bildirge) -----
  // ebildirge.sgk.gov.tr/WPEB/amp/loginldap -> kullanici adi + sistem sifresi +
  // isyeri sifresi (guvenlik anahtari kullaniciya) -> Isveren Borc Goruntuleme ->
  // tablodan "Sadece Borclar Toplami" ve "GZ" ayrı ayrı okunur.
  'sgk-borc-sorgula': async (p) => {
    let kullaniciAdi = p.kullaniciAdi || p.sgkKullaniciAdi
    // Isyeri kodu = kullanici adinin yanindaki kucuk kutu (ornek: 2932997048 - 5)
    let kullaniciEki = String(p.isyeriKodu || p.sgkIsyeriKodu || '').trim()
    // Alternatif: kullanici adi "no-ek" formatinda kaydedilmisse tire sonrasi ektir
    if (!kullaniciEki) {
      const kaParcalar = String(kullaniciAdi || '').split(/[-–]/)
      if (kaParcalar.length > 1 && kaParcalar[1].trim()) {
        kullaniciAdi = kaParcalar[0].trim()
        kullaniciEki = kaParcalar.slice(1).join('').trim()
      }
    } else {
      kullaniciAdi = String(kullaniciAdi || '').split(/[-–]/)[0].trim()
    }
    const sistemSifre = p.sistemSifre || p.sgkSistemSifre
    const isyeriSifre = p.isyeriSifre || p.sgkIsyeriSifre
    if (!kullaniciAdi || !sistemSifre || !isyeriSifre) {
      throw new Error('SGK e-Bildirge giris bilgileri eksik: kullanici adi, sistem sifresi ve isyeri sifresi gerekli')
    }

    const page = await sayfaAc('https://ebildirge.sgk.gov.tr/WPEB/amp/loginldap')

    // Sayfanin acilmasini bekle
    await new Promise(r => setTimeout(r, 1500))

    // SGK bot korumasi (WAF) insan dogrulama sayfasi acildiysa once onu gec:
    // "What code is in the image?" sayfasinda resim OCR ile okunur; olmazsa
    // kullanici elle cozer, sayfa degisene kadar beklenir.
    async function botKontrolunuGec() {
      const metin = await page.evaluate(() => document.body ? document.body.innerText.substring(0, 500) : '').catch(() => '')
      if (!/what code is in the image|testing whether you are a human/i.test(metin)) {
        return { challenge: false }
      }
      console.log('[sgk-borc-sorgula] SGK bot dogrulama (WAF) sayfasi algilandi, OCR deneniyor')

      for (let deneme = 1; deneme <= 3; deneme++) {
        // En buyuk gorunur resmi bul ve Node tarafinda OCR ile oku
        const imgBilgi = await page.evaluate(() => {
          const img = [...document.querySelectorAll('img')].sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight))[0]
          if (!img || !img.naturalWidth) return null
          return { src: img.getAttribute('src') || img.src }
        })
        if (!imgBilgi || !imgBilgi.src) break
        const base64 = imgBilgi.src.startsWith('data:') ? imgBilgi.src : await sayfaResimBase64(page, imgBilgi.src)
        console.log(`[sgk-borc-sorgula] WAF resim alindi:`, base64 ? 'EVET' : 'HAYIR')
        if (!base64) break
        const ocrMetin = await tesseractOku(base64, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')
        const okunan = ocrMetin.replace(/[^A-Za-z0-9]/g, '')
        console.log(`[sgk-borc-sorgula] WAF OCR deneme ${deneme}:`, okunan)
        if (okunan && okunan.length >= 4) {
          const yazildi = await page.evaluate((k) => {
            const inp = [...document.querySelectorAll('input[type=text]')].find(i => i.offsetParent !== null)
            if (!inp) return false
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
            if (setter) setter.call(inp, k)
            else inp.value = k
            inp.dispatchEvent(new Event('input', { bubbles: true }))
            inp.dispatchEvent(new Event('change', { bubbles: true }))
            const btn = document.querySelector('input[type=submit], button[type=submit]') ||
              [...document.querySelectorAll('input,button')].find(b => /^submit$/i.test((b.value || b.textContent || '').trim()))
            if (btn) btn.click()
            return true
          }, okunan)
          if (yazildi) {
            await new Promise(r => setTimeout(r, 4000))
            const yeni = await page.evaluate(() => document.body ? document.body.innerText.substring(0, 300) : '').catch(() => '')
            if (!/what code is in the image|testing whether you are a human/i.test(yeni)) {
              console.log('[sgk-borc-sorgula] WAF dogrulamasi OCR ile gecildi')
              return { challenge: true, gecildi: true }
            }
          }
        } else break
      }

      // Otomatik gecilemedi: kullanici elle cozsun, max 3 dk bekle
      console.log('[sgk-borc-sorgula] WAF dogrulamasi otomatik gecilemedi - kullanici elle cozebilir, bekleniyor (max 3 dk)')
      for (let i = 0; i < 36; i++) {
        await new Promise(r => setTimeout(r, 5000))
        const yeni = await page.evaluate(() => document.body ? document.body.innerText.substring(0, 300) : '').catch(() => '')
        if (!/what code is in the image|testing whether you are a human/i.test(yeni)) {
          console.log('[sgk-borc-sorgula] WAF dogrulamasi kullanici tarafindan gecildi')
          return { challenge: true, gecildi: true }
        }
      }
      return { challenge: true, gecildi: false }
    }

    const waf = await botKontrolunuGec()
    if (waf.challenge && !waf.gecildi) {
      throw new Error('SGK insan dogrulama (WAF) sayfasi otomatik gecilemedi')
    }

    // Formun tam yuklenmesini bekle (input'lar SPA ile gec yuklenebilir)
    try {
      await page.waitForFunction(
        () => document.querySelectorAll('input').length >= 3,
        { timeout: 20000 }
      )
    } catch (e) {
      console.log('[sgk-borc-sorgula] input yuklenmesi beklenen surede olmadi, yine de dene')
    }
    await new Promise(r => setTimeout(r, 1500))

    // Yardimci: gorunur input'lari listele
    async function inputlariListele() {
      return page.evaluate(() =>
        Array.from(document.querySelectorAll('input'))
          .filter(i => i.offsetParent !== null || i.getClientRects().length > 0)
          .map(i => ({ name: i.name, id: i.id, type: i.type, placeholder: i.placeholder, value: i.type === 'password' ? '***' : (i.value || '').substring(0, 20) }))
      )
    }
    console.log('[sgk-borc-sorgula] sayfadaki inputlar:', JSON.stringify(await inputlariListele(), null, 2))

    // Formu doldur - Turkce karakterler hem orijinal hem ASCII eslenigiyle aranir
    const doldurmaRaporu = await sayfadaDoldur(page, [
      { anahtar: 'kullaniciAdi', desen: 'kullanıcı adı|kullanici adi|kullanıcı|kullanici|username|user', deger: kullaniciAdi },
      { anahtar: 'sistemSifre', desen: 'sistem şifresi|sistem sifresi|sistem şifre|sistem sifre|sistem', deger: sistemSifre },
      { anahtar: 'isyeriSifre', desen: 'işyeri şifresi|isyeri sifresi|işyeri şifre|isyeri sifre|isyeri', deger: isyeriSifre }
    ])
    console.log('[sgk-borc-sorgula] doldurma raporu:', doldurmaRaporu)

    // Yedek 1: input id/name/placeholder uzerinden doldur
    if (!doldurmaRaporu.kullaniciAdi || !doldurmaRaporu.sistemSifre || !doldurmaRaporu.isyeriSifre) {
      console.log('[sgk-borc-sorgula] sayfadaDoldur yeterli olmadi, JS fallback calisiyor...')
      await page.evaluate(({ kullaniciAdi, sistemSifre, isyeriSifre }) => {
        function normalize(s) { return String(s || '').toLocaleLowerCase('tr').replace(/[\s_\-]/g, '') }
        function degerYaz(el, v) {
          if (!el) return
          const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : null
          const setter = proto && Object.getOwnPropertyDescriptor(proto, 'value')?.set
          if (setter) setter.call(el, v)
          else el.value = v
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
          el.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
          el.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }))
        }
        const inputs = Array.from(document.querySelectorAll('input'))
        const kullEl = inputs.find(i => {
          const n = normalize(i.name + ' ' + i.id + ' ' + i.placeholder)
          return /kullan[iı]c[iı]|username|user/.test(n)
        })
        const sistemSifreEl = inputs.find(i => {
          const n = normalize(i.name + ' ' + i.id + ' ' + i.placeholder)
          return /sistem[sş]ifre|sistemparola|systempassword/.test(n)
        })
        const isyeriSifreEl = inputs.find(i => {
          const n = normalize(i.name + ' ' + i.id + ' ' + i.placeholder)
          return /i[sş]yeri[sş]ifre|i[sş]yeriparola|workpassword|workplacepassword/.test(n)
        })
        if (kullEl && !kullEl.value) degerYaz(kullEl, kullaniciAdi)
        if (sistemSifreEl && !sistemSifreEl.value) degerYaz(sistemSifreEl, sistemSifre)
        if (isyeriSifreEl && !isyeriSifreEl.value) degerYaz(isyeriSifreEl, isyeriSifre)
      }, { kullaniciAdi, sistemSifre, isyeriSifre })
    }

    // Yedek 2: Puppeteer page.type ile doldur (React/Angular input'lar icin daha guvenli)
    async function typeIleDoldur() {
      const inputs = await page.$$('input')
      let doldurulan = 0
      for (const inp of inputs) {
        try {
          const info = await inp.evaluate(el => ({
            type: el.type,
            name: el.name,
            id: el.id,
            placeholder: el.placeholder
          }))
          const n = String(info.name + ' ' + info.id + ' ' + info.placeholder).toLocaleLowerCase('tr').replace(/[\s_\-]/g, '')
          let value = null
          if (/kullan[iı]c[iı]|username|user/.test(n)) value = kullaniciAdi
          else if (/sistem[sş]ifre|sistemparola|systempassword/.test(n)) value = sistemSifre
          else if (/i[sş]yeri[sş]ifre|i[sş]yeriparola|workpassword|workplacepassword/.test(n)) value = isyeriSifre
          if (value) {
            await inp.click({ clickCount: 3 })
            await inp.type(value, { delay: 10 })
            doldurulan++
          }
        } catch (e) {}
      }
      return doldurulan
    }

    const doldurulanSayisi = Object.values(doldurmaRaporu).filter(Boolean).length
    if (doldurulanSayisi < 3) {
      const typeSayisi = await typeIleDoldur()
      console.log('[sgk-borc-sorgula] page.type ile doldurulan:', typeSayisi)
    }

    await new Promise(r => setTimeout(r, 500))
    console.log('[sgk-borc-sorgula] doldurma sonrasi inputlar:', JSON.stringify(await inputlariListele(), null, 2))

    // Kullanici adinin yanindaki ikinci kutu (tire ile verilen ek)
    if (kullaniciEki) {
      try {
        const ekiSonuc = await page.evaluate((eki) => {
          const gorunur = (el) => el.offsetParent !== null || el.getClientRects().length > 0
          function yaz(el, v) {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
            if (setter) setter.call(el, v)
            else el.value = v
            el.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
            el.dispatchEvent(new Event('input', { bubbles: true }))
            el.dispatchEvent(new Event('change', { bubbles: true }))
            el.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
          }
          const inputs = [...document.querySelectorAll('input')]
          const dolu = inputs.find(i => gorunur(i) && (i.type === 'text' || i.type === 'number' || !i.type) && /^\d{9,11}$/.test((i.value || '').trim()))
          if (!dolu) return { ok: false, neden: 'kullanici-kutusu-bulunamadi' }
          const satir = dolu.closest('tr') || dolu.closest('td')?.parentElement || dolu.parentElement
          const aday = satir
            ? [...satir.querySelectorAll('input')].filter(i => i !== dolu && gorunur(i) && (i.type === 'text' || i.type === 'number' || !i.type) && !i.value)
            : []
          if (aday.length === 0) return { ok: false, neden: 'ek-kutusu-bulunamadi' }
          yaz(aday[0], eki)
          return { ok: true, kutu: aday[0].name || aday[0].id || 'isimsiz' }
        }, kullaniciEki)
        console.log('[sgk-borc-sorgula] kullanici eki doldurma:', JSON.stringify(ekiSonuc))
      } catch (e) {
        console.log('[sgk-borc-sorgula] kullanici eki hatasi:', e.message)
      }
    } else {
      console.log('[sgk-borc-sorgula] not: isyeri kodu bos - ikinci kutu doldurulmadi. Musteri profilinde "Isyeri Kodu" alanini doldurun')
    }

    // Guvenlik anahtari: sunucu resmi (<img src="/WPEB/PG">) Node tarafinda
    // Tesseract.js ile okunur; okunursa doldurulup GIRIS'e basilir.
    // Kod yanlis okunursa giris reddedilir, yeni kodla tekrar denenir (max 3).
    async function captchaDoldurVeGiris(deneme) {
      // 1) Captcha inputu ve resim kaynagini bul
      const captchaBilgi = await page.evaluate(() => {
        const inp = document.querySelector('input[name="isyeri_guvenlik"], input[id="isyeri_guvenlik"]')
        const img = document.querySelector('img[src="/WPEB/PG"]') ||
          [...document.querySelectorAll('img')].find(i => /^\/WPEB\/PG/i.test(i.getAttribute('src') || ''))
        return {
          inputVar: !!inp,
          inputName: inp ? (inp.name || inp.id) : null,
          imgSrc: img ? (img.getAttribute('src') || img.src) : null
        }
      })
      console.log(`[sgk-borc-sorgula] captcha bilgi:`, JSON.stringify(captchaBilgi))
      if (!captchaBilgi.inputVar || !captchaBilgi.imgSrc) {
        return { ok: false, neden: !captchaBilgi.inputVar ? 'input-yok' : 'resim-yok' }
      }

      // 2) Resmi isle (gri/3x/beyaz-zemin) ve base64 olarak al (cache kirma)
      const imgSrc = captchaBilgi.imgSrc.replace(/\?.*$/, '') + '?_=' + Date.now()
      const base64 = await sayfaResimBase64Islenmis(page, imgSrc)
      console.log(`[sgk-borc-sorgula] resim alindi:`, base64 ? (base64.substring(0, 60) + '...') : 'YOK')
      if (!base64) return { ok: false, neden: 'resim-alinamadi' }

      // 3) Node tarafinda OCR
      let kod = null
      const metin = await tesseractOku(base64, '0123456789', '8')
      kod = (metin.match(/\d{4}/) || metin.match(/\d{3,6}/) || [null])[0]
      console.log(`[sgk-borc-sorgula] OCR deneme ${deneme}: ham="${metin}" kod=`, kod)

      // 3b) OCR basarisizsa 2captcha dene
      if (!kod && CAPTCHA_API_KEY) {
        try {
          const cozum = await coz2captcha(base64, 60000)
          kod = (cozum.match(/\d{4}/) || cozum.match(/\d{3,6}/) || [null])[0]
          console.log(`[sgk-borc-sorgula] 2captcha deneme ${deneme}: ham="${cozum}" kod=`, kod)
        } catch (e) {
          console.log('[sgk-borc-sorgula] 2captcha hatasi:', e.message)
        }
      }

      if (!kod) return { ok: false, neden: 'kod-okunamadi', ham: metin }

      // 4) Kodu yaz ve GIRIS'e bas
      const doldu = await page.evaluate((k) => {
        const inp = document.querySelector('input[name="isyeri_guvenlik"], input[id="isyeri_guvenlik"]')
        if (!inp) return false
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        if (setter) setter.call(inp, k)
        else inp.value = k
        inp.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
        inp.dispatchEvent(new Event('input', { bubbles: true }))
        inp.dispatchEvent(new Event('change', { bubbles: true }))
        inp.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
        return true
      }, kod)
      if (!doldu) return { ok: false, neden: 'input-yok' }
      await new Promise(r => setTimeout(r, 200))
      await page.evaluate(() => {
        const giris = document.querySelector('input[name="btnSubmit"], #buttonOK')
        if (giris) giris.click()
      })
      return { ok: true, kod }
    }

    let captchaOk = false
    try {
      for (let deneme = 1; deneme <= 3; deneme++) {
        const r = await captchaDoldurVeGiris(deneme)
        if (!r.ok) { console.log('[sgk-borc-sorgula] captcha:', JSON.stringify(r), '- kullaniciya birakiliyor'); break }
        await new Promise(r2 => setTimeout(r2, 2500))
        const url = page.url() || ''
        if (!/loginldap|login/i.test(url)) { captchaOk = true; break }
        console.log(`[sgk-borc-sorgula] deneme ${deneme}: giris kabul edilmedi, yeni kodla tekrar`)
      }
      console.log('[sgk-borc-sorgula] captcha otomatik giris:', captchaOk ? 'BASARILI' : 'tamamlanamadi')
    } catch (e) {
      console.log('[sgk-borc-sorgula] captcha hatasi:', e.message)
    }

    // Giris sonrasi asagidaki adimlari otomatik yap
    let borc = null
    let gz = null
    const t0 = Date.now()

    // 1. Asama: Ana sayfaya ulasma ve borc goruntuleme linkini tiklama
    const asama1 = await new Promise(async (resolve) => {
      const interval = setInterval(async () => {
        try {
          if (Date.now() - t0 > 5 * 60 * 1000) { clearInterval(interval); resolve(false); return }
          const url = page.url() || ''
          if (/loginldap|login/i.test(url)) return
          // Eger dogrudan borc sayfasina yonlendiyse tiklamaya gerek yok
          if (/donemselborc|isverenborcsorgu/i.test(url)) {
            clearInterval(interval)
            resolve(true)
            return
          }
          // Ana sayfadaysak borc goruntuleme linkini ara ve tikla
          const bulundu = await page.evaluate(() => {
            const normalize = (s) => (s || '').toLocaleUpperCase('tr').replace(/\s+/g, ' ').trim()
            const link = [...document.querySelectorAll('a, button, span, td, div')].find(el => {
              const t = normalize(el.textContent)
              return t.includes('ISVEREN') && t.includes('BORC') && t.includes('GORUNTULEME')
            })
            if (link) { link.click(); return true }
            return false
          })
          if (bulundu) { clearInterval(interval); resolve(true) }
        } catch (e) { /* yoksay */ }
      }, 3000)
    })

    if (!asama1) {
      return { not: 'Giris tamamlandi ancak Isveren Borc Goruntuleme linkine ulasilamadi.' }
    }

    // 2. Asama: Tablo yuklenene kadar bekle ve degerleri oku
    await new Promise(async (resolve) => {
      const interval = setInterval(async () => {
        try {
          if (Date.now() - t0 > 6 * 60 * 1000) { clearInterval(interval); resolve(); return }
          const sonuc = await page.evaluate(() => {
            const normalize = (s) => (s || '').toLocaleUpperCase('tr').replace(/\s+/g, ' ').trim()
            const parsePara = (s) => {
              if (!s) return null
              const m = String(s).match(/([\d.,]+)/)
              if (!m) return null
              const temiz = m[1].replace(/\./g, '').replace(/,/g, '.')
              const v = parseFloat(temiz)
              return isNaN(v) ? null : v
            }

            // Satirlar uzerinden "Sadece Borclar Toplami" ve "GZ" baslikli hucreleri bul
            const hucreler = [...document.querySelectorAll('td, th, div, span')]
            let borcDeger = null
            let gzDeger = null
            let toplamDeger = null

            function satirdakiSayiyiBul(el) {
              const row = el.closest('tr, div, td')
              if (row) {
                const sayilar = [...row.querySelectorAll('td, span, div, th')].map(x => parsePara(x.textContent)).filter(v => v !== null)
                if (sayilar.length > 0) return sayilar[sayilar.length - 1]
              }
              const kardes = el.nextElementSibling
              if (kardes) {
                const v = parsePara(kardes.textContent)
                if (v !== null) return v
              }
              return null
            }

            for (const el of hucreler) {
              const t = normalize(el.textContent)
              // Borc etiketleri
              if (
                (t.includes('SADECE') && t.includes('BORC') && t.includes('TOPLAM')) ||
                (t.includes('ANA') && t.includes('BORC')) ||
                (t.includes('ASIL') && t.includes('BORC')) ||
                t === 'BORC'
              ) {
                if (borcDeger === null) borcDeger = satirdakiSayiyiBul(el)
              }
              // Gecikme zammi etiketleri
              if (
                (t.includes('GECIKME') && t.includes('ZAM')) ||
                (t.includes('GECIKME') && t.includes('FAIZ')) ||
                t === 'GZ'
              ) {
                if (gzDeger === null) gzDeger = satirdakiSayiyiBul(el)
              }
              // Toplam etiketi (yedek)
              if (
                (t.includes('TOPLAM') && t.includes('BORC')) ||
                t === 'TOPLAM'
              ) {
                if (toplamDeger === null) toplamDeger = satirdakiSayiyiBul(el)
              }
            }

            // Yedek: tum tablodaki son iki sayisal deger (sag alt kose)
            if (borcDeger === null || gzDeger === null) {
              const tablo = document.querySelector('table')
              if (tablo) {
                const tumSayilar = [...tablo.querySelectorAll('td, th')]
                  .map(td => parsePara(td.textContent))
                  .filter(v => v !== null)
                if (tumSayilar.length >= 2) {
                  if (borcDeger === null) borcDeger = tumSayilar[tumSayilar.length - 2]
                  if (gzDeger === null) gzDeger = tumSayilar[tumSayilar.length - 1]
                } else if (tumSayilar.length === 1) {
                  if (borcDeger === null) borcDeger = tumSayilar[0]
                }
              }
            }

            // Eger toplam varsa borc+gz toplamini kontrol edelim
            if (borcDeger !== null && gzDeger !== null && toplamDeger !== null) {
              // tutarli
            } else if (borcDeger === null && toplamDeger !== null) {
              borcDeger = toplamDeger
            }

            return { borcDeger, gzDeger }
          })

          if (sonuc.borcDeger !== null || sonuc.gzDeger !== null) {
            borc = sonuc.borcDeger
            gz = sonuc.gzDeger
            clearInterval(interval)
            resolve()
          }
        } catch (e) { /* yoksay */ }
      }, 3000)
    })

    const sadeceBorclar = borc ?? 0
    const gecikmeZammi = gz ?? 0
    const toplam = sadeceBorclar + gecikmeZammi

    return {
      sadeceBorclar,
      gecikmeZammi,
      toplam,
      not: borc !== null || gz !== null
        ? `Sadece Borclar Toplami: ${sadeceBorclar.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL, GZ: ${gecikmeZammi.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL, Toplam: ${toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
        : 'Borc tablosuna ulasildi ancak tutarlar okunamadi.'
    }
  },

  // ----- 10) e-Tebligatlarim: SGK / Vergi / PTT e-tebligatlarini indirme -----
  // turkiye.gov.tr/e-tebligatlarim -> giris (captcha kullaniciya) ->
  // listede kurum filtresiyle Goruntule linkleri tek tek acilir, PDF'ler
  // "indirilenler" klasorune duser; web tarafi MUBiS'e yukler.
  'etebligat-indir': async (p) => {
    const tc = p.tc
    const sifre = p.edevletSifre
    if (!tc || !sifre) throw new Error('e-Devlet giris bilgileri yok: musteri kaydinda TC ve e-Devlet sifresi olmali')
    const page = await edevletSayfaHazirla('https://www.turkiye.gov.tr/e-tebligatlarim', tc, sifre)
    arkaPlan(() => etebligatlariIndir(page, p.kaynak))
    return { not: 'e-Devlet giris ekrani acildi ve bilgiler dolduruldu. Guvenlik kodunu girip GIRIS\'e basin. Giris sonrasi e-Tebligatlar listesi otomatik okunur ve belgeler indirilir; indirilenler MUBiS\'e yuklenir.' }
  },

  // ----- 11) Vergi borcu sorgulama (GIB portal) -----
  // dijital.gib.gov.tr/portal/login -> kullanici kodu + parola (otomatik) ->
  // guvenlik kodu kullaniciya birakilir -> giris sonrasi "Vadesi Gecmis Borclar"
  // kutusundaki rakam okunur.
  'gib-borc-sorgula': async (p) => {
    const kull = p.kullaniciKodu || p.dvs_username || CONFIG.gib?.kullaniciKodu
    const parola = p.parola || p.dvs_password || CONFIG.gib?.parola
    if (!kull || !parola) throw new Error('GIB giris bilgileri yok: musteri kaydinda kullanici kodu/parola eksik')

    console.log('[gib-borc-sorgula] basladi. Kullanici:', kull ? 'VAR' : 'YOK', 'Parola:', parola ? 'VAR' : 'YOK')

    const page = await sayfaAc('https://dijital.gib.gov.tr/portal/login')

    // Sayfanin tam yuklenmesini bekle (input'lar SPA ile gec yuklenebilir)
    try {
      await page.waitForFunction(
        () => document.querySelectorAll('input').length >= 2,
        { timeout: 20000 }
      )
    } catch (e) {
      console.log('[gib-borc-sorgula] input yuklenmesi beklenen surede olmadi, yine de dene')
    }
    await new Promise(r => setTimeout(r, 1500))

    // Tum inputlari (iframe/shadow dahil) bulan yardimci
    async function tumInputlariBul() {
      return page.evaluate(() => {
        const sonuc = []
        function ekle(el) {
          if (el && el.tagName === 'INPUT') {
            sonuc.push({
              name: el.name || '',
              id: el.id || '',
              type: el.type || '',
              placeholder: el.placeholder || '',
              ariaLabel: el.getAttribute('aria-label') || '',
              value: el.type === 'password' ? '***' : (el.value || '').substring(0, 30),
              shadow: false
            })
          }
        }
        function taraShadow(root) {
          if (!root) return
          root.querySelectorAll('input').forEach(ekle)
          root.querySelectorAll('*').forEach(el => {
            if (el.shadowRoot) taraShadow(el.shadowRoot)
          })
        }
        document.querySelectorAll('input').forEach(ekle)
        document.querySelectorAll('*').forEach(el => {
          if (el.shadowRoot) taraShadow(el.shadowRoot)
        })
        return sonuc
      })
    }

    console.log('[gib-borc-sorgula] sayfadaki inputlar:', JSON.stringify(await tumInputlariBul(), null, 2))

    // 1. Once iframe icindeki formu doldurmayi dene
    async function iframeDoldur() {
      const frames = page.frames()
      let doldurulan = 0
      for (const fr of frames) {
        try {
          const url = fr.url()
          if (!url || (!/dijital\.gib\.gov\.tr/i.test(url) && !/gib\.gov\.tr/i.test(url))) continue
          const r = await fr.evaluate(({ kull, parola }) => {
            function normalize(s) { return String(s || '').toLocaleLowerCase('tr').replace(/[\s_\-]/g, '') }
            function degerYaz(el, v) {
              if (!el) return false
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
              if (setter) setter.call(el, v)
              else el.value = v
              el.dispatchEvent(new Event('input', { bubbles: true }))
              el.dispatchEvent(new Event('change', { bubbles: true }))
              el.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
              el.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }))
              return true
            }
            const inputs = Array.from(document.querySelectorAll('input'))
            const kullEl = inputs.find(i => {
              const n = normalize(i.name + ' ' + i.id + ' ' + i.placeholder + ' ' + i.getAttribute('aria-label'))
              return /kullan[iı]c[iı]|username|userid|vkn|tckn|email/.test(n) && !i.value
            }) || inputs.find(i => i.type === 'text' && !i.value)
            const sifreEl = inputs.find(i => {
              const n = normalize(i.name + ' ' + i.id + ' ' + i.placeholder + ' ' + i.getAttribute('aria-label'))
              return /[sş]ifre|parola|password/.test(n) && !i.value
            }) || inputs.find(i => i.type === 'password' && !i.value)
            let ok = 0
            if (degerYaz(kullEl, kull)) ok++
            if (degerYaz(sifreEl, parola)) ok++
            return { ok, frameInputs: inputs.slice(0, 6).map(i => ({ name: i.name, id: i.id, type: i.type, placeholder: i.placeholder })) }
          }, { kull, parola })
          console.log('[gib-borc-sorgula] iframe doldurma:', url, JSON.stringify(r))
          if (r.ok >= 2) doldurulan = r.ok
        } catch (e) { /* frame kapali olabilir */ }
      }
      return doldurulan >= 2
    }

    // 2. Ana sayfada JS ile doldur
    async function anaSayfaDoldur() {
      return page.evaluate(({ kull, parola }) => {
        function normalize(s) { return String(s || '').toLocaleLowerCase('tr').replace(/[\s_\-]/g, '') }
        function degerYaz(el, v) {
          if (!el) return false
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
          if (setter) setter.call(el, v)
          else el.value = v
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
          el.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
          el.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }))
          return true
        }

        const inputs = Array.from(document.querySelectorAll('input'))

        const kullEl = inputs.find(i => {
          const n = normalize(i.name + ' ' + i.id + ' ' + i.placeholder + ' ' + i.getAttribute('aria-label'))
          return /kullan[iı]c[iı]|username|userid|vkn|tckn|email/.test(n) && !i.value
        }) || inputs.find(i => i.type === 'text' && !i.value)

        const sifreEl = inputs.find(i => {
          const n = normalize(i.name + ' ' + i.id + ' ' + i.placeholder + ' ' + i.getAttribute('aria-label'))
          return /[sş]ifre|parola|password/.test(n) && !i.value
        }) || inputs.find(i => i.type === 'password' && !i.value)

        const ok = []
        if (degerYaz(kullEl, kull)) ok.push('kullanici')
        if (degerYaz(sifreEl, parola)) ok.push('parola')
        return { ok, inputCount: inputs.length, kullEl: kullEl ? { name: kullEl.name, id: kullEl.id, type: kullEl.type } : null, sifreEl: sifreEl ? { name: sifreEl.name, id: sifreEl.id, type: sifreEl.type } : null }
      }, { kull, parola })
    }

    // 3. Puppeteer type ile doldur (input focus + keyboard)
    async function puppeteerTypeDoldur() {
      async function doldur(selectorSet, value, label) {
        const selectors = selectorSet.split(',').map(s => s.trim())
        for (const sel of selectors) {
          try {
            const el = await page.$(sel)
            if (el) {
              await el.click({ clickCount: 3 })
              await el.type(value, { delay: 10 })
              console.log(`[gib-borc-sorgula] ${label} type ile dolduruldu:`, sel)
              return true
            }
          } catch (e) {}
        }
        // Hicbir selector bulunamadiysa ilk bos inputu dene
        try {
          const inputs = await page.$$('input')
          for (const inp of inputs) {
            const t = await inp.evaluate(el => el.type).catch(() => '')
            if (label === 'Kullanici' && (t === 'text' || t === 'email' || t === 'tel')) {
              await inp.click({ clickCount: 3 })
              await inp.type(value, { delay: 10 })
              return true
            }
            if (label === 'Parola' && t === 'password') {
              await inp.click({ clickCount: 3 })
              await inp.type(value, { delay: 10 })
              return true
            }
          }
        } catch (e) {}
        return false
      }
      const kullDoldu = await doldur(
        'input[name*="kullanici" i], input[id*="kullanici" i], input[placeholder*="kullan" i], input[aria-label*="kullan" i], input[type="text"]',
        kull,
        'Kullanici'
      )
      const parolaDoldu = await doldur(
        'input[name*="sifre" i], input[name*="parola" i], input[id*="sifre" i], input[id*="parola" i], input[placeholder*="sifre" i], input[placeholder*="parola" i], input[type="password"]',
        parola,
        'Parola'
      )
      return { kullDoldu, parolaDoldu }
    }

    // Sirayla dene
    let anaDoldu = await anaSayfaDoldur()
    console.log('[gib-borc-sorgula] ana sayfa doldurma:', JSON.stringify(anaDoldu))

    if (!anaDoldu.ok.includes('kullanici') || !anaDoldu.ok.includes('parola')) {
      const iframeOk = await iframeDoldur()
      if (!iframeOk) {
        const typeDoldu = await puppeteerTypeDoldur()
        console.log('[gib-borc-sorgula] puppeteer type doldurma:', JSON.stringify(typeDoldu))
      }
    }

    // Son kontrol - degerler gercekten yazildi mi
    await new Promise(r => setTimeout(r, 500))
    const kontrol = await tumInputlariBul()
    console.log('[gib-borc-sorgula] doldurma sonrasi inputlar:', JSON.stringify(kontrol, null, 2))

    // Guvenlik kodunu (dogrulama kodu) Node tarafinda Tesseract.js OCR ile oku;
    // basarisiz olursa kullanici beklenir.
    async function gibCaptchaDoldurVeGiris(deneme) {
      // 1) Input ve resim bilgilerini al
      const captchaBilgi = await page.evaluate(() => {
        const gorunur = (el) => el.offsetParent !== null || el.getClientRects().length > 0
        let inp = document.querySelector('input#dk, input[name="dk"]')
        if (!inp) {
          inp = document.querySelector('input[name*="guvenlik" i], input[id*="guvenlik" i], input[placeholder*="doğrulama" i], input[placeholder*="dogrulama" i], input[aria-label*="doğrulama" i], input[aria-label*="dogrulama" i]')
        }
        if (!inp) {
          const etiketler = [...document.querySelectorAll('label, span, div')].filter(el =>
            /do[ğg]rulama|g[üu]venlik|captcha/i.test((el.textContent || '').trim()))
          for (const etiket of etiketler) {
            const hedef = etiket.querySelector('input[type=text]')
              || (etiket.htmlFor ? document.querySelector('input#' + CSS.escape(etiket.htmlFor)) : null)
            if (hedef) { inp = hedef; break }
          }
        }
        if (!inp) {
          inp = [...document.querySelectorAll('input')].find(i => gorunur(i) && i.type === 'text' && !i.value && (i.getAttribute('autocomplete') === 'off' || i.maxLength <= 6))
        }
        if (!inp) return { inputVar: false }

        const rect = inp.getBoundingClientRect()
        const tumImg = [...document.querySelectorAll('img')].filter(i => gorunur(i) && i.naturalWidth > 30 && i.naturalHeight > 10)
        let img = tumImg.find(i => /^data:image|captch|kod|guvenlik|do[ğg]rulama/i.test(i.src || i.getAttribute('src') || ''))
        if (!img) {
          img = tumImg.sort((a, b) => {
            const da = Math.hypot(a.getBoundingClientRect().left - rect.left, a.getBoundingClientRect().top - rect.top)
            const db = Math.hypot(b.getBoundingClientRect().left - rect.left, b.getBoundingClientRect().top - rect.top)
            return da - db
          })[0]
        }
        return {
          inputVar: true,
          inputName: inp.name || inp.id,
          inputSelector: inp.name ? `input[name="${inp.name}"]` : (inp.id ? `input#${inp.id}` : null),
          imgSrc: img ? (img.getAttribute('src') || img.src) : null
        }
      })
      console.log(`[gib-borc-sorgula] captcha bilgi:`, JSON.stringify(captchaBilgi))
      if (!captchaBilgi.inputVar) return { ok: false, neden: 'input-yok' }
      if (!captchaBilgi.imgSrc) return { ok: false, neden: 'resim-yok', inputAdi: captchaBilgi.inputName }

      // 2) Resmi isle (gri/3x/beyaz-zemin) ve base64 olarak al
      let base64 = null
      if (captchaBilgi.imgSrc.startsWith('data:')) {
        base64 = captchaBilgi.imgSrc
      } else {
        const imgSrc = captchaBilgi.imgSrc.replace(/\?.*$/, '') + '?_=' + Date.now()
        base64 = await sayfaResimBase64Islenmis(page, imgSrc)
      }
      console.log(`[gib-borc-sorgula] resim alindi:`, base64 ? (base64.substring(0, 60) + '...') : 'YOK')
      if (!base64) return { ok: false, neden: 'resim-alinamadi', inputAdi: captchaBilgi.inputName }

      // 3) Node tarafinda OCR
      let kod = null
      const metin = await tesseractOku(base64, '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', '8')
      kod = metin.toLowerCase()
      console.log(`[gib-borc-sorgula] OCR deneme ${deneme}: ham="${metin}" kod=`, kod)

      // 3b) OCR basarisizsa 2captcha dene
      if ((!kod || kod.length < 4) && CAPTCHA_API_KEY) {
        try {
          const cozum = await coz2captcha(base64, 60000)
          kod = cozum.toLowerCase()
          console.log(`[gib-borc-sorgula] 2captcha deneme ${deneme}: ham="${cozum}" kod=`, kod)
        } catch (e) {
          console.log('[gib-borc-sorgula] 2captcha hatasi:', e.message)
        }
      }

      if (!kod || kod.length < 4) return { ok: false, neden: 'kod-okunamadi', metin, inputAdi: captchaBilgi.inputName }

      // 4) Inputa yaz ve GIRIS butonuna bas
      const doldu = await page.evaluate(({ kod, sel }) => {
        let inp = null
        if (sel) inp = document.querySelector(sel)
        if (!inp) inp = document.querySelector('input#dk, input[name="dk"]')
        if (!inp) inp = [...document.querySelectorAll('input[type=text]')].find(i => !i.value)
        if (!inp) return false
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        if (setter) setter.call(inp, kod)
        else inp.value = kod
        inp.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
        inp.dispatchEvent(new Event('input', { bubbles: true }))
        inp.dispatchEvent(new Event('change', { bubbles: true }))
        inp.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
        return true
      }, { kod, sel: captchaBilgi.inputSelector })
      if (!doldu) return { ok: false, neden: 'input-yok' }

      await new Promise(r => setTimeout(r, 500))
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button, input[type=submit], input[type=button]')]
          .find(el => /giri[sş] yap|giri[sş]/i.test((el.value || el.textContent || '').trim()))
        if (btn) btn.click()
      })
      return { ok: true, kod }
    }

    let captchaOk = false
    try {
      for (let deneme = 1; deneme <= 3; deneme++) {
        const r = await gibCaptchaDoldurVeGiris(deneme)
        if (!r.ok) { console.log('[gib-borc-sorgula] captcha:', JSON.stringify(r), '- kullaniciya birakiliyor'); break }
        await new Promise(r2 => setTimeout(r2, 3500))
        const url = page.url() || ''
        if (!/login|giris/i.test(url)) { captchaOk = true; break }
        console.log(`[gib-borc-sorgula] deneme ${deneme}: giris kabul edilmedi, yeni kodla tekrar`)
      }
      console.log('[gib-borc-sorgula] captcha otomatik giris:', captchaOk ? 'BASARILI' : 'tamamlanamadi')
    } catch (e) {
      console.log('[gib-borc-sorgula] captcha hatasi:', e?.message || String(e), e?.stack || '')
    }

    // Guvenlik kodunu kullanici girene kadar bekle; en fazla 5 dk
    let borc = null
    const t0 = Date.now()
    while (Date.now() - t0 < 5 * 60 * 1000) {
      await new Promise(r => setTimeout(r, 2500))
      try {
        const url = page.url() || ''
        // Hala login ekranindaysak bekle
        if (/login|giris/i.test(url)) continue

        borc = await page.evaluate(() => {
          const txt = (s) => (s || '').toLocaleUpperCase('tr').replace(/\s+/g, ' ').trim()
          // 1) "VADESI GECMIS BORCLAR" etiketini bul
          const etiket = [...document.querySelectorAll('*')].find(el => {
            const t = txt(el.textContent)
            return t.includes('VADES') && t.includes('GECMIS') && t.includes('BORC')
          })
          if (!etiket) return null

          // 2) Ayni kapsayici icindeki para degerini yakala
          let node = etiket.parentElement
          for (let i = 0; i < 8 && node; i++) {
            const m = (node.textContent || '').match(/[₺TL]\s*([\d.,]+)/i) || (node.textContent || '').match(/([\d.,]+)\s*[₺TL]/i)
            if (m) {
              const s = m[1].replace(/\./g, '').replace(/,/g, '.')
              const v = parseFloat(s)
              if (!isNaN(v)) return v
            }
            node = node.parentElement
          }

          // 3) En yakin kutu/blok icinde ara
          const kutu = etiket.closest('div, td, tr, li, section, article')
          if (kutu) {
            const m = (kutu.textContent || '').match(/[₺TL]\s*([\d.,]+)/i) || (kutu.textContent || '').match(/([\d.,]+)\s*[₺TL]/i)
            if (m) {
              const s = m[1].replace(/\./g, '').replace(/,/g, '.')
              const v = parseFloat(s)
              if (!isNaN(v)) return v
            }
          }

          return null
        })

        if (borc !== null) break
      } catch (e) {
        break
      }
    }

    return {
      borc: borc ?? 0,
      not: borc !== null
        ? `Vadesi gecmis vergi borcu okundu: ${borc.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
        : 'Giris tamamlandi ancak vadesi gecmis borc tutari okunamadi.'
    }
  }
}

// ------------------------------------------------------------
// HTTP sunucu
// ------------------------------------------------------------
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  // Chrome Private Network Access: https siteden 127.0.0.1'e istek icin sart
  res.setHeader('Access-Control-Allow-Private-Network', 'true')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  // Durum sorgusu
  if (req.method === 'GET' && req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      ok: true,
      app: 'mubis-gib-yardimci',
      version: '2.1.0',
      isler: Object.keys(ISLER),
      configVar: !!CONFIG.gib
    }))
    return
  }

  // Indirilen belgeleri listele: GET /dosyalar
  if (req.method === 'GET' && req.url === '/dosyalar') {
    try {
      const dosyalar = fs.readdirSync(indirmeKlasoru)
        .filter(f => /\.(pdf|xlsx|xls)$/i.test(f))
        .map(f => {
          const st = fs.statSync(path.join(indirmeKlasoru, f))
          return { ad: f, boyut: st.size, tarih: st.mtimeMs }
        })
        .sort((a, b) => b.tarih - a.tarih)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, dosyalar }))
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: e.message }))
    }
    return
  }

  // Indirilen bir belgeyi web'e gonder: GET /dosya?ad=ornek.pdf
  // (path traversal korumasi: path.basename ile sadece klasor adi kullanilir)
  if (req.method === 'GET' && req.url.startsWith('/dosya')) {
    try {
      const u = new URL(req.url, 'http://localhost')
      const ad = path.basename(u.searchParams.get('ad') || '')
      const tamYol = path.join(indirmeKlasoru, ad)
      if (!ad || !fs.existsSync(tamYol) || !fs.statSync(tamYol).isFile()) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Dosya bulunamadi' }))
        return
      }
      res.writeHead(200, {
        'Content-Type': /\.xlsx?$/i.test(ad) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf',
        'Access-Control-Allow-Origin': '*'
      })
      fs.createReadStream(tamYol).pipe(res)
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: e.message }))
    }
    return
  }

  // Is calistir: POST /is  { is: 'gib-odeme', ...parametreler }
  if (req.method === 'POST' && req.url === '/is') {
    let govde = ''
    req.on('data', c => { govde += c })
    req.on('end', async () => {
      try {
        const p = JSON.parse(govde || '{}')
        const isFonksiyonu = ISLER[p.is]
        if (!isFonksiyonu) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: false, error: 'Bilinmeyen is: ' + p.is, mevcutIsler: Object.keys(ISLER) }))
          return
        }
        console.log('[is]', p.is)
        const sonuc = await isFonksiyonu(p)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, ...sonuc }))
      } catch (err) {
        const mesaj = (err && err.message) || String(err) || 'Bilinmeyen hata'
        console.error('[is-hatasi]', mesaj, err && err.stack ? err.stack : '')
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: mesaj }))
      }
    })
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: false, error: 'bilinmeyen istek' }))
})

// ------------------------------------------------------------
// Protokol modu: mubis-gib://odeme?p=<base64>
// Tarayici localhost isteklerini engellese bile calisir:
// Windows protokolu dogrudan bu programi baslatir.
// ------------------------------------------------------------
async function protokolIsle(gelenUrl) {
  try {
    console.log('[protokol] gelen URL:', gelenUrl)
    // Chrome mubis-gib://odeme?p=x adresini mubis-gib://odeme/?p=x olarak
    // normalize edebilir; bu yuzden URL parser kullanilir.
    let isAdi = ''
    let parametreler = {}
    try {
      const u = new URL(gelenUrl)
      isAdi = (u.hostname || '').replace(/^\/+|\/+$/g, '').toLowerCase()
      const p = u.searchParams.get('p') || ''
      if (p) {
        try {
          const json = Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
          parametreler = JSON.parse(json)
          console.log('[protokol] parametreler:', JSON.stringify(parametreler))
        } catch (parseErr) {
          console.error('[protokol] payload cozumlenemedi:', parseErr.message)
          parametreler = {}
        }
      }
    } catch (urlErr) {
      // Yedek: elle ayristir (odeme/?p=... ve odeme?p=... ikisini de destekler)
      const m = String(gelenUrl).match(/^mubis-gib:\/\/([^/?]+)\/?\??(.*)$/i)
      if (m) {
        isAdi = m[1].toLowerCase()
        const hamPayload = (m[2] || '').replace(/^\/?\??p=?/, '')
        if (hamPayload) {
          try {
            parametreler = JSON.parse(
              Buffer.from(hamPayload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
            )
          } catch (e) {
            parametreler = {}
          }
        }
      }
    }

    // Kisaltilmis adlar: odeme -> gib-odeme
    if (isAdi === 'odeme') isAdi = 'gib-odeme'

    console.log('[protokol] is:', isAdi)

    if (isAdi === 'gib-odeme') {
      const page = await sayfaAc()
      const rapor = await gibOdemeDoldur(page, parametreler)
      console.log('[protokol] rapor:', JSON.stringify(rapor))
    } else if (ISLER[isAdi]) {
      await ISLER[isAdi](parametreler)
    } else {
      const page = await sayfaAc('about:blank')
      await page.setContent(`<h3 style="font-family:sans-serif">Bilinmeyen is: ${isAdi || 'bos'}</h3>`)
    }

    // Tarayici acik kaldigi surece program da acik kalsin (max 30 dk)
    const b = await tarayiciAl()
    await new Promise(resolve => {
      const t = setTimeout(resolve, 30 * 60 * 1000)
      b.on('disconnected', () => { clearTimeout(t); resolve() })
    })
    process.exit(0)
  } catch (err) {
    const hataMesaji = err?.message || String(err) || 'Bilinmeyen hata'
    console.error('[protokol-hatasi]', hataMesaji)
    try {
      const page = await sayfaAc('about:blank')
      await page.setContent(`<h3 style="font-family:sans-serif">MUBiS GIB Yardimci hatasi:</h3><p style="font-family:sans-serif">${hataMesaji}</p>`)
      await new Promise(r => setTimeout(r, 15000))
    } catch (e) { /* yoksay */ }
    process.exit(1)
  }
}

// ------------------------------------------------------------
// TEK TIK KURULUM: exe cift tiklandiginda her seyi kendisi kurar
//   1. mubis-gib:// protokolunu kaydeder (exe kendisi calisir)
//   2. Bilgisayar acilista otomatik servis baslatir
//   3. "Kurulum tamamlandi" der, Enter ile kapanir
// ------------------------------------------------------------
function tekTikKurulum() {
  const self = process.execPath
  console.log('==========================================')
  console.log('  MUBiS GIB Yardimci - Kurulum')
  console.log('==========================================')

  // 1) Protokol kaydi (HKCU - yonetici izni gerekmez)
  exec('reg add "HKCU\\Software\\Classes\\mubis-gib" /ve /d "URL:MUBiS GIB Yardimci" /f', () => {})
  exec('reg add "HKCU\\Software\\Classes\\mubis-gib" /v "URL Protocol" /d "" /f', () => {})
  exec(`reg add "HKCU\\Software\\Classes\\mubis-gib\\shell\\open\\command" /ve /d "\\"${self}\\" --protokol \\"%1\\"" /f`, (err) => {
    if (err) console.log('[protokol] KAYIT HATASI:', err.message)
    else console.log('[1/2] Protokol kaydedildi (mubis-gib://)')
  })

  // 2) Acilista otomatik servis baslatma (VBS ile TAMAMEN GIZLI pencere)
  const vbsYolu = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'MUBiS GIB Yardimci.vbs')
  const baslangicDizini = path.dirname(vbsYolu)
  try {
    if (!fs.existsSync(baslangicDizini)) fs.mkdirSync(baslangicDizini, { recursive: true })
    // VBS Run pencere stili 0 = pencere hic gorunmez
    // Exe modda sadece exe calisir; kaynak modda node index.js --servis calismali
    const vbsKomut = isExe
      ? `"""${self}"" --servis"`
      : `"""${self}"" """${__filename}""" --servis"`
    fs.writeFileSync(vbsYolu, `CreateObject("Wscript.Shell").Run ${vbsKomut}, 0, False\r\n`)
    // Eski bat ile baslatma varsa kaldir (artik gizli vbs kullaniyoruz)
    try { fs.unlinkSync(path.join(baslangicDizini, 'MUBiS GIB Yardimci.bat')) } catch (e) { /* yoksa sorun degil */ }
    console.log('[2/2] Otomatik baslatma kuruldu (gizli):', vbsYolu)
  } catch (e) {
    console.log('[2/2] Otomatik baslatma kurulamadi:', e.message)
  }

  // 3) Servisi hemen baslat (gizli): kurulumdan sonra "Ode" dogrudan calissin
  // VBS'in hemen calismasi icin kisa bir bekleme ekleyelim
  setTimeout(() => {
    exec(`wscript.exe "${vbsYolu}"`, (err) => {
      if (err) console.log('[3/3] Servis baslatma hatasi:', err.message)
      else console.log('[3/3] Yardimci servis baslatildi (gizli)')
    })
  }, 500)

  console.log('')
  console.log('  KURULUM TAMAMLANDI!')
  console.log('  MUBiS\'te tahakkuk ekranindan "Ode" butonunu kullanabilirsiniz.')
  console.log('  Bu pencereyi kapatabilirsiniz.')
  console.log('==========================================')

  // Exe cift tiklayinca pencere hemen kapanmasin; Enter beklesin
  process.stdin.resume()
  process.stdin.once('data', () => process.exit(0))
}

// Protokol URL'sini argv icinde bul:
//   - "exe --protokol <url>" (yeni kayit)
//   - "exe <url>" (eski kayit / Windows'un url'yi dogrudan arguman olarak verdigi durumlar)
let protokolUrl = null
const protokolIdx = process.argv.indexOf('--protokol')
if (protokolIdx >= 0 && process.argv[protokolIdx + 1]) {
  protokolUrl = process.argv[protokolIdx + 1]
} else {
  const urlArg = process.argv.slice(1).find(a => /^mubis-gib:\/\//i.test(a))
  if (urlArg) protokolUrl = urlArg
}
if (protokolUrl) {
  protokolIsle(protokolUrl)
} else if (process.argv.includes('--servis')) {
  // Arka plan servisi: konsol penceresi acma, log dosyasina yaz
  process.stdout.write = () => {}
  process.stderr.write = () => {}
  server.on('error', (err) => {
    console.error('[servis] sunucu hatasi:', err.message)
    // Port dolu ise muhtemelen baska bir ornek zaten calisiyor
    if (err.code === 'EADDRINUSE') process.exit(0)
  })
  server.listen(PORT, '127.0.0.1', () => {
    console.log('==========================================')
    console.log('MUBiS GIB Yardimci Servisi calisiyor')
    console.log('Port: ' + PORT)
    console.log('Indirilenler: ' + indirmeKlasoru)
    console.log('==========================================')
  })
} else {
  tekTikKurulum()
}
