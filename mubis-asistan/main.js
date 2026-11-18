// MUBiS Masaustu Asistani - Kopek / Kedi / Kalem
// Yardimci program tarafindan --ayar=<dosya> parametresiyle baslatilir.
// Ayar dosyasi hem yardimci hem asistan tarafindan yazilabilir; fs.watch ile
// canli uygulanir (karakter degisimi aninda gecerli olur).
const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, screen, shell } = require('electron')
const path = require('path')
const fs = require('fs')

app.setAppUserModelId('com.mubis.asistan')

const POZLAR = ['oturuyor', 'yuruyor', 'kosuyor', 'oynuyor', 'uyuyor', 'pativeriyor', 'havliyor', 'zipliyor']
const KARAKTERLER = { kopek: 'Kopek', kedi: 'Kedi', kalem: 'Kalem' }

// ---- Ayar dosyasi ----
const ayarArg = (process.argv.find(a => a.startsWith('--ayar=')) || '').split('=')[1]
const portableDir = process.env.PORTABLE_EXECUTABLE_DIR || __dirname
const AYAR_YOLU = ayarArg || path.join(portableDir, 'asistan.json')
const HATIRLATMA_YOLU = path.join(path.dirname(AYAR_YOLU), 'asistan-hatirlatmalar.json')

const VARSAYILAN = {
  acik: false,
  karakter: 'kopek',
  hiz: 1,          // 0.5 = yavas, 1 = normal, 2 = hizli
  geziyor: true,
  sesliYanit: true,
  ai: { adres: 'https://api.openai.com/v1/chat/completions', anahtar: '', model: 'gpt-4o-mini' }
}

function ayarOku() {
  try { return { ...VARSAYILAN, ...JSON.parse(fs.readFileSync(AYAR_YOLU, 'utf8')) } }
  catch { return { ...VARSAYILAN } }
}
function ayarYaz(kismi) {
  const birlesik = { ...ayarOku(), ...kismi }
  try { fs.writeFileSync(AYAR_YOLU, JSON.stringify(birlesik, null, 2)) } catch (e) {}
  return birlesik
}
function hatirlatmalarOku() {
  try { return JSON.parse(fs.readFileSync(HATIRLATMA_YOLU, 'utf8')) } catch { return [] }
}
function hatirlatmalarYaz(liste) {
  try { fs.writeFileSync(HATIRLATMA_YOLU, JSON.stringify(liste, null, 2)) } catch (e) {}
  return liste
}

let AYAR = ayarOku()

// ---- Durum ----
let petWin = null, chatWin = null, ayarWin = null, tray = null
let poz = 'oturuyor'
let yon = 1
let geziTimer = null, idleTimer = null, hatirlatmaTimer = null

// ---- Pencere olusturma ----
function petPenceresiOlustur() {
  const wa = screen.getPrimaryDisplay().workArea
  petWin = new BrowserWindow({
    width: 240, height: 260,
    x: wa.x + wa.width - 280, y: wa.y + wa.height - 300,
    transparent: true, frame: false, hasShadow: false,
    alwaysOnTop: true, skipTaskbar: true, resizable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  })
  petWin.setAlwaysOnTop(true, 'screen-saver')
  petWin.loadFile(path.join(__dirname, 'renderer', 'index.html'))
}

function gonder(kanal, veri) {
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send(kanal, veri)
}

function pozAyarla(p, sure = 0) {
  if (!POZLAR.includes(p)) return
  poz = p
  gonder('poz', p)
  if (sure > 0) setTimeout(() => {
    if (poz === p && AYAR.geziyor) pozAyarla('yuruyor')
  }, sure)
}

function konus(metin, p = '') {
  gonder('konus', metin)
  if (p) pozAyarla(p, 4000)
  if (AYAR.sesliYanit) seslendir(metin)
}

function seslendir(metin) {
  // TTS renderer tarafinda yapilir (Windows sesleri orada erisilir)
  gonder('tts', String(metin || '').substring(0, 300))
}

// ---- Gezi motoru ----
function geziyiBaslat() {
  clearInterval(geziTimer)
  geziTimer = setInterval(() => {
    if (!petWin || petWin.isDestroyed() || !AYAR.geziyor) return
    if (!['yuruyor', 'kosuyor'].includes(poz)) return
    const b = screen.getPrimaryDisplay().workArea
    const [x] = petWin.getPosition()
    const adim = (poz === 'kosuyor' ? 3 : 1.4) * (AYAR.hiz || 1)
    let yeni = x + yon * adim
    if (yeni < b.x + 4) { yeni = b.x + 4; yon = 1; gonder('yon', 1) }
    if (yeni > b.x + b.width - 244) { yeni = b.x + b.width - 244; yon = -1; gonder('yon', -1) }
    petWin.setPosition(Math.round(yeni), undefined)
  }, 33)
}

