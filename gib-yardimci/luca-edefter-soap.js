// ============================================================
// Luca E-Defter SOAP API istemcisi
// ------------------------------------------------------------
// Java Swing UI yerine dogrudan Luca SOAP servisini kullanir.
// Tam otomasyon: giris -> firma listesi -> defter olustur ->
// durum sorgula -> hata parse -> (gerekirse fis bol) -> xml olustur
//
// Endpoint: https://auygs.luca.com.tr/LucaEDefterServer2/LucaEDefterSOAP
// Versiyon: v1.14.01
// Tarih formati: MM.DD.YYYY (US formati - API icin)
// ============================================================

const https = require('https');
const http = require('http');

const LUCA_SOAP_URL = 'https://auygs.luca.com.tr/LucaEDefterServer2/LucaEDefterSOAP';
const LUCA_NS = 'http://webService.edefter.agem.com.tr/server';
const LUCA_VERSIYON = 'v1.14.01';

// --- Dusuk seviye SOAP cagrisi ---
function soapCagir(bodyXml, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const envelope = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:typ="' + LUCA_NS + '">\n' +
      '   <soapenv:Header/>\n' +
      '   <soapenv:Body>\n' +
      '      ' + bodyXml + '\n' +
      '   </soapenv:Body>\n' +
      '</soapenv:Envelope>';

    const url = new URL(LUCA_SOAP_URL);
    const opts = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      timeout: timeoutMs,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '""',
        'Content-Length': Buffer.byteLength(envelope, 'utf8')
      }
    };

    const req = https.request(opts, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(data));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('SOAP timeout')); });
    req.on('error', (e) => reject(e));
    req.write(envelope);
    req.end();
  });
}

// --- XML parse yardımcıları ---
function xmlDeger(xml, tag) {
  const m = xml.match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>', 'i'));
  return m ? m[1].trim() : null;
}

function xmlDegerler(xml, tag) {
  const out = [];
  const re = new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>', 'gi');
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1].trim());
  return out;
}

// --- Tarih donusum: "01.08.2026" (TR, DD.MM.YYYY) -> "08.01.2026" (US, MM.DD.YYYY) ---
function trToUs(tarih) {
  // Girdi: DD.MM.YYYY veya DD/MM/YYYY
  const parts = tarih.split(/[.\/]/);
  if (parts.length !== 3) return tarih;
  const [d, m, y] = parts;
  return m.padStart(2, '0') + '.' + d.padStart(2, '0') + '.' + y;
}

function usToTr(tarih) {
  const parts = tarih.split(/[.\/]/);
  if (parts.length !== 3) return tarih;
  const [m, d, y] = parts;
  return d.padStart(2, '0') + '.' + m.padStart(2, '0') + '.' + y;
}

// --- Ayin son gunu ---
function ayinSonGunu(yil, ay) {
  return new Date(yil, ay, 0).getDate();
}

// ============================================================
// ANA API FONKSIYONLARI
// ============================================================

