// MUBiS Masaüstü Otomasyon — Electron ana süreç
//
// Luca/GİB otomasyon motorunu (mubis-gib-yardimci.exe) arka planda çalıştırır,
// masaüstü arayüzünü ve sistem tepsisi simgesini yönetir.
//
// Tasarım notları:
//  - Yerel giriş şifresi YOKTUR; program doğrudan ana ekrana açılır.
//  - Motor ilk çalıştırmada yazılabilir bir klasöre kopyalanır
//    (%LOCALAPPDATA%\MUBiS\MasaustuOtomasyon) — Program Files'a yazma izni
//    gerekmez, güncellemede ayarlar korunur.
//  - Motor çökerse pencere açık kalır; kullanıcı tek tuşla yeniden başlatır.
const { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const { spawn, execFile } = require('child_process')

const SURUM = app.getVersion()
// KENDI MOTORUMUZ: MUBiS yardimcisindan TAMAMEN ayridir.
//  - Ayri dosya adi (mubis-otomasyon-motor.exe): MUBiS yardimcisinin dosyasiyla
//    veya calisan surecleriyle hicbir kilit/cakisma olusmaz.
//  - Ayri port (8766): MUBiS yardimcisinin 8765 portuna hic dokunulmaz.
//  - Ayri klasor: %LOCALAPPDATA%\MUBiS\MasaustuOtomasyon\motor
const MOTOR_ADI = 'mubis-otomasyon-motor.exe'
const PORT = 8766
const MOTOR_KOK = path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'MUBiS', 'MasaustuOtomasyon')
const MOTOR_DIZIN = path.join(MOTOR_KOK, 'motor')
const MOTOR_YOLU = path.join(MOTOR_DIZIN, MOTOR_ADI)
const LOG_YOLU = path.join(MOTOR_KOK, 'otomasyon.log')
const AYAR_YOLU = path.join(MOTOR_DIZIN, 'config.json')

// Motoru kendi motorumuz olarak calistiran ortam degiskenleri.
// MUBIS_TRAY_KAPALI    -> motor kendi tepsi ikonunu acmasin (arayuzumuz var)
// MUBIS_OTOMASYON_KAPALI -> MUBiS web'in otomasyon planini calistirmasin
// MUBIS_KISAYOL_KAPALI -> masaustu "Luca'ya Gir" kisayolunu silmesin
const MOTOR_ORTAM = () => Object.assign({}, process.env, {
  MUBIS_PORT: String(PORT),
  MUBIS_TRAY_KAPALI: '1',
  MUBIS_OTOMASYON_KAPALI: '1',
  MUBIS_KISAYOL_KAPALI: '1'
})

let anaPencere = null
let tray = null
let motorSurec = null
let motorDurumu = { calisiyor: false, mesaj: 'Başlatılıyor…', pid: null }
let pingSayaci = null
let logSatirlari = []
let cikisIstendi = false
let pencereGizli = false
let hazirLoglandi = false
let otoBaslatiliyor = false
let sonOtoBaslatma = 0

app.setAppUserModelId('com.mubis.masaustuotomasyon')

// ---------------------------------------------------------------- yardımcılar

function motorKaynakYolu() {
  const paketli = path.join(process.resourcesPath || '', 'engine', MOTOR_ADI)
  if (fs.existsSync(paketli)) return paketli
  return path.join(__dirname, 'engine', MOTOR_ADI)
}

function motorLoglari() {
  return logSatirlari.slice(-120).join('\n')
}

function pencereyeGonder(kanal, veri) {
  try {
    if (anaPencere && !anaPencere.isDestroyed()) anaPencere.webContents.send(kanal, veri)
  } catch { /* yoksay */ }
}

function logEkle(satir) {
  const t = new Date().toLocaleTimeString('tr-TR')
  const metin = '[' + t + '] ' + satir
  logSatirlari.push(metin)
  if (logSatirlari.length > 400) logSatirlari = logSatirlari.slice(-400)
  try {
    fs.mkdirSync(path.dirname(LOG_YOLU), { recursive: true })
    fs.appendFileSync(LOG_YOLU, metin + '\r\n', 'utf8')
  } catch { /* yoksay */ }
  pencereyeGonder('log', motorLoglari())
}

