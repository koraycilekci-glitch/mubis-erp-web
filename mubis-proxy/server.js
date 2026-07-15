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
      return await loginDVS(page, credentials, clientName, null);
    case 'dvs-borc-sorgula':
      return await loginDVS(page, credentials, clientName, 'borc-sorgula');
    case 'dvs-borc-durum':
      return await loginDVS(page, credentials, clientName, 'borc-durum');
    case 'dvs-mukellefiyet':
      return await loginDVS(page, credentials, clientName, 'mukellefiyet');
    case 'dvs-beyanname':
      return await loginDVS(page, credentials, clientName, 'beyanname');
    case 'dvs-tahakkuk':
      return await loginDVS(page, credentials, clientName, 'tahakkuk');
    case 'dvs-etebligat':
      return await loginDVS(page, credentials, clientName, 'etebligat');
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

// ============ DVS DEBUG - Sayfa yapisini incele ============
app.post('/api/dvs-debug', async (req, res) => {
  const { credentials } = req.body;
  try {
    const browser = await puppeteer.launch({ headless: false, defaultViewport: null, args: ['--start-maximized'] });
    const page = await browser.newPage();
    
    await page.goto('https://dijital.gib.gov.tr/portal/login', { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('input[type="text"], input[type="password"]', { timeout: 10000 });
    await delay(1000);
    await fillInput(page, 'input[type="text"]', credentials.username);
    await fillInput(page, 'input[type="password"]', credentials.password);
    await delay(500);
    const loginBtn = await page.$('button[type="submit"]') || await page.$('input[type="submit"]');
    if (loginBtn) await loginBtn.click();
    
    // Uzun bekle - DVS yavaş olabilir
    await delay(8000);
    
    // Sayfadaki tum bilgileri topla
    const info = await page.evaluate(() => {
      const data = {
        url: window.location.href,
        title: document.title,
        inputs: [],
        buttons: [],
        links: [],
        menus: [],
        allText: ''
      };
      
      // Tum input'lar
      document.querySelectorAll('input').forEach(el => {
        data.inputs.push({
          type: el.type, name: el.name, id: el.id,
          placeholder: el.placeholder, class: el.className.substring(0, 80),
          visible: el.offsetParent !== null
        });
      });
      
      // Tum butonlar
      document.querySelectorAll('button, [role="button"]').forEach(el => {
        if (el.textContent.trim()) {
          data.buttons.push({ text: el.textContent.trim().substring(0, 60), class: el.className.substring(0, 60) });
        }
      });
      
      // Menu / nav linkleri
      document.querySelectorAll('nav a, [class*="menu"] a, [class*="nav"] a, [class*="sidebar"] a, .mat-list-item, [role="menuitem"]').forEach(el => {
        if (el.textContent.trim()) {
          data.menus.push({ text: el.textContent.trim().substring(0, 60), href: el.href || '' });
        }
      });
      
      // Sayfadaki tum linkler (ilk 50)
      let linkCount = 0;
      document.querySelectorAll('a').forEach(el => {
        if (el.textContent.trim() && linkCount < 50) {
          data.links.push({ text: el.textContent.trim().substring(0, 60), href: el.href || '' });
          linkCount++;
        }
      });
      
      // Sayfadaki ana metin (ilk 2000 karakter)
      data.allText = document.body.innerText.substring(0, 2000);
      
      return data;
    });
    
    console.log('\n====== DVS SAYFA ANALIZI ======');
    console.log('URL:', info.url);
    console.log('Title:', info.title);
    console.log('\n--- INPUT\'LAR ---');
    info.inputs.forEach(i => console.log(`  [${i.type}] name="${i.name}" id="${i.id}" placeholder="${i.placeholder}" visible=${i.visible}`));
    console.log('\n--- BUTONLAR ---');
    info.buttons.forEach(b => console.log(`  "${b.text}"`));
    console.log('\n--- MENU ---');
    info.menus.forEach(m => console.log(`  "${m.text}" -> ${m.href}`));
    console.log('\n--- LINKLER ---');
    info.links.forEach(l => console.log(`  "${l.text}" -> ${l.href}`));
    console.log('\n--- SAYFA METNI ---');
    console.log(info.allText);
    console.log('============================\n');
    
    res.json({ success: true, info });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ DVS - ORTAK GIRIS + ISLEM NAVIGASYONU ============
async function loginDVS(page, cred, clientName, islem) {
  console.log(`[DVS] ${clientName || ''} icin giris yapiliyor... islem: ${islem || 'sadece giris'}`);
  await page.goto('https://dijital.gib.gov.tr/portal/login', { waitUntil: 'networkidle2', timeout: 30000 });
  
  // Kullanici adi ve sifre doldur
  await page.waitForSelector('input[type="text"], input[type="password"]', { timeout: 10000 });
  await delay(1000);
  
  await fillInput(page, 'input[type="text"]', cred.username);
  await fillInput(page, 'input[type="password"]', cred.password);

  console.log('[DVS] Kullanici adi ve sifre dolduruldu. Dogrulama kodu bekleniyor...');

  // Islem yoksa sadece giris formu doldur, kullanici captcha yazacak
  if (!islem) {
    return `DVS giris formu dolduruldu: ${clientName || cred.username}`;
  }

  // Kullanicinin captcha yazip giris yapmasini bekle
  // URL login sayfasindan degisene kadar bekle (max 120 saniye)
  console.log('[DVS] Kullanicinin dogrulama kodu girip giris yapmasini bekleniyor (max 120sn)...');
  
  let loggedIn = false;
  for (let i = 0; i < 120; i++) {
    await delay(1000);
    const url = await page.url();
    if (!url.includes('/login') && !url.includes('/portal/login')) {
      loggedIn = true;
      console.log(`[DVS] Giris basarili! URL: ${url}`);
      break;
    }
  }
  
  if (!loggedIn) {
    console.log('[DVS] 120 saniye icerisinde giris yapilmadi.');
    return `DVS giris zaman asimi: ${clientName || cred.username}`;
  }

  // Giris sonrasi SPA yuklemesi icin bekle
  await delay(3000);
  
  // Sayfadaki elementleri logla
  const pageInfo = await page.evaluate(() => {
    const inputs = [];
    document.querySelectorAll('input').forEach(el => {
      if (el.offsetParent !== null) {
        inputs.push({ type: el.type, placeholder: el.placeholder, id: el.id, name: el.name });
      }
    });
    const links = [];
    document.querySelectorAll('a').forEach(el => {
      const t = el.textContent.trim();
      if (t && t.length > 1 && t.length < 80) {
        links.push({ text: t, href: el.href });
      }
    });
    return { url: window.location.href, inputCount: inputs.length, inputs: inputs.slice(0, 20), linkCount: links.length, links: links.slice(0, 50) };
  });
  
  console.log('[DVS] Dashboard URL:', pageInfo.url);
  console.log('[DVS] Input sayisi:', pageInfo.inputCount);
  pageInfo.inputs.forEach(i => console.log(`  INPUT: type=${i.type} placeholder="${i.placeholder}" id="${i.id}"`));
  console.log('[DVS] Link sayisi:', pageInfo.linkCount);
  pageInfo.links.forEach(l => console.log(`  LINK: "${l.text}" -> ${l.href}`));

  // Arama metinleri
  const aramaMetinleri = {
    'borc-sorgula': 'Borç Sorgulama',
    'borc-durum': 'Borç Durum Yazısı',
    'mukellefiyet': 'Mükellefiyet Belgesi',
    'beyanname': 'Beyanname',
    'tahakkuk': 'Tahakkuk',
    'etebligat': 'e-Tebligat'
  };
  const aramaText = aramaMetinleri[islem] || islem;
  console.log(`[DVS] Aranan islem: "${aramaText}"`);

  // YONTEM 1: Sayfadaki linklerde dogrudan ara
  let found = false;
  try {
    const clickResult = await page.evaluate((searchText) => {
      const all = document.querySelectorAll('a, button, [role="button"], [role="menuitem"], span, div');
      for (const el of all) {
        const t = el.textContent.trim();
        if (t === searchText || (t.includes(searchText) && t.length < searchText.length + 30)) {
          el.click();
          return t;
        }
      }
      return null;
    }, aramaText);
    
    if (clickResult) {
      console.log(`[DVS] Element tiklandi: "${clickResult}"`);
      found = true;
    }
  } catch (e) {
    console.log('[DVS] Link arama hatasi:', e.message);
  }

  // YONTEM 2: Arama kutusu bul ve kullan
  if (!found) {
    console.log('[DVS] Dogrudan link bulunamadi, arama kutusu araniyor...');
    for (const inp of pageInfo.inputs) {
      if (inp.type === 'text' || inp.type === 'search' || 
          (inp.placeholder && (inp.placeholder.toLowerCase().includes('ara') || inp.placeholder.toLowerCase().includes('search')))) {
        console.log(`[DVS] Arama kutusu bulundu: placeholder="${inp.placeholder}" id="${inp.id}"`);
        
        let selector = inp.id ? `#${inp.id}` : `input[placeholder="${inp.placeholder}"]`;
        try {
          const searchEl = await page.$(selector);
          if (searchEl) {
            await searchEl.click();
            await delay(500);
            await page.evaluate(el => { el.value = ''; }, searchEl);
            await searchEl.type(aramaText, { delay: 60 });
            await delay(2500);
            
            // Arama sonuclari tikla
            const resultClicked = await page.evaluate((text) => {
              const selectors = ['[class*="result"]', '[class*="dropdown"]', '[class*="suggest"]', '[class*="autocomplete"]', '[class*="overlay"]', '[class*="option"]', 'ul li'];
              for (const sel of selectors) {
                const items = document.querySelectorAll(sel);
                for (const item of items) {
                  const t = item.textContent.trim();
                  if (t && t.length > 3 && t.length < 100) {
                    item.click();
                    return t;
                  }
                }
              }
              return null;
            }, aramaText);
            
            if (resultClicked) {
              console.log(`[DVS] Arama sonucu tiklandi: "${resultClicked}"`);
              found = true;
            } else {
              await page.keyboard.press('Enter');
              console.log('[DVS] Enter ile gonderildi');
              found = true;
            }
          }
        } catch (e) {
          console.log('[DVS] Arama hatasi:', e.message);
        }
        break;
      }
    }
  }

  if (!found) {
    console.log('[DVS] Islem bulunamadi. Kullanici manuel secim yapacak.');
  }

  await delay(2000);
  return `DVS ${aramaText} ${found ? 'acildi' : '- giris yapildi, menu bekleniyor'}: ${clientName || cred.username}`;
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
  await delay(2000);
  
  await fillSGKForm(page, cred);

  return `SGK Borc Sorgulama giris yapildi: ${clientName || cred.username}`;
}

// ---- SGK Isveren Sistemi (Borc Yoktur) ----
async function loginSGKIsveren(page, cred, clientName) {
  console.log(`[SGK Isveren] ${clientName || ''} icin giris yapiliyor...`);
  await page.goto('https://uyg.sgk.gov.tr/IsverenSistemi', { waitUntil: 'networkidle2', timeout: 30000 });

  await page.waitForSelector('input[type="text"]', { timeout: 10000 });
  await delay(2000);
  
  // Sayfadaki tum input alanlari bul ve sirala
  await fillSGKForm(page, cred);

  return `SGK Isveren Sistemi giris yapildi: ${clientName || cred.username}`;
}

// SGK ortak form doldurma (Borc Sorgula + Isveren ayni form yapisi)
// Alanlar: 1.Kullanici Adi (text), 2.Isyeri Kodu (text), 3.Sistem Sifresi (password), 4.Isyeri Sifresi (password)
async function fillSGKForm(page, cred) {
  // Tum gorunur input alanlari tespit et
  const formInfo = await page.evaluate(() => {
    const textInputs = [];
    const passInputs = [];
    document.querySelectorAll('input').forEach((el, idx) => {
      if (el.offsetParent === null && el.type !== 'hidden') return;
      if (el.type === 'text') textInputs.push(idx);
      if (el.type === 'password') passInputs.push(idx);
    });
    return { textInputs, passInputs, total: document.querySelectorAll('input').length };
  });
  
  console.log(`[SGK Form] Text input: ${formInfo.textInputs.length}, Password input: ${formInfo.passInputs.length}, Toplam: ${formInfo.total}`);

  const allInputs = await page.$$('input');
  
  // Yardimci: input alanina guvenli yaz + kontrol et
  async function writeField(input, value, label) {
    if (!input || !value) return;
    await input.click({ clickCount: 3 });
    await delay(100);
    await page.evaluate(el => { el.value = ''; el.dispatchEvent(new Event('input', {bubbles:true})); }, input);
    await delay(100);
    await input.type(value, { delay: 30 });
    await delay(200);
    const written = await page.evaluate(el => el.value, input);
    if (written !== value) {
      console.log(`[SGK Form] ${label} eksik yazildi: "${written}" vs "${value}", duzeltiliyor`);
      await page.evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); }, input, value);
    }
    console.log(`[SGK Form] ${label} yazildi`);
  }

  // 1. Kullanici Adi - ilk text input
  if (formInfo.textInputs.length > 0) {
    await writeField(allInputs[formInfo.textInputs[0]], cred.username, 'Kullanici Adi');
  }
  
  // 2. Isyeri Kodu - ikinci text input (Kullanici Adi yanindaki "-" den sonraki alan)
  if (formInfo.textInputs.length > 1 && cred.isyeriKodu) {
    await writeField(allInputs[formInfo.textInputs[1]], cred.isyeriKodu, 'Isyeri Kodu');
  }
  
  // 3. Sistem Sifresi - ilk password input
  if (formInfo.passInputs.length > 0) {
    await writeField(allInputs[formInfo.passInputs[0]], cred.sistemSifre, 'Sistem Sifresi');
  }
  
  // 4. Isyeri Sifresi - ikinci password input
  if (formInfo.passInputs.length > 1 && cred.isyeriSifre) {
    await writeField(allInputs[formInfo.passInputs[1]], cred.isyeriSifre, 'Isyeri Sifresi');
  }
  
  await delay(500);
  console.log('[SGK Form] 4 alan dolduruldu. Guvenlik anahtari (captcha) bekleniyor...');
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
