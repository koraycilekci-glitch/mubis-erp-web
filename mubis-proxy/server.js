const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();
const PORT = 4789;

app.use(cors());
app.use(express.json());

// Aktif tarayici oturumlari
const sessions = {};

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'MUBiS Baglanti Merkezi', version: '1.0.0' });
});

// ============ PORTAL OTOMATIK GIRIS ============
app.post('/api/login', async (req, res) => {
  const { portal, credentials, clientName } = req.body;

  if (!portal || !credentials) {
    return res.status(400).json({ error: 'Portal ve credentials gerekli' });
  }

  try {
    const result = await portalLogin(portal, credentials, clientName);
    res.json({ success: true, message: result });
  } catch (err) {
    console.error('Login hatasi:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============ TARAYICI KAPAT ============
app.post('/api/close', async (req, res) => {
  const { sessionId } = req.body;
  if (sessions[sessionId]) {
    try {
      await sessions[sessionId].close();
      delete sessions[sessionId];
    } catch (e) {}
  }
  res.json({ success: true });
});

// ============ PORTAL LOGIN FONKSIYONLARI ============
async function portalLogin(portal, credentials, clientName) {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      '--start-maximized',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  const sessionId = Date.now().toString();
  sessions[sessionId] = browser;

  const page = await browser.newPage();
  
  // Tarayici kapaninca session temizle
  browser.on('disconnected', () => {
    delete sessions[sessionId];
  });

  switch (portal) {
    case 'dvs':
      return await loginDVS(page, credentials, clientName);
    case 'dvs-borc-durum':
      return await loginDVSBorcDurum(page, credentials, clientName);
    case 'earsiv':
      return await loginEArsiv(page, credentials, clientName);
    case 'sgk':
      return await loginSGK(page, credentials, clientName);
    case 'sgk-borc':
      return await loginSGKBorc(page, credentials, clientName);
    case 'sgk-isveren':
      return await loginSGKIsveren(page, credentials, clientName);
    case 'edevlet':
      return await loginEDevlet(page, credentials, clientName);
    default:
      await browser.close();
      delete sessions[sessionId];
      throw new Error('Bilinmeyen portal: ' + portal);
  }
}

// ---- Dijital Vergi Dairesi ----
async function loginDVS(page, cred, clientName) {
  console.log(`[DVS] ${clientName || ''} icin giris yapiliyor...`);
  await page.goto('https://dijital.gib.gov.tr/portal/login', { waitUntil: 'networkidle2', timeout: 30000 });
  
  // Kullanici adi alani
  await page.waitForSelector('input[name="username"], input[type="text"], #username', { timeout: 10000 });
  const userInput = await page.$('input[name="username"]') || await page.$('#username') || await page.$('input[type="text"]');
  if (userInput) {
    await userInput.click({ clickCount: 3 });
    await userInput.type(cred.username, { delay: 50 });
  }

  // Sifre alani
  const passInput = await page.$('input[name="password"]') || await page.$('#password') || await page.$('input[type="password"]');
  if (passInput) {
    await passInput.click({ clickCount: 3 });
    await passInput.type(cred.password, { delay: 50 });
  }

  // Giris butonu
  await delay(500);
  const loginBtn = await page.$('button[type="submit"]') || await page.$('.login-btn') || await page.$('input[type="submit"]');
  if (loginBtn) {
    await loginBtn.click();
  }

  return `DVS giris yapildi: ${clientName || cred.username}`;
}

// ---- e-Arsiv Portal ----
async function loginEArsiv(page, cred, clientName) {
  console.log(`[e-Arsiv] ${clientName || ''} icin giris yapiliyor...`);
  await page.goto('https://earsivportal.efatura.gov.tr/intragiris.html', { waitUntil: 'networkidle2', timeout: 30000 });

  // Kullanici adi
  await page.waitForSelector('input[name="userid"], input[id="userid"], input[type="text"]', { timeout: 10000 });
  const userInput = await page.$('input[name="userid"]') || await page.$('#userid') || await page.$('input[type="text"]');
  if (userInput) {
    await userInput.click({ clickCount: 3 });
    await userInput.type(cred.username, { delay: 50 });
  }

  // Sifre
  const passInput = await page.$('input[name="sifre"]') || await page.$('#sifre') || await page.$('input[type="password"]');
  if (passInput) {
    await passInput.click({ clickCount: 3 });
    await passInput.type(cred.password, { delay: 50 });
  }

  // Giris butonu
  await delay(500);
  const loginBtn = await page.$('button[type="submit"]') || await page.$('#loginButton') || await page.$('input[type="submit"]') || await page.$('button.btn-primary');
  if (loginBtn) {
    await loginBtn.click();
  }

  return `e-Arsiv giris yapildi: ${clientName || cred.username}`;
}

// ---- SGK e-Bildirge ----
async function loginSGK(page, cred, clientName) {
  console.log(`[SGK] ${clientName || ''} icin giris yapiliyor...`);
  await page.goto('https://ebildirge.sgk.gov.tr/EBildirgeV2', { waitUntil: 'networkidle2', timeout: 30000 });

  // Kullanici adi
  await page.waitForSelector('input[type="text"]', { timeout: 10000 });
  const inputs = await page.$$('input[type="text"]');
  if (inputs[0]) {
    await inputs[0].click({ clickCount: 3 });
    await inputs[0].type(cred.username, { delay: 50 });
  }

  // Isyeri kodu (varsa)
  if (cred.isyeriKodu && inputs[1]) {
    await inputs[1].click({ clickCount: 3 });
    await inputs[1].type(cred.isyeriKodu, { delay: 50 });
  }

  // Sistem sifresi
  const passInputs = await page.$$('input[type="password"]');
  if (passInputs[0] && cred.sistemSifre) {
    await passInputs[0].click({ clickCount: 3 });
    await passInputs[0].type(cred.sistemSifre, { delay: 50 });
  }

  // Isyeri sifresi (varsa 2. password alani)
  if (passInputs[1] && cred.isyeriSifre) {
    await passInputs[1].click({ clickCount: 3 });
    await passInputs[1].type(cred.isyeriSifre, { delay: 50 });
  }

  // Giris butonu
  await delay(500);
  const loginBtn = await page.$('button[type="submit"]') || await page.$('input[type="submit"]') || await page.$('input[type="button"][value*="Gir"]');
  if (loginBtn) {
    await loginBtn.click();
  }

  return `SGK e-Bildirge giris yapildi: ${clientName || cred.username}`;
}

// ---- SGK Borc Sorgulama ----
async function loginSGKBorc(page, cred, clientName) {
  console.log(`[SGK Borc] ${clientName || ''} icin giris yapiliyor...`);
  await page.goto('https://ebildirge.sgk.gov.tr/WPEB/amp/loginldap', { waitUntil: 'networkidle2', timeout: 30000 });

  await page.waitForSelector('input[type="text"]', { timeout: 10000 });
  await delay(1500);
  
  await fillInput(page, 'input[type="text"]', cred.username);
  await fillInput(page, 'input[type="password"]', cred.sistemSifre);

  await delay(500);
  const loginBtn = await page.$('button[type="submit"]') || await page.$('input[type="submit"]') || await page.$('input[type="button"]');
  if (loginBtn) {
    await loginBtn.click();
  }

  return `SGK Borc Sorgulama giris yapildi: ${clientName || cred.username}`;
}

// ---- SGK Isveren Sistemi (Borc Yoktur) ----
async function loginSGKIsveren(page, cred, clientName) {
  console.log(`[SGK Isveren] ${clientName || ''} icin giris yapiliyor...`);
  await page.goto('https://uyg.sgk.gov.tr/IsverenSistemi', { waitUntil: 'networkidle2', timeout: 30000 });

  await page.waitForSelector('input[type="text"]', { timeout: 10000 });
  await delay(1500);
  
  await fillInput(page, 'input[type="text"]', cred.username);
  await fillInput(page, 'input[type="password"]', cred.sistemSifre);

  await delay(500);
  const loginBtn = await page.$('button[type="submit"]') || await page.$('input[type="submit"]') || await page.$('input[type="button"]');
  if (loginBtn) {
    await loginBtn.click();
  }

  return `SGK Isveren Sistemi giris yapildi: ${clientName || cred.username}`;
}

// ---- DVS Borc Durum / Mukellefiyet Belgesi ----
async function loginDVSBorcDurum(page, cred, clientName) {
  console.log(`[DVS Borc Durum] ${clientName || ''} icin giris + navigasyon yapiliyor...`);
  
  // Oncelikle DVS'ye giris yap
  await page.goto('https://dijital.gib.gov.tr/portal/login', { waitUntil: 'networkidle2', timeout: 30000 });
  
  await page.waitForSelector('input[name="username"], input[type="text"], #username', { timeout: 10000 });
  const userInput = await page.$('input[name="username"]') || await page.$('#username') || await page.$('input[type="text"]');
  if (userInput) {
    await userInput.click({ clickCount: 3 });
    await userInput.type(cred.username, { delay: 50 });
  }

  const passInput = await page.$('input[name="password"]') || await page.$('#password') || await page.$('input[type="password"]');
  if (passInput) {
    await passInput.click({ clickCount: 3 });
    await passInput.type(cred.password, { delay: 50 });
  }

  await delay(500);
  const loginBtn = await page.$('button[type="submit"]') || await page.$('.login-btn') || await page.$('input[type="submit"]');
  if (loginBtn) {
    await loginBtn.click();
  }

  // Giris sonrasi sayfa yuklenmesini bekle
  await delay(3000);
  
  try {
    // Arama kutusunu bul ve "mukellef borc durum" yaz
    await page.waitForSelector('input[type="search"], input[placeholder*="Ara"], input[type="text"]', { timeout: 10000 });
    const searchInputs = await page.$$('input[type="search"], input[placeholder*="Ara"], input[placeholder*="ara"]');
    const searchInput = searchInputs[0] || await page.$('input[type="search"]');
    if (searchInput) {
      await searchInput.click();
      await delay(300);
      await searchInput.type('mukellef borc durum', { delay: 80 });
      await delay(1500);
      
      // Arama sonuclarindan ilkini tikla
      const resultItem = await page.$('[class*="search-result"] a, [class*="result"] a, .dropdown-item, li a[href*="borc"], li a[href*="Borc"]');
      if (resultItem) {
        await resultItem.click();
        console.log('[DVS] Mukellef borc durum sayfasina yonlendirildi');
      }
    }
  } catch (e) {
    console.log('[DVS] Arama navigasyonu basarisiz, ana sayfada kaliniyor:', e.message);
  }

  return `DVS giris + borc durum navigasyonu yapildi: ${clientName || cred.username}`;
}

// ---- e-Devlet Giris ----
async function loginEDevlet(page, cred, clientName) {
  console.log(`[e-Devlet] ${clientName || ''} icin giris yapiliyor...`);
  await page.goto('https://giris.turkiye.gov.tr/Giris/', { waitUntil: 'networkidle2', timeout: 30000 });

  // TC Kimlik No
  await page.waitForSelector('input[id="tridField"], input[name="tridField"], input[type="text"]', { timeout: 10000 });
  const tcInput = await page.$('#tridField') || await page.$('input[name="tridField"]') || await page.$('input[type="text"]');
  if (tcInput) {
    await tcInput.click({ clickCount: 3 });
    await tcInput.type(cred.username, { delay: 50 });
  }

  // Sifre
  const passInput = await page.$('#egpiField') || await page.$('input[name="egpiField"]') || await page.$('input[type="password"]');
  if (passInput) {
    await passInput.click({ clickCount: 3 });
    await passInput.type(cred.password, { delay: 50 });
  }

  // Giris butonu
  await delay(500);
  const loginBtn = await page.$('#girisButton') || await page.$('button[type="submit"]') || await page.$('input[type="submit"]');
  if (loginBtn) {
    await loginBtn.click();
  }

  return `e-Devlet giris yapildi: ${clientName || cred.username}`;
}

// ============ YARDIMCI ============
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Input alanini guvenli sekilde temizleyip yaz
async function fillInput(page, selector, value) {
  if (!value) return;
  const el = await page.$(selector);
  if (!el) return;
  await el.click({ clickCount: 3 });
  await delay(100);
  // Oncelikle alani tamamen temizle
  await page.evaluate(e => { e.value = ''; e.dispatchEvent(new Event('input', {bubbles: true})); }, el);
  await delay(100);
  // Sonra yaz
  await el.type(value, { delay: 20 });
  await delay(100);
  // Degerinin dogru yazilip yazilmadigini kontrol et, degilse evaluate ile set et
  const written = await page.evaluate(e => e.value, el);
  if (written !== value) {
    console.log(`  [fillInput] type() eksik yazdi: "${written}" vs "${value}", evaluate ile duzeltiliyor`);
    await page.evaluate((e, v) => { e.value = v; e.dispatchEvent(new Event('input', {bubbles: true})); e.dispatchEvent(new Event('change', {bubbles: true})); }, el, value);
  }
}

// ============ SUNUCU BASLAT ============
app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║   MUBiS Baglanti Merkezi v1.0.0         ║');
  console.log('  ║   Port: ' + PORT + '                            ║');
  console.log('  ║   Durum: Calisiyor                      ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
  console.log('  Desteklenen portallar:');
  console.log('    - DVS (Dijital Vergi Dairesi)');
  console.log('    - DVS Borc Durum / Mukellefiyet');
  console.log('    - e-Arsiv Portal');
  console.log('    - SGK e-Bildirge');
  console.log('    - SGK Borc Sorgulama');
  console.log('    - SGK Isveren Sistemi');
  console.log('    - e-Devlet');
  console.log('');
  console.log('  Bu pencereyi kapatmayin!');
  console.log('');
});