// İlk çalıştırmada motoru yazılabilir klasöre kopyalar; sürüm değişince tazeler.
function motoruHazirla() {
  try {
    fs.mkdirSync(MOTOR_DIZIN, { recursive: true })
    const kaynak = motorKaynakYolu()
    if (!fs.existsSync(kaynak)) {
      logEkle('HATA: motor dosyası bulunamadı: ' + kaynak)
      return false
    }
    let kopyala = true
    if (fs.existsSync(MOTOR_YOLU)) {
      try {
        const a = fs.statSync(kaynak)
        const b = fs.statSync(MOTOR_YOLU)
        kopyala = a.size !== b.size || b.mtimeMs < a.mtimeMs
      } catch { kopyala = true }
    }
    if (kopyala) {
      logEkle('Motor kopyalanıyor…')
      try { fs.copyFileSync(kaynak, MOTOR_YOLU) } catch (e) {
        logEkle('UYARI: motor kopyalanamadı (çalışıyor olabilir): ' + (e && e.message))
      }
    }
    if (!fs.existsSync(AYAR_YOLU)) {
      try {
        fs.writeFileSync(AYAR_YOLU, JSON.stringify({ captcha_api_key: '', desktop_anahtari: '' }, null, 2), 'utf8')
      } catch { /* yoksay */ }
    }
    return fs.existsSync(MOTOR_YOLU)
  } catch (e) {
    logEkle('HATA: motor hazırlanamadı: ' + (e && e.message))
    return false
  }
}

function httpIstek(yol, secenek = {}) {
  return new Promise((resolve) => {
    const istek = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: yol,
      method: secenek.method || 'GET',
      timeout: secenek.timeout || 2500,
      headers: secenek.headers || {}
    }, (yanit) => {
      let govde = ''
      yanit.setEncoding('utf8')
      yanit.on('data', (c) => { govde += c })
      yanit.on('end', () => resolve({ ok: yanit.statusCode >= 200 && yanit.statusCode < 300, durum: yanit.statusCode, govde }))
    })
    istek.on('timeout', () => { istek.destroy(); resolve({ ok: false, durum: 0, govde: '' }) })
    istek.on('error', () => resolve({ ok: false, durum: 0, govde: '' }))
    if (secenek.body) istek.write(secenek.body)
    istek.end()
  })
}

async function ping() {
  const r = await httpIstek('/ping', { timeout: 2000 })
  if (!r.ok) return null
  try { return JSON.parse(r.govde) } catch { return { ok: true } }
}

// Motorun hazir olmasini bekler (baslatma sonrasi kullanilir).
async function motorHazirOlsun(ms = 30000) {
  const son = Date.now() + ms
  while (Date.now() < son) {
    if (await ping()) return true
    await new Promise((r) => setTimeout(r, 700))
  }
  return false
}

function chromeBul() {
  const adaylar = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
  ]
  for (const y of adaylar) {
    try { if (y && fs.existsSync(y)) return y } catch { /* yoksay */ }
  }
  return ''
}

// ------------------------------------------------------------------- motor

// NOT: Bu uygulama MUBiS yardimcisini ASLA kapatmaz. Kendi motoru ayri
// portta (8766) calisir; cakisma olmaz. Bu yuzden yabanci surec avi yoktur.
async function motoruBaslat() {
  if (motorSurec) return { ok: true, mesaj: 'Motor zaten çalışıyor.' }
  if (!motoruHazirla()) {
    motorDurumu = { calisiyor: false, mesaj: 'Motor dosyası bulunamadı', pid: null }
    pencereyeGonder('durum', durumBilgisi())
    return { ok: false, mesaj: motorDurumu.mesaj }
  }
  try {
    logEkle('Motor başlatılıyor…')
    hazirLoglandi = false
    motorSurec = spawn(MOTOR_YOLU, ['--servis', '--port=' + PORT], {
      cwd: MOTOR_DIZIN,
      windowsHide: true,
      env: MOTOR_ORTAM(),
      stdio: ['ignore', 'pipe', 'pipe']
    })
    motorSurec.stdout.setEncoding('utf8')
    motorSurec.stderr.setEncoding('utf8')
    motorSurec.stdout.on('data', (d) => String(d).split(/\r?\n/).forEach((s) => { if (s.trim()) logEkle(s.trim().slice(0, 400)) }))
    motorSurec.stderr.on('data', (d) => String(d).split(/\r?\n/).forEach((s) => { if (s.trim()) logEkle('! ' + s.trim().slice(0, 400)) }))
    motorSurec.on('exit', (kod) => {
      logEkle('Motor kapandı (kod ' + kod + ')')
      motorSurec = null
      if (!cikisIstendi) {
        motorDurumu = { calisiyor: false, mesaj: 'Motor kapandı (kod ' + kod + ')', pid: null }
        pencereyeGonder('durum', durumBilgisi())
      }
    })
    motorDurumu = { calisiyor: false, mesaj: 'Açılıyor…', pid: motorSurec.pid }
    pencereyeGonder('durum', durumBilgisi())
    return { ok: true, mesaj: 'Motor başlatıldı.' }
  } catch (e) {
    logEkle('HATA: motor başlatılamadı: ' + (e && e.message))
    motorSurec = null
    motorDurumu = { calisiyor: false, mesaj: 'Başlatılamadı', pid: null }
    return { ok: false, mesaj: e && e.message }
  }
}