// ---- Rastgele davranis ----
function davranisDongusunuBaslat() {
  clearInterval(idleTimer)
  idleTimer = setInterval(() => {
    if (!AYAR.geziyor) return
    const r = Math.random()
    if (r < 0.18) { pozAyarla('uyuyor'); setTimeout(() => { if (poz === 'uyuyor' && AYAR.geziyor) pozAyarla('yuruyor') }, 14000) }
    else if (r < 0.36) { pozAyarla('oynuyor'); setTimeout(() => { if (poz === 'oynuyor' && AYAR.geziyor) pozAyarla('yuruyor') }, 9000) }
    else if (r < 0.5) { pozAyarla('oturuyor'); setTimeout(() => { if (poz === 'oturuyor' && AYAR.geziyor) pozAyarla('yuruyor') }, 12000) }
    else if (r < 0.58) { pozAyarla('pativeriyor'); setTimeout(() => { if (poz === 'pativeriyor' && AYAR.geziyor) pozAyarla('yuruyor') }, 6000) }
    else if (r < 0.66) { konus(rastgeleSoz()) }
  }, 28000)
}

const SOZLER = [
  'Merhaba! Bugün de harika bir gün olacak!',
  'Biraz mola verelim mi?',
  'Çalışmaya devam! 💪',
  'Sana nasıl yardımcı olabilirim?',
  'Unutmayın: düzenli kayıt, rahat muhasebe!',
  'Biraz dollaşayım 🐾',
  'Sorularınız için ben buradayım!',
  'Hav hav! Her şey yolunda mı?'
]
const rastgeleSoz = () => SOZLER[Math.floor(Math.random() * SOZLER.length)]

// ---- Hatirlatmalar ----
function hatirlatmaKontrolunuBaslat() {
  clearInterval(hatirlatmaTimer)
  hatirlatmaTimer = setInterval(() => {
    const liste = hatirlatmalarOku()
    const simdi = Date.now()
    let degisti = false
    for (const h of liste) {
      if (!h.gosterildi && h.zaman <= simdi) {
        h.gosterildi = true
        degisti = true
        konus(`Hatirlatma: ${h.metin}`)
        try {
          new Notification({ title: 'MUBiS Asistan Hatirlatma', body: h.metin }).show()
        } catch (e) {}
      }
    }
    if (degisti) hatirlatmalarYaz(liste)
  }, 20000)
}

// ---- Sohbet / AI ----
async function aiCevap(metin) {
  const ai = AYAR.ai || {}
  if (!ai.anahtar) {
    return 'Soru-cevap icin yapay zeka anahtari gerekiyor. Asistan Ayarlari > Yapay Zeka bolumunden anahtar girin. Yine de komutlarimi anlarim: "MUBiS\'i ac", "hatirlat", "yuru", "uyu" gibi.'
  }
  const adres = ai.adres || 'https://api.openai.com/v1/chat/completions'
  try {
    const r = await fetch(adres, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ai.anahtar },
      body: JSON.stringify({
        model: ai.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Sen MUBiS ERP programinin sevimli masaustu asistanisin. Turkce, kisa, samimi ve yararli cevap ver. Muhasebe, vergi, SGK ve MUBiS ERP kullanimi konularinda uzmanisin. Cevaplarin en fazla 3 cumle olsun.' },
          { role: 'user', content: metin }
        ],
        max_tokens: 300
      })
    })
    const j = await r.json()
    const cv = j?.choices?.[0]?.message?.content
    if (!cv) return 'Yapay zekadan cevap alamadim: ' + (j?.error?.message || 'bilinmeyen hata')
    return cv.trim()
  } catch (e) {
    return 'Yapay zekaya ulasamadim: ' + (e.message || 'ag hatasi')
  }
}