// 1. Giris
async function lucaGiris(musteriId, kullaniciAdi, parola, yil, ay) {
  const body = '<typ:LoginRequest>' +
    '<typ:musteriId>' + musteriId + '</typ:musteriId>' +
    '<typ:kullaniciAdi>' + kullaniciAdi + '</typ:kullaniciAdi>' +
    '<typ:parola>' + parola + '</typ:parola>' +
    '<typ:yil>' + yil + '</typ:yil>' +
    '<typ:ay>' + ay + '</typ:ay>' +
    '<typ:versiyon>' + LUCA_VERSIYON + '</typ:versiyon>' +
    '</typ:LoginRequest>';
  const resp = await soapCagir(body);
  const rc = xmlDeger(resp, 'responseCode');
  const rm = xmlDeger(resp, 'responseMessage');
  const token = xmlDeger(resp, 'token');
  const versiyonDevamEt = xmlDeger(resp, 'versiyonDevamEt');
  // Firma listesi
  const firmalar = [];
  const sirketXmls = resp.match(/<sirketListesi>([\s\S]*?)<\/sirketListesi>/g) || [];
  for (const sx of sirketXmls) {
    firmalar.push({
      sirketId: xmlDeger(sx, 'sirketId'),
      donemId: xmlDeger(sx, 'donemId'),
      kisaAd: xmlDeger(sx, 'kisaAd'),
      donemBas: xmlDeger(sx, 'donemBas'),
      donemBit: xmlDeger(sx, 'donemBit'),
      vergiNo: xmlDeger(sx, 'vergiNo'),
      tckNo: xmlDeger(sx, 'tckNo'),
      hukukiMahiyet: xmlDeger(sx, 'hukukiMahiyet'),
      eenvanter: xmlDeger(sx, 'eenvanter'),
      acilisFisiTarihi: xmlDeger(sx, 'acilisFisiTarihi'),
      kapanisFisiTarihi: xmlDeger(sx, 'kapanisFisiTarihi'),
      defterSilebilirMi: xmlDeger(sx, 'defterSilebilirMi')
    });
  }
  return {
    ok: rc === '0',
    responseCode: rc,
    responseMessage: rm,
    token: token,
    versiyonDevamEt: versiyonDevamEt === 'true',
    firmalar: firmalar
  };
}

// 2. Defter olustur
async function lucaDefterOlustur(token, donemId, yil, ay, basTarihTR, bitTarihTR, parttakiFisSayisi) {
  // Tarihleri US formatina cevir
  const basUS = trToUs(basTarihTR);
  const bitUS = trToUs(bitTarihTR);
  const body = '<typ:DefterOlusturRequest>' +
    '<typ:token>' + token + '</typ:token>' +
    '<typ:donemId>' + donemId + '</typ:donemId>' +
    '<typ:yil>' + yil + '</typ:yil>' +
    '<typ:ay>' + ay + '</typ:ay>' +
    '<typ:basTarih>' + basUS + '</typ:basTarih>' +
    '<typ:bitTarih>' + bitUS + '</typ:bitTarih>' +
    '<typ:parttakiFisSayisi>' + (parttakiFisSayisi || 1000) + '</typ:parttakiFisSayisi>' +
    '</typ:DefterOlusturRequest>';
  const resp = await soapCagir(body);
  return {
    ok: xmlDeger(resp, 'responseCode') === '0',
    responseCode: xmlDeger(resp, 'responseCode'),
    responseMessage: xmlDeger(resp, 'responseMessage'),
    logId: xmlDeger(resp, 'logId'),
    raw: resp
  };
}

// 3. Defter durum (logId ile - belirli bir islem)
async function lucaDefterDurum(token, donemId, logId) {
  let body = '<typ:DefterDurumRequest>' +
    '<typ:token>' + token + '</typ:token>' +
    '<typ:donemId>' + donemId + '</typ:donemId>';
  if (logId) body += '<typ:logId>' + logId + '</typ:logId>';
  body += '</typ:DefterDurumRequest>';
  const resp = await soapCagir(body);
  return {
    ok: xmlDeger(resp, 'responseCode') === '0',
    responseCode: xmlDeger(resp, 'responseCode'),
    responseMessage: xmlDeger(resp, 'responseMessage'),
    donemId: xmlDeger(resp, 'donemId'),
    logId: xmlDeger(resp, 'logId'),
    basarili: xmlDeger(resp, 'basarili'),
    tarih: xmlDeger(resp, 'tarih'),
    raw: resp
  };
}