function motoruDurdur() {
  try {
    if (motorSurec && motorSurec.pid) {
      execFile('taskkill', ['/PID', String(motorSurec.pid), '/T', '/F'], { windowsHide: true }, () => {})
      motorSurec = null
    }
  } catch { /* yoksay */ }
  motorDurumu = { calisiyor: false, mesaj: 'Durduruldu', pid: null }
  pencereyeGonder('durum', durumBilgisi())
  return { ok: true }
}

async function durumYenile() {
  const p = await ping()
  if (p) {
    motorDurumu = {
      calisiyor: true,
      mesaj: 'Çalışıyor',
      pid: motorSurec ? motorSurec.pid : (p.pid || null),
      surum: p.surum || p.version || ''
    }
    if (!hazirLoglandi) {
      hazirLoglandi = true
      logEkle('Motor hazır — yerel servis port ' + PORT + ' üzerinde çalışıyor' + (p.surum ? ' (sürüm ' + p.surum + ')' : ''))
    }
    sonOtoBaslatma = 0
  } else if (!motorSurec) {
    motorDurumu = { calisiyor: false, mesaj: 'Kapalı', pid: null }
    // Kendiliginden toparlanma: motor beklenmedik sekilde kapandiysa
    // (max 2 dakikada bir) yeniden baslatilir.
    const simdi = Date.now()
    if (!otoBaslatiliyor && (!sonOtoBaslatma || simdi - sonOtoBaslatma > 120000)) {
      otoBaslatiliyor = true
      sonOtoBaslatma = simdi
      logEkle('Motor kapalı — otomatik yeniden başlatılıyor…')
      try {
        await motoruBaslat()
        await motorHazirOlsun(30000)
      } catch { /* yoksay */ }
      otoBaslatiliyor = false
    }
  } else {
    motorDurumu = { calisiyor: false, mesaj: 'Açılıyor…', pid: motorSurec.pid }
  }
  const d = durumBilgisi()
  pencereyeGonder('durum', d)
  guncelleTray()
  return d
}

function durumBilgisi() {
  let lucaVar = false
  try {
    const c = JSON.parse(fs.readFileSync(AYAR_YOLU, 'utf8'))
    lucaVar = Boolean(c && c.luca && c.luca.uyeNo && c.luca.kullanici)
  } catch { /* yoksay */ }
  let otomatikBaslat = false
  try { otomatikBaslat = app.getLoginItemSettings().openAtLogin } catch { /* yoksay */ }
  return {
    surum: SURUM,
    motor: motorDurumu,
    port: PORT,
    chrome: chromeBul(),
    lucaKayitli: lucaVar,
    otomatikBaslat,
    motorKlasoru: MOTOR_KOK,
    log: motorLoglari()
  }
}

// ------------------------------------------------------------------ pencere