async function sohbetIsle(metin) {
  const kucuk = String(metin).toLocaleLowerCase('tr')
  // Komutlar (once yerelden)
  if (/mubis|erp/.test(kucuk) && /(ac|aç|goster|göster)/.test(kucuk)) {
    konus('MUBiS\'i aciyorum!', 'pativeriyor')
    shell.openExternal('https://www.mubiserp.com.tr')
    return 'MUBiS acildi!'
  }
  if (/hatirlat|hatırlat/.test(kucuk)) {
    const dk = (kucuk.match(/(\d+)\s*(dakika|dk)/) || [])[1]
    const saat = (kucuk.match(/(\d+)\s*(saat)/) || [])[1]
    const sureMs = dk ? dk * 60000 : saat ? saat * 3600000 : 60000
    const metin = String(metin).replace(/.*hat[iı]rlat.?(bana)?\s*(\d+\s*(dakika|dk|saat))?\s*(sonra|icin|için)?\s*:?\s*/i, '').trim() || 'Hatirlatma'
    const liste = hatirlatmalarOku()
    liste.push({ id: Date.now(), metin, zaman: Date.now() + sureMs, gosterildi: false })
    hatirlatmalarYaz(liste)
    konus('Tamam, hatirlaticiye ekledim!', 'pativeriyor')
    return `"${metin}" icin hatirlatma kuruldu (${dk ? dk + ' dakika' : saat ? saat + ' saat' : '1 dakika'} sonra).`
  }
  if (/(uyu|uyu)/.test(kucuk)) { pozAyarla('uyuyor'); return 'Tamam, biraz uyuyorum...' }
  if (/(uyan|kalk)/.test(kucuk)) { pozAyarla('zipliyor', 5000); return 'Uyandim! Gunaydin!' }
  if (/vergi takvimi|takvim/.test(kucuk)) {
    konus('Vergi takvimini aciyorum!', 'pativeriyor')
    shell.openExternal('https://www.mubiserp.com.tr')
    return 'Vergi takvimi MUBiS\'te acildi.'
  }
  if (/yuru|yürü|gezmeye/.test(kucuk)) { pozAyarla('yuruyor'); AYAR.geziyor = true; return 'Yuruyorum!' }
  if (/kos|koş/.test(kucuk)) { pozAyarla('kosuyor'); return 'Kosuyorum!' }
  if (/oyna/.test(kucuk)) { pozAyarla('oynuyor'); return 'Oynuyorum!' }
  if (/(kapat|kapan)/.test(kucuk) && /asistan|kopek|kedi|kalem/.test(kucuk)) {
    konus('Gorusuruz!', 'zipliyor')
    setTimeout(() => app.quit(), 2500)
    return 'Kapatiliyorum...'
  }
  // Degilse AI'a sor
  return aiCevap(metin)
}

// ---- Sohbet penceresi ----
function sohbetAc() {
  if (chatWin && !chatWin.isDestroyed()) { chatWin.focus(); return }
  chatWin = new BrowserWindow({
    width: 400, height: 540, frame: false, resizable: false,
    backgroundColor: '#0f172a', parent: undefined, skipTaskbar: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  })
  chatWin.loadFile(path.join(__dirname, 'renderer', 'chat.html'))
  chatWin.on('closed', () => { chatWin = null })
}

// ---- Ayarlar penceresi ----
function ayarlarAc() {
  if (ayarWin && !ayarWin.isDestroyed()) { ayarWin.focus(); return }
  ayarWin = new BrowserWindow({
    width: 460, height: 640, frame: false, resizable: false,
    backgroundColor: '#0f172a',
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  })
  ayarWin.loadFile(path.join(__dirname, 'renderer', 'ayarlar.html'))
  ayarWin.on('closed', () => { ayarWin = null })
}

// ---- Menuler ----
function menuTemplate() {
  return [
    { label: 'Konuş', click: () => konus(rastgeleSoz()) },
    { label: 'Sohbet Aç', click: () => sohbetAc() },
    { type: 'separator' },
    { label: 'Poz', submenu: POZLAR.map(p => ({ label: p, click: () => pozAyarla(p) })) },
    { label: 'Gezmeyi Durdur', type: 'checkbox', checked: !AYAR.geziyor, click: (m) => { AYAR = ayarYaz({ geziyor: !m.checked }); if (AYAR.geziyor) pozAyarla('yuruyor') } },
    { label: 'Hız', submenu: [
      { label: 'Yavaş', type: 'radio', checked: AYAR.hiz === 0.5, click: () => { AYAR = ayarYaz({ hiz: 0.5 }) } },
      { label: 'Normal', type: 'radio', checked: AYAR.hiz === 1, click: () => { AYAR = ayarYaz({ hiz: 1 }) } },
      { label: 'Hızlı', type: 'radio', checked: AYAR.hiz === 2, click: () => { AYAR = ayarYaz({ hiz: 2 }) } }
    ] },
    { label: 'Sesli Yanıt', type: 'checkbox', checked: !!AYAR.sesliYanit, click: (m) => { AYAR = ayarYaz({ sesliYanit: m.checked }) } },
    { type: 'separator' },
    { label: 'MUBiS\'i Aç', click: () => shell.openExternal('https://www.mubiserp.com.tr') },
    { label: 'Hatırlatma Ekle', click: () => ayarlarAc() },
    { label: 'Ayarlar', click: () => ayarlarAc() },
    { type: 'separator' },
    { label: 'Kapat', click: () => app.quit() }
  ]
}