// 4. Defter listesi (yil/ay ile)
async function lucaDefterListesiByYilAy(token, donemId, yil, ay, tip) {
  const body = '<typ:DefterListesiByYilAyRequest>' +
    '<typ:token>' + token + '</typ:token>' +
    '<typ:donemId>' + donemId + '</typ:donemId>' +
    (yil ? '<typ:yil>' + yil + '</typ:yil>' : '') +
    (ay ? '<typ:ay>' + ay + '</typ:ay>' : '') +
    (tip ? '<typ:tip>' + tip + '</typ:tip>' : '') +
    '</typ:DefterListesiByYilAyRequest>';
  const resp = await soapCagir(body);
  const defterler = [];
  const defterXmls = resp.match(/<defterListesi>([\s\S]*?)<\/defterListesi>/g) || [];
  for (const dx of defterXmls) {
    defterler.push({
      donemId: xmlDeger(dx, 'donemId'),
      logId: xmlDeger(dx, 'logId'),
      partNo: xmlDeger(dx, 'partNo'),
      siraNo: xmlDeger(dx, 'siraNo'),
      basTarih: xmlDeger(dx, 'basTarih'),
      bitTarih: xmlDeger(dx, 'bitTarih'),
      fisNoBas: xmlDeger(dx, 'fisNoBas'),
      fisNoBit: xmlDeger(dx, 'fisNoBit'),
      md5Kebir: xmlDeger(dx, 'md5Kebir'),
      md5Yevmiye: xmlDeger(dx, 'md5Yevmiye')
    });
  }
  return {
    ok: xmlDeger(resp, 'responseCode') === '0',
    responseCode: xmlDeger(resp, 'responseCode'),
    responseMessage: xmlDeger(resp, 'responseMessage'),
    defterler: defterler
  };
}

// 5. XML olustur
async function lucaXmlOlustur(token, donemId, sirketId, defterNo, defterTipi) {
  const body = '<typ:XMLOlusturRequest>' +
    '<typ:token>' + token + '</typ:token>' +
    '<typ:donemId>' + donemId + '</typ:donemId>' +
    '<typ:sirketId>' + sirketId + '</typ:sirketId>' +
    (defterNo ? '<typ:defterNo>' + defterNo + '</typ:defterNo>' : '') +
    (defterTipi ? '<typ:defterTipi>' + defterTipi + '</typ:defterTipi>' : '') +
    '</typ:XMLOlusturRequest>';
  const resp = await soapCagir(body);
  return {
    ok: xmlDeger(resp, 'responseCode') === '0',
    responseCode: xmlDeger(resp, 'responseCode'),
    responseMessage: xmlDeger(resp, 'responseMessage'),
    raw: resp
  };
}

// 6. XML durum
async function lucaXmlDurum(token, donemId, sirketId, defterNo, defterTipi) {
  const body = '<typ:XMLDurumRequest>' +
    '<typ:token>' + token + '</typ:token>' +
    '<typ:donemId>' + donemId + '</typ:donemId>' +
    '<typ:sirketId>' + sirketId + '</typ:sirketId>' +
    (defterNo ? '<typ:defterNo>' + defterNo + '</typ:defterNo>' : '') +
    (defterTipi ? '<typ:defterTipi>' + defterTipi + '</typ:defterTipi>' : '') +
    '</typ:XMLDurumRequest>';
  const resp = await soapCagir(body);
  return {
    ok: xmlDeger(resp, 'responseCode') === '0',
    responseCode: xmlDeger(resp, 'responseCode'),
    responseMessage: xmlDeger(resp, 'responseMessage'),
    kod: xmlDeger(resp, 'kod'),
    durum: xmlDeger(resp, 'durum'),
    raw: resp
  };
}