function pencereOlustur() {
  anaPencere = new BrowserWindow({
    width: 1060,
    height: 720,
    minWidth: 860,
    minHeight: 600,
    backgroundColor: '#0b2a4a',
    title: 'MUBiS Masaüstü Otomasyon',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  anaPencere.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  anaPencere.once('ready-to-show', () => {
    anaPencere.show()
    pencereyeGonder('durum', durumBilgisi())
  })
  anaPencere.on('close', (e) => {
    if (!cikisIstendi) {
      e.preventDefault()
      anaPencere.hide()
      pencereGizli = true
      guncelleTray()
    }
  })
  anaPencere.on('closed', () => { anaPencere = null })
}

function pencereyiGoster() {
  if (!anaPencere) { pencereOlustur(); return }
  if (anaPencere.isMinimized()) anaPencere.restore()
  anaPencere.show()
  anaPencere.focus()
  pencereGizli = false
  guncelleTray()
}

function guncelleTray() {
  if (!tray) return
  const durum = motorDurumu.calisiyor ? 'Çalışıyor' : motorDurumu.mesaj
  tray.setToolTip('MUBiS Masaüstü Otomasyon — ' + durum)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'MUBiS Otomasyonu Aç', click: pencereyiGoster },
    { type: 'separator' },
    { label: 'Motor: ' + durum, enabled: false },
    { label: 'Motoru Başlat', enabled: !motorDurumu.calisiyor, click: () => { motoruBaslat() } },
    { label: 'Motoru Durdur', enabled: motorDurumu.calisiyor, click: () => { motoruDurdur() } },
    { type: 'separator' },
    { label: 'Yardımcı Ayarları (tarayıcı)', click: () => shell.openExternal('http://127.0.0.1:' + PORT + '/ayar') },
    { label: 'MUBiS ERP', click: () => shell.openExternal('https://mubiserp.com') },
    { label: 'Log dosyasını aç', click: () => { try { shell.openPath(LOG_YOLU) } catch { /* yoksay */ } } },
    { type: 'separator' },
    { label: 'Çıkış', click: () => { cikisIstendi = true; app.quit() } }
  ]))
}

function trayOlustur() {
  let ikon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.ico'))
  if (ikon.isEmpty()) ikon = nativeImage.createEmpty()
  tray = new Tray(ikon)
  tray.on('double-click', pencereyiGoster)
  tray.on('click', pencereyiGoster)
  guncelleTray()
}

// ---------------------------------------------------------------------- IPC

ipcMain.handle('durum', async () => {
  await durumYenile()
  return durumBilgisi()
})

ipcMain.handle('motor-baslat', async () => {
  const r = await motoruBaslat()
  setTimeout(durumYenile, 1500)
  setTimeout(durumYenile, 4000)
  return r
})

ipcMain.handle('motor-durdur', async () => {
  motoruDurdur()
  return { ok: true }
})

ipcMain.handle('motor-yeniden', async () => {
  motoruDurdur()
  await new Promise((r) => setTimeout(r, 1200))
  const r = await motoruBaslat()
  setTimeout(durumYenile, 1500)
  setTimeout(durumYenile, 4500)
  return r
})

ipcMain.handle('luca-kaydet', async (_e, veri) => {
  const uyeNo = String((veri && veri.uyeNo) || '').trim()
  const kullanici = String((veri && veri.kullanici) || '').trim()
  const parola = String((veri && veri.parola) || '').trim()
  if (!uyeNo || !kullanici || !parola) {
    return { ok: false, mesaj: 'Üye No, Kullanıcı Adı ve Parola zorunludur.' }
  }
  const govde = JSON.stringify({ uyeNo, kullanici, parola })
  const r = await httpIstek('/ayar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(govde) },
    body: govde,
    timeout: 8000
  })
  if (!r.ok) return { ok: false, mesaj: 'Kaydedilemedi (motor çalışıyor mu?). HTTP ' + r.durum }
  let j = {}
  try { j = JSON.parse(r.govde) } catch { /* yoksay */ }
  if (j.ok === false) return { ok: false, mesaj: j.error || 'Kaydedilemedi.' }
  logEkle('Luca giriş bilgileri kaydedildi.')
  return { ok: true, mesaj: 'Luca giriş bilgileri kaydedildi.' }
})

ipcMain.handle('luca-bilgi', async () => {
  try {
    const c = JSON.parse(fs.readFileSync(AYAR_YOLU, 'utf8'))
    return {
      uyeNo: (c && c.luca && c.luca.uyeNo) || '',
      kullanici: (c && c.luca && c.luca.kullanici) || '',
      parola: (c && c.luca && c.luca.parola) || ''
    }
  } catch {
    return { uyeNo: '', kullanici: '', parola: '' }
  }
})