function trayOlustur() {
  const ikon = path.join(__dirname, 'assets', AYAR.karakter, 'oturuyor.png')
  try { tray = new Tray(fs.existsSync(ikon) ? ikon : path.join(__dirname, 'assets', 'kopek', 'oturuyor.png')) } catch (e) { return }
  tray.setToolTip('MUBiS Asistani - ' + (KARAKTERLER[AYAR.karakter] || 'Kopek'))
  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate()))
}

function menuAc() { Menu.buildFromTemplate(menuTemplate()).popup({ window: petWin }) }

// ---- IPC ----
ipcMain.on('surukle', (e, dx, dy) => {
  if (!petWin || petWin.isDestroyed()) return
  const [x, y] = petWin.getPosition()
  petWin.setPosition(x + dx, y + dy)
})
ipcMain.on('menu-ac', () => menuAc())
ipcMain.on('sohbet-ac', () => sohbetAc())
ipcMain.on('ayarlar-ac', () => ayarlarAc())
ipcMain.on('konus-iste', () => konus(rastgeleSoz()))
ipcMain.handle('sohbet-gonder', async (e, metin) => {
  const cevap = await sohbetIsle(metin)
  konus(cevap)
  if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send('sohbet-yanit', cevap)
  return cevap
})
ipcMain.handle('ayar-getir', () => ({ ...AYAR, hatirlatmalar: hatirlatmalarOku() }))
ipcMain.handle('ayar-kaydet', (e, yeni) => {
  AYAR = ayarYaz({
    karakter: KARAKTERLER[yeni.karakter] ? yeni.karakter : AYAR.karakter,
    hiz: Number(yeni.hiz) || 1,
    geziyor: !!yeni.geziyor,
    sesliYanit: !!yeni.sesliYanit,
    ai: { ...(AYAR.ai || {}), ...(yeni.ai || {}) }
  })
  trayOlusturYeniden()
  gonder('ayar', AYAR)
  return AYAR
})
ipcMain.handle('hatirlatma-ekle', (e, { metin, zaman }) => {
  const liste = hatirlatmalarOku()
  liste.push({ id: Date.now(), metin: String(metin || 'Hatirlatma').substring(0, 200), zaman: Number(zaman) || Date.now() + 60000, gosterildi: false })
  hatirlatmalarYaz(liste)
  return liste
})
ipcMain.handle('hatirlatma-sil', (e, id) => {
  hatirlatmalarYaz(hatirlatmalarOku().filter(h => h.id !== id))
  return hatirlatmalarOku()
})
ipcMain.handle('asistan-kapat', () => app.quit())

function trayOlusturYeniden() {
  try { if (tray) tray.destroy() } catch (e) {}
  tray = null
  trayOlustur()
}

// ---- Ayar dosyasi izleme (yardimci/web tarafindan yapilan degisiklikler) ----
let sonMtime = 0
try { sonMtime = fs.existsSync(AYAR_YOLU) ? fs.statSync(AYAR_YOLU).mtimeMs : 0 } catch (e) {}
setInterval(() => {
  try {
    if (!fs.existsSync(AYAR_YOLU)) return
    const m = fs.statSync(AYAR_YOLU).mtimeMs
    if (m !== sonMtime) {
      sonMtime = m
      const yeni = ayarOku()
      const karakterDegisti = yeni.karakter !== AYAR.karakter
      AYAR = yeni
      if (karakterDegisti) trayOlusturYeniden()
      gonder('ayar', AYAR)
      if (karakterDegisti) konus(`Artik ${KARAKTERLER[AYAR.karakter] || 'asistan'} benim!`)
    }
  } catch (e) {}
}, 2000)

// ---- Uygulama ----
const tek = app.requestSingleInstanceLock()
if (!tek) {
  app.quit()
} else {
  app.on('second-instance', () => { if (petWin) petWin.show() })
  app.whenReady().then(() => {
    if (AYAR.acik === false) { app.quit(); return }
    petPenceresiOlustur()
    trayOlustur()
    pozAyarla('oturuyor')
    setTimeout(() => konus('Merhaba! Ben MUBiS asistaninizim. Cift tiklayin ya da Sohbet Ac ile bana yazin/konusun!'), 1500)
    geziyiBaslat()
    davranisDongusunuBaslat()
    hatirlatmaKontrolunuBaslat()
  })
  app.on('window-all-closed', (e) => { /* tray'de yasar */ })
}