// 7. Son part bilgi
async function lucaSonPartBilgi(token, donemId, basTarihTR, bitTarihTR) {
  const basUS = trToUs(basTarihTR);
  const bitUS = trToUs(bitTarihTR);
  const body = '<typ:SonPartBilgiRequest>' +
    '<typ:token>' + token + '</typ:token>' +
    '<typ:donemId>' + donemId + '</typ:donemId>' +
    '<typ:basTarih>' + basUS + '</typ:basTarih>' +
    '<typ:bitTarih>' + bitUS + '</typ:bitTarih>' +
    '</typ:SonPartBilgiRequest>';
  const resp = await soapCagir(body);
  return {
    ok: xmlDeger(resp, 'responseCode') === '0',
    responseCode: xmlDeger(resp, 'responseCode'),
    responseMessage: xmlDeger(resp, 'responseMessage'),
    fisSayisi: xmlDeger(resp, 'fisSayisi'),
    numaralandirilmamisIlkGunFisSayisi: xmlDeger(resp, 'numaralandirilmamisIlkGunFisSayisi'),
    mesaj: xmlDeger(resp, 'mesaj'),
    raw: resp
  };
}

// 8. Defter sil
async function lucaDefterSil(token, donemId, yil, ay, envanterMi) {
  const body = '<typ:DefterSilRequest>' +
    '<typ:token>' + token + '</typ:token>' +
    '<typ:donemId>' + donemId + '</typ:donemId>' +
    '<typ:yil>' + yil + '</typ:yil>' +
    '<typ:ay>' + ay + '</typ:ay>' +
    '<typ:envanterMi>' + (envanterMi ? 'true' : 'false') + '</typ:envanterMi>' +
    '</typ:DefterSilRequest>';
  const resp = await soapCagir(body);
  return {
    ok: xmlDeger(resp, 'responseCode') === '0',
    responseCode: xmlDeger(resp, 'responseCode'),
    responseMessage: xmlDeger(resp, 'responseMessage'),
    raw: resp
  };
}

// 9. Zaman damgali mi
async function lucaZamanDamgaliMi(token, yil, ay) {
  const body = '<typ:ZamanDamgaliImzaliRequest>' +
    '<typ:token>' + token + '</typ:token>' +
    '<typ:yil>' + yil + '</typ:yil>' +
    '<typ:ay>' + ay + '</typ:ay>' +
    '</typ:ZamanDamgaliImzaliRequest>';
  const resp = await soapCagir(body);
  return {
    ok: xmlDeger(resp, 'responseCode') === '0',
    responseCode: xmlDeger(resp, 'responseCode'),
    responseMessage: xmlDeger(resp, 'responseMessage'),
    imzalansin: xmlDeger(resp, 'imzalansin') === 'true'
  };
}