ipcMain.handle('otomatik-baslat', async (_e, acik) => {
  try {
    app.setLoginItemSettings({ openAtLogin: Boolean(acik), args: ['--gizli'] })
    logEkle('Windows açılışında başlatma: ' + (acik ? 'açık' : 'kapalı'))
    return { ok: true, acik: Boolean(acik) }
  } catch (e) {
    return { ok: false, mesaj: e && e.message }
  }
})

ipcMain.handle('disari-ac', async (_e, adres) => {
  const izinli = ['https://mubiserp.com', 'https://auygs.luca.com.tr', 'https://dijital.gib.gov.tr', 'https://edefter.gib.gov.tr']
  const hedef = String(adres || '')
  if (!izinli.some((x) => hedef.startsWith(x)) && !hedef.startsWith('http://127.0.0.1:' + PORT)) {
    return { ok: false }
  }
  await shell.openExternal(hedef)
  return { ok: true }
})

ipcMain.handle('klasor-ac', async () => {
  try { await shell.openPath(MOTOR_KOK); return { ok: true } } catch { return { ok: false } }
})

ipcMain.handle('log-ac', async () => {
  try {
    if (!fs.existsSync(LOG_YOLU)) fs.writeFileSync(LOG_YOLU, '', 'utf8')
    await shell.openPath(LOG_YOLU)
    return { ok: true }
  } catch { return { ok: false } }
})

// Motor islerini calistirmaya izin verilen liste (guvenlik: arayuz yalniz
// bu isleri tetikleyebilir).
const IZINLI_ISLER = [
  'luca-giris', 'luca-oturumu-kapat', 'luca-firmalar-getir',
  'efatura-sorgula', 'earsiv-fatura-sorgula', 'efatura-gib-sorgula',
  'beyanname-indir', 'tahakkuk-indir', 'makbuz-indir', 'eb-beyanname-indir', 'eb-tahakkuk-indir',
  'gib-borc-sorgula', 'sgk-borc-sorgula', 'sgk-vizite-sorgula', 'sgk-rapor-dokumu',
  'etebligat', 'etebligat-indir',
  'dvs-sorgula',
  'gib-odeme', 'tecilli-odeme', 'sgk-odeme',
  'toplu-belge-duzenle', 'fis-tarama', 'fis-bol',
  'edefter-kopyala', 'luca-hesap-ekle'
]

ipcMain.handle('is-calistir', async (_e, isAdi, params) => {
  const is = String(isAdi || '')
  if (!IZINLI_ISLER.includes(is)) return { success: false, error: 'Bu işlem bu programda desteklenmiyor: ' + is }

  // Motor kapaliysa otomatik baslat ve hazir olmasini bekle: kullanici
  // "Motor yanit vermedi (HTTP 0)" hatasi gormesin.
  if (!(await ping())) {
    logEkle('Motor kapalı — iş için başlatılıyor…')
    await motoruBaslat()
    const hazir = await motorHazirOlsun(45000)
    if (!hazir) {
      return { success: false, error: 'Otomasyon motoru başlatılamadı. Ana Ekran → "Motoru başlat" düğmesini deneyin ve Log sekmesine bakın.' }
    }
  }

  const govde = JSON.stringify(Object.assign({ is }, params || {}))
  logEkle('İş başlatıldı: ' + is)
  const r = await httpIstek('/is', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(govde) },
    body: govde,
    timeout: 55 * 60 * 1000
  })
  if (!r.ok) {
    logEkle('İş yanıtı alınamadı: ' + is + ' (HTTP ' + r.durum + ')')
    return {
      success: false,
      error: r.durum === 0
        ? 'Otomasyon motoruna bağlanılamadı. Motor kapandıysa Ana Ekran’dan yeniden başlatın.'
        : 'Motor yanıt vermedi (HTTP ' + r.durum + ')'
    }
  }
  let j = {}
  try { j = JSON.parse(r.govde) } catch { j = { success: false, error: 'Geçersiz yanıt' } }
  logEkle('İş bitti: ' + is + ' -> ' + (j.success === false ? 'HATA: ' + (j.error || '') : 'tamam'))
  return j
})

