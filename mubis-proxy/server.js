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
  
  // Giris yap
  await page.waitForSelector('input[type="text"], input[type="password"]', { timeout: 10000 });
  await delay(1000);
  
  await fillInput(page, 'input[type="text"]', cred.username);
  await fillInput(page, 'input[type="password"]', cred.password);

  await delay(500);
  const loginBtn = await page.$('button[type="submit"]') || await page.$('.login-btn') || await page.$('input[type="submit"]');
  if (loginBtn) {
    await loginBtn.click();
  }

  // Islem yoksa sadece giris yap
  if (!islem) {
    return `DVS giris yapildi: ${clientName || cred.username}`;
  }

  // Giris sonrasi sayfanin degismesini bekle (login URL'den cikana kadar)
  console.log('[DVS] Giris sonrasi sayfa yuklenmesi bekleniyor...');
  try {
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
  } catch (e) {
    console.log('[DVS] Navigation timeout, devam ediliyor...');
  }
  
  // Ekstra bekleme - SPA yuklenmesi icin
  await delay(5000);
  
  const currentUrl = await page.url();
  console.log('[DVS] Giris sonrasi URL:', currentUrl);
  
  // Sayfadaki tum elementleri logla
  const pageInfo = await page.evaluate(() => {
    const inputs = [];
    document.querySelectorAll('input').forEach(el => {
      if (el.offsetParent !== null) {
        inputs.push({ type: el.type, placeholder: el.placeholder, id: el.id, name: el.name, class: el.className.substring(0,60) });
      }
    });
    
    const links = [];
    document.querySelectorAll('a').forEach(el => {
      const t = el.textContent.trim();
      if (t && t.length > 1 && t.length < 80) {
        links.push({ text: t, href: el.href });
      }
    });
    
    return { 
      url: window.location.href, 
      title: document.title,
      bodyText: document.body.innerText.substring(0, 3000),
      inputCount: inputs.length,
      inputs: inputs.slice(0, 20),
      linkCount: links.length,
      links: links.slice(0, 40)
    };
  });
  
  console.log('[DVS] Sayfa:', pageInfo.url);
  console.log('[DVS] Input sayisi:', pageInfo.inputCount);
  pageInfo.inputs.forEach(i => console.log(`  INPUT: type=${i.type} placeholder="${i.placeholder}" id="${i.id}" name="${i.name}"`));
  console.log('[DVS] Link sayisi:', pageInfo.linkCount);
  pageInfo.links.forEach(l => console.log(`  LINK: "${l.text}" -> ${l.href}`));
  console.log('[DVS] Sayfa metni (ilk 500):', pageInfo.bodyText.substring(0, 500));

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

  // YONTEM 1: Sayfadaki linklerde ara
  let found = false;
  for (const link of pageInfo.links) {
    if (link.text.includes(aramaText) || link.text.toLowerCase().includes(aramaText.toLowerCase())) {
      console.log(`[DVS] Link bulundu: "${link.text}" -> ${link.href}`);
      try {
        const el = await page.evaluateHandle((text) => {
          const links = document.querySelectorAll('a');
          for (const a of links) {
            if (a.textContent.trim().includes(text)) return a;
          }
          return null;
        }, link.text);
        if (el) {
          await el.asElement()?.click();
          found = true;
          console.log('[DVS] Link tiklandi!');
          break;
        }
      } catch (e) {
        console.log('[DVS] Link tiklama hatasi:', e.message);
      }
    }
  }

  // YONTEM 2: Arama kutusu bul ve kullan
  if (!found) {
    console.log('[DVS] Link bulunamadi, arama kutusu araniyor...');
    
    // Tum input'lari dene
    for (const inp of pageInfo.inputs) {
      if (inp.type === 'text' || inp.type === 'search' || inp.placeholder.toLowerCase().includes('ara') || inp.placeholder.toLowerCase().includes('search')) {
        console.log(`[DVS] Arama kutusu bulundu: placeholder="${inp.placeholder}" id="${inp.id}"`);
        
        let selector = inp.id ? `#${inp.id}` : (inp.name ? `input[name="${inp.name}"]` : `input[placeholder="${inp.placeholder}"]`);
        try {
          const searchEl = await page.$(selector);
          if (searchEl) {
            await searchEl.click();
            await delay(300);
            await page.evaluate(el => { el.value = ''; }, searchEl);
            await searchEl.type(aramaText, { delay: 60 });
            await delay(2000);
            
            // Arama sonuclari - dropdown / liste / link
            const results = await page.$$('[class*="result"] a, [class*="dropdown"] a, [class*="suggest"] a, [class*="autocomplete"] a, [class*="search"] li, [class*="mat-option"], .cdk-overlay-pane *');
            console.log(`[DVS] Arama sonucu sayisi: ${results.length}`);
            
            for (const r of results) {
              const text = await page.evaluate(el => el.textContent, r);
              if (text && text.trim().length > 0) {
                console.log(`[DVS] Sonuc: "${text.trim().substring(0, 60)}"`);
                await r.click();
                found = true;
                console.log('[DVS] Sonuc tiklandi!');
                break;
              }
            }
            
            if (!found) {
              // Enter ile gonder
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

  // YONTEM 3: Sayfadaki tum tiklabilir elementlerde ara
  if (!found) {
    console.log('[DVS] Arama kutusu bulunamadi, tum tiklabilir elementler taraniyor...');
    try {
      const clicked = await page.evaluate((searchText) => {
        const all = document.querySelectorAll('a, button, [role="button"], [role="menuitem"], [role="link"], span[class*="click"], div[class*="click"]');
        for (const el of all) {
          const t = el.textContent.trim();
          if (t.includes(searchText) || t.toLowerCase().includes(searchText.toLowerCase())) {
            el.click();
            return t;
          }
        }
        return null;
      }, aramaText);
      
      if (clicked) {
        console.log(`[DVS] Element tiklandi: "${clicked}"`);
        found = true;
      }
    } catch (e) {
      console.log('[DVS] Element arama hatasi:', e.message);
    }
  }

  if (!found) {
    console.log('[DVS] Hicbir islem bulunamadi! Sayfa icerigini kontrol edin.');
  }

  await delay(2000);
  return `DVS ${aramaText} ${found ? 'acildi' : 'bulunamadi'}: ${clientName || cred.username}`;
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