// ============================================================
// YUKSEK SEVIYE: Tek firma icin tam defter olusturma akisi
// ============================================================
async function lucaDefterOlusturTam(krediler, firma, yil, ay, logCb) {
  const log = logCb || function() {};
  const musteriId = krediler.musteriId || krediler.uyeNo;
  const kullaniciAdi = krediler.kullaniciAdi || krediler.kullanici;
  const parola = krediler.parola;

  // 1. Giris
  log('Luca SOAP giris yapiliyor...');
  const giris = await lucaGiris(musteriId, kullaniciAdi, parola, yil, ay);
  if (!giris.ok) {
    return { ok: false, error: 'Giris basarisiz: ' + (giris.responseMessage || giris.responseCode), responseCode: giris.responseCode };
  }
  log('Giris basarili. Firma sayisi: ' + giris.firmalar.length);
  const token = giris.token;

  // Firma bilgisi
  const sirketId = firma.sirketId || firma.sirket_id;
  const donemId = firma.donemId || firma.donem_id;
  if (!sirketId || !donemId) {
    return { ok: false, error: 'Firma bilgisi eksik (sirketId/donemId)' };
  }

  // Tarih araligi
  const sonGun = ayinSonGunu(parseInt(yil), parseInt(ay));
  const ayStr = String(ay).padStart(2, '0');
  const basTarihTR = '01.' + ayStr + '.' + yil;
  const bitTarihTR = String(sonGun).padStart(2, '0') + '.' + ayStr + '.' + yil;

  // 2. Defter olustur
  log('Defter olusturuluyor: ' + basTarihTR + ' - ' + bitTarihTR);
  const olustur = await lucaDefterOlustur(token, donemId, yil, ay, basTarihTR, bitTarihTR, 1000);
  if (!olustur.ok) {
    return { ok: false, error: 'Defter olusturma basarisiz: ' + (olustur.responseMessage || olustur.responseCode), responseCode: olustur.responseCode, logId: olustur.logId };
  }
  log('Defter olusturma baslatildi. logId: ' + olustur.logId);
  const logId = olustur.logId;

  // 3. Durum sorgula (poll)
  let durum = null;
  let minimalSayac = 0;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000));
    durum = await lucaDefterDurum(token, donemId, logId);
    log('Durum [' + i + ']: rc=' + durum.responseCode + ' basarili=' + durum.basarili + ' msg=' + (durum.responseMessage || '').substring(0, 120));
    // basarili=1 -> basari, basarili=2 -> zaten var
    if (durum.basarili === '1' || durum.basarili === '2') break;
    // rc != 0 ve basarili=0 -> hata
    if (durum.responseCode !== '0' && durum.responseCode !== null) {
      break;
    }
    // Minimal response (sadece responseCode=0, basarili yok) -> islem tamamlandi
    if (durum.responseCode === '0' && !durum.basarili) {
      minimalSayac++;
      if (minimalSayac >= 2) break; // 2 kez minimal -> tamamlandi
    }
  }

  // Durum degerlendirme
  const sonuc = {
    ok: false,
    token: token,
    logId: logId,
    donemId: donemId,
    sirketId: sirketId,
    basTarih: basTarihTR,
    bitTarih: bitTarihTR,
    responseCode: durum ? durum.responseCode : null,
    responseMessage: durum ? durum.responseMessage : null,
    basarili: durum ? durum.basarili : null,
    tarih: durum ? durum.tarih : null
  };

  if (durum && (durum.basarili === '1' || durum.basarili === '2')) {
    sonuc.ok = true;
    sonuc.zatenVar = (durum.basarili === '2');
    log('Defter olusturma basarili' + (sonuc.zatenVar ? ' (zaten mevcut)' : ''));
  } else if (durum && durum.responseCode && durum.responseCode !== '0') {
    sonuc.ok = false;
    sonuc.error = durum.responseMessage || ('Hata kodu: ' + durum.responseCode);
    log('HATA: ' + sonuc.error);
    // Fis numaralarini parse et
    const fisNoRegex = /(\d{4,})/g;
    const fisNolar = (durum.responseMessage || '').match(fisNoRegex);
    if (fisNolar) {
      sonuc.fisNolar = fisNolar;
      log('Fis numaralari bulundu: ' + fisNolar.join(', '));
    }
  } else if (durum && durum.responseCode === '0' && !durum.basarili) {
    // Minimal response -> islem basarili tamamlandi
    sonuc.ok = true;
    log('Defter olusturma basarili (minimal response)');
  } else {
    log('Minimal response alindi, genel durum sorgulaniyor...');
    const genelDurum = await lucaDefterDurum(token, donemId, null);
    sonuc.genelDurum = genelDurum;
    if (genelDurum.basarili === '1') {
      sonuc.ok = true;
      log('Genel durum: basarili');
    } else {
      sonuc.ok = false;
      sonuc.error = genelDurum.responseMessage || 'Durum belirsiz';
      log('Genel durum: ' + (genelDurum.responseMessage || 'belirsiz'));
    }
  }

  return sonuc;
}

// ============================================================
// EXPORT
// ============================================================
module.exports = {
  soapCagir,
  xmlDeger,
  xmlDegerler,
  trToUs,
  usToTr,
  lucaGiris,
  lucaDefterOlustur,
  lucaDefterDurum,
  lucaDefterListesiByYilAy,
  lucaXmlOlustur,
  lucaXmlDurum,
  lucaSonPartBilgi,
  lucaDefterSil,
  lucaZamanDamgaliMi,
  lucaDefterOlusturTam
};