ipcMain.handle('gib-ayar-oku', async () => {
  try {
    const c = JSON.parse(fs.readFileSync(AYAR_YOLU, 'utf8'))
    return {
      gib: c.gib || {},
      etebligat: c.etebligat || {},
      sgk: c.sgk || {},
      captcha_api_key: c.captcha_api_key || '',
      desktop_anahtari: c.desktop_anahtari || ''
    }
  } catch {
    return { gib: {}, etebligat: {}, sgk: {}, captcha_api_key: '', desktop_anahtari: '' }
  }
})

ipcMain.handle('gib-ayar-yaz', async (_e, veri) => {
  try {
    let c = {}
    try { c = JSON.parse(fs.readFileSync(AYAR_YOLU, 'utf8')) } catch { c = {} }
    if (veri && typeof veri === 'object') {
      if (veri.gib) c.gib = Object.assign({}, c.gib || {}, veri.gib)
      if (veri.etebligat) c.etebligat = Object.assign({}, c.etebligat || {}, veri.etebligat)
      if (veri.sgk) c.sgk = Object.assign({}, c.sgk || {}, veri.sgk)
      if (typeof veri.captcha_api_key === 'string') c.captcha_api_key = veri.captcha_api_key.trim()
      if (typeof veri.desktop_anahtari === 'string') c.desktop_anahtari = veri.desktop_anahtari.trim()
    }
    fs.writeFileSync(AYAR_YOLU, JSON.stringify(c, null, 2), 'utf8')
    logEkle('GİB/SGK ayarları kaydedildi.')
    return { ok: true, mesaj: 'Ayarlar kaydedildi.' }
  } catch (e) {
    return { ok: false, mesaj: e && e.message }
  }
})

ipcMain.handle('dosyalar', async () => {
  const r = await httpIstek('/dosyalar', { timeout: 8000 })
  if (!r.ok) return { ok: false, dosyalar: [] }
  try {
    const j = JSON.parse(r.govde)
    const liste = Array.isArray(j) ? j : (j.dosyalar || [])
    return { ok: true, dosyalar: liste }
  } catch {
    return { ok: false, dosyalar: [] }
  }
})

ipcMain.handle('indirme-klasoru-ac', async () => {
  try { await shell.openPath(path.join(MOTOR_KOK, 'motor', 'indirilenler')); return { ok: true } } catch { return { ok: false } }
})

ipcMain.handle('dosya-kaydet', async (_e, { ad, icerik }) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(anaPencere || undefined, {
      title: 'Kaydet',
      defaultPath: path.join(app.getPath('desktop'), String(ad || 'mubis-veri.csv')),
      filters: [
        { name: 'Excel (CSV)', extensions: ['csv'] },
        { name: 'Metin', extensions: ['txt'] }
      ]
    })
    if (canceled || !filePath) return { ok: false, iptal: true }
    // Excel'in Turkce karakterleri dogru okumasi icin BOM eklenir.
    fs.writeFileSync(filePath, '\uFEFF' + String(icerik || ''), 'utf8')
    logEkle('Dosya kaydedildi: ' + filePath)
    return { ok: true, yol: filePath }
  } catch (e) {
    return { ok: false, mesaj: e && e.message }
  }
})

ipcMain.handle('pencere-kucult', () => {  if (anaPencere) anaPencere.hide()
  pencereGizli = true
  guncelleTray()
})

// --------------------------------------------------------------------- yaşam

const tekKilit = app.requestSingleInstanceLock()
if (!tekKilit) {
  app.quit()
} else {
  app.on('second-instance', () => pencereyiGoster())

  app.whenReady().then(async () => {
    logEkle('MUBiS Masaüstü Otomasyon ' + SURUM + ' başlatıldı')
    logEkle('Motor klasörü: ' + MOTOR_KOK)
    const chrome = chromeBul()
    logEkle(chrome ? 'Chrome/Edge bulundu: ' + chrome : 'UYARI: Chrome veya Edge bulunamadı — otomasyon için gereklidir.')

    pencereOlustur()
    trayOlustur()
    motoruBaslat()

    if (process.argv.includes('--gizli') && anaPencere) {
      anaPencere.hide()
      pencereGizli = true
    }

    pingSayaci = setInterval(durumYenile, 5000)
    setTimeout(durumYenile, 1500)
  })

  app.on('window-all-closed', () => { /* tepside kal */ })

  app.on('before-quit', () => {
    cikisIstendi = true
    if (pingSayaci) clearInterval(pingSayaci)
    motoruDurdur()
  })
}
