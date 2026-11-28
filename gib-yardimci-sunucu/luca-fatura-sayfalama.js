const path = require("path");
const AdmZip = require("adm-zip");
const { DOMParser } = require("@xmldom/xmldom");

function faturaSayfaEylemi({ menu, bas, bit, eylem = "oku", kimlikler = [], durumDogrula = false }) {
  if (window.menu_tur !== menu) throw new Error("Luca fatura ekranının belge türü değişti.");
  const temizle = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const gorunur = (element) => element && element.getClientRects().length > 0;
  const tarih = (value) => {
    const match = temizle(value).match(/^(\d{2})[/.](\d{2})[/.](\d{4})$/);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
  };
  const satirAnahtari = (invoice, cells) => {
    const no = temizle(invoice.belge_numarasi || invoice.belgeNumarasi || invoice.evrak_no).toUpperCase();
    const ettn = temizle(invoice.ettn || invoice.uuid).toLowerCase();
    return ettn ? JSON.stringify(["ettn", no, ettn]) : JSON.stringify(["row", Object.keys(invoice).sort().map((key) => [key, invoice[key]]), cells.map(temizle)]);
  };
  const kutular = Array.from(document.querySelectorAll(".sec")).filter((box) => box.closest("tr")?.getAttribute("fatura"));
  const satirlar = kutular.map((box) => {
    const row = box.closest("tr");
    const invoice = JSON.parse(row.getAttribute("fatura"));
    const cells = Array.from(row.cells).map((cell) => cell.innerText || "");
    const no = temizle(invoice.belge_numarasi || invoice.belgeNumarasi || invoice.evrak_no);
    if (!no) throw new Error("Luca fatura satırının belge numarası okunamadı.");
    return { box, invoice, cells, no, key: satirAnahtari(invoice, cells) };
  });
  const controls = Array.from(document.querySelectorAll('a,button,input[type="button"],input[type="image"]')).filter(gorunur);
  const find = (direction) => {
    const words = direction === "next" ? /^(sonraki(?: sayfa)?|ileri|next(?: page)?|[>›»])$/i : /^(önceki(?: sayfa)?|geri|previous(?: page)?|prev|[<‹«])$/i;
    const matches = controls.filter((el) => {
      const image = el.querySelector("img");
      const values = [el.getAttribute("aria-label"), el.title, el.innerText, el.value, el.getAttribute("rel"), image?.alt, image?.title].map(temizle);
      for (const value of values) if (words.test(value)) return true;
      const src = image?.getAttribute("src") || (el.type === "image" ? el.getAttribute("src") : "") || "";
      return (direction === "next" ? /(?:^|[/_-])next(?:[_.-]|$)/i : /(?:^|[/_-])(?:prev|previous)(?:[_.-]|$)/i).test(src);
    });
    if (matches.length > 1) throw new Error("Luca sayfalama düğmesi tekil değil.");
    return matches[0];
  };
  const next = find("next"), previous = find("previous");
  const disabled = (el) => !el || el.disabled || el.getAttribute("aria-disabled") === "true" || /(?:^|\s)(?:disabled|inactive)(?:\s|$)/i.test(el.className || "");
  const pager = { nextKnown: !!next, hasNext: !disabled(next), hasPrevious: !disabled(previous) };
  const messages = Array.from(document.querySelectorAll("div,span")).map((el) => temizle(el.innerText || el.textContent));
  const info = messages.map((text) => text.match(/^(\d+)\s+adet fatura bulundu\.\s*\(Sayfa\s*No:\s*(\d+)\)$/i)).filter(Boolean).pop();
  const identities = satirlar.map((row) => row.key);
  if (info && Number(info[1]) === identities.length) {
    pager.pageNumber = Number(info[2]);
    if (pager.pageNumber === 1) pager.hasPrevious = false;
    if (Number(info[1]) < 500) { pager.hasNext = false; pager.nextKnown = true; }
  }
  const fingerprint = JSON.stringify([menu, identities]);
  if (identities.length && pager.pageNumber) window.__mubisFaturaPager = { fingerprint, pager: { ...pager } };
  else if (identities.length && window.__mubisFaturaPager?.fingerprint === fingerprint) Object.assign(pager, window.__mubisFaturaPager.pager);
  if (eylem === "next" || eylem === "previous") {
    const target = eylem === "next" ? next : previous;
    if (disabled(target) || eylem === "previous" && pager.pageNumber === 1) throw new Error("Luca sayfa geçişi doğrulanamadı.");
    target.click();
    return { clicked: true };
  }
  if (eylem === "refresh") {
    const matches = controls.filter((el) => {
      for (const value of [el.innerText, el.value, el.title, el.getAttribute("aria-label")]) if (temizle(value) === "Yenile") return true;
      return false;
    });
    if (matches.length !== 1 || disabled(matches[0])) throw new Error("Luca Yenile düğmesi doğrulanamadı.");
    window.__mubisListeYenileme?.observer?.disconnect();
    const takip = { degisti: false };
    const tablo = satirlar[0]?.box.closest("table");
    if (!tablo?.parentElement) throw new Error("Luca fatura tablosu doğrulanamadı; yenileme başlatılmadı.");
    takip.observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.target === tablo || tablo.contains(mutation.target) || [...mutation.removedNodes].some((node) => node === tablo || node.contains?.(tablo)))) takip.degisti = true;
    });
    takip.observer.observe(tablo.parentElement, { childList: true, subtree: true, characterData: true });
    window.__mubisListeYenileme = takip;
    delete window.__mubisFaturaPager;
    matches[0].click();
    return { clicked: true };
  }
  if (eylem === "iptal-sorgula") {
    if (!kimlikler.length || satirlar.filter((row) => row.box.checked).length !== kimlikler.length || kimlikler.some((key) => !satirlar.some((row) => row.key === key && row.box.checked))) throw new Error("İptal/itiraz sorgusu için fatura seçimi doğrulanamadı.");
    const matches = controls.filter((el) => [el.innerText, el.value, el.title, el.getAttribute("aria-label")].some((value) => temizle(value).toLocaleLowerCase("tr") === "seçilenleri iptal/itiraz sorgula"));
    if (matches.length !== 1 || disabled(matches[0])) throw new Error("Luca iptal/itiraz sorgulama düğmesi doğrulanamadı; indirme başlatılmadı.");
    matches[0].click();
    return { clicked: true };
  }
  if (eylem === "sec") {
    if (!kimlikler.length || new Set(kimlikler).size !== kimlikler.length) throw new Error("İndirilecek fatura kimlikleri doğrulanamadı.");
    for (const key of kimlikler) if (satirlar.filter((row) => row.key === key).length !== 1) throw new Error("İndirilecek fatura satırı tekil olarak doğrulanamadı.");
    const wanted = new Set(kimlikler);
    for (const row of satirlar) {
      const selected = wanted.has(row.key);
      if (!!row.box.checked !== selected) row.box.click();
    }
    for (const row of satirlar) if (!!row.box.checked !== wanted.has(row.key)) throw new Error("Luca fatura seçimi doğrulanamadı.");
    return { secili: kimlikler.length };
  }
  if (document.readyState !== "complete" || (typeof window.jQuery?.active === "number" && window.jQuery.active > 0)) return { pending: true };
  if (durumDogrula && !window.__mubisListeYenileme?.degisti) return { pending: true };
  let dateIndex = -1, statusIndex = -1;
  for (const row of document.querySelectorAll("tr")) {
    const cells = Array.from(row.cells);
    const date = cells.findIndex((cell) => temizle(cell.innerText) === "Belge Tarihi");
    const status = cells.findIndex((cell) => temizle(cell.innerText) === "Onay Durumu");
    if (date >= 0) dateIndex = date;
    if (status >= 0) statusIndex = status;
    if (dateIndex >= 0 && (!durumDogrula || statusIndex >= 0)) break;
  }
  if (durumDogrula && statusIndex < 0) throw new Error("Luca Onay Durumu sütunu doğrulanamadı; indirme başlatılmadı.");
  const first = tarih(bas), last = tarih(bit);
  if (!first || !last || first > last) throw new Error("Fatura dönemi doğrulanamadı.");
  const records = [];
  for (const row of satirlar) {
    const date = dateIndex >= 0 ? tarih(row.cells[dateIndex]) : "";
    if (!date) throw new Error("Luca fatura satırının belge tarihi okunamadı; indirme başlatılmadı.");
    if (date >= first && date <= last) records.push({ no: row.no, ettn: temizle(row.invoice.ettn || row.invoice.uuid), key: row.key, ...(durumDogrula ? { durum: temizle(row.cells[statusIndex]) } : {}) });
  }
  const text = document.body?.innerText || "";
  const count = text.match(/(\d+)\s+adet fatura bulundu/i);
  const empty = /her\s*hangi\s+bir\s+fatura\s+bulunamad[ıi]/i.test(text) || !!count && Number(count[1]) === 0;
  if (!satirlar.length && !empty) return { pending: true };
  if (!satirlar.length && empty) Object.assign(pager, { hasPrevious: false, hasNext: false, nextKnown: true });
  return { identities, records, pager, total: pager.pageNumber ? null : count ? Number(count[1]) : null };
}

function arsiviDogrula(bytes, records) {
  const validateZip = (data) => {
    const tail = data.subarray(Math.max(0, data.length - 16384)).toString("utf8");
    for (const match of tail.matchAll(/\{\s*"error"\s*:/g)) {
      try {
        const result = JSON.parse(tail.slice(match.index).trim());
        if (typeof result.error === "string" && result.error) throw new Error(`Luca toplu indirme servisi: ${result.error}`);
      } catch (error) {
        if (/^Luca toplu indirme servisi:/.test(error.message)) throw error;
      }
    }
    let end = -1;
    for (let offset = data.length - 22; offset >= Math.max(0, data.length - 65557); offset--) {
      if (data.readUInt32LE(offset) === 0x06054b50 && offset + 22 + data.readUInt16LE(offset + 20) === data.length) { end = offset; break; }
    }
    if (end < 0) throw new Error("Luca ZIP dosyası eksik; arşiv sonu bulunamadı.");
  };
  const leaves = [];
  const visit = (data, depth) => {
    if (depth > 5) throw new Error("Luca ZIP iç içe arşiv sınırı aşıldı.");
    validateZip(data);
    const zip = new AdmZip(data);
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const content = entry.getData();
      if (/\.zip$/i.test(entry.entryName)) visit(content, depth + 1);
      else leaves.push({ name: entry.entryName, content });
    }
  };
  try { visit(bytes, 0); } catch (error) { throw new Error(`Luca ZIP içeriği doğrulanamadı: ${error.message}`); }
  const comparable = (value) => String(value || "").trim().toLowerCase().replace(/^([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})#\d{10,11}$/, "$1");
  const candidates = [];
  for (const leaf of leaves) {
    if (/\.xml$/i.test(leaf.name)) {
      let invalid = false, doc;
      try { doc = new DOMParser({ onError: () => { invalid = true; } }).parseFromString(leaf.content.toString("utf8"), "text/xml"); } catch { continue; }
      if (invalid || !doc.documentElement) continue;
      let no = "", ettn = "";
      for (let node = doc.documentElement.firstChild; node; node = node.nextSibling) {
        if (node.nodeType !== 1) continue;
        if (node.localName === "ID" && !no) no = String(node.textContent || "").trim().toUpperCase();
        if (node.localName === "UUID" && !ettn) ettn = String(node.textContent || "").trim();
      }
      if (no) candidates.push({ no, ettn });
    } else if (/\.pdf$/i.test(leaf.name) && leaf.content.length >= 2000 && leaf.content.subarray(0, 5).toString() === "%PDF-" || /\.html?$/i.test(leaf.name) && leaf.content.toString("utf8").trim()) {
      candidates.push({ stem: path.basename(leaf.name.replace(/\\/g, "/"), path.extname(leaf.name)).toUpperCase() });
    }
  }
  const missing = records.filter((record) => !candidates.some((candidate) => {
    const no = record.no.toUpperCase();
    if (candidate.stem) return record.ettn && comparable(candidate.stem) === comparable(record.ettn) || candidate.stem === no && records.filter((other) => other.no.toUpperCase() === no).length === 1;
    return candidate.no === no && (!(candidate.ettn && record.ettn) || comparable(candidate.ettn) === comparable(record.ettn));
  }));
  if (missing.length) {
    const error = new Error(`Luca ZIP içinde ${missing.length}/${records.length} fatura kimliği doğrulanamadı; indirme tamamlanmadı.`);
    error.code = "LUCA_ARCHIVE_INCOMPLETE";
    throw error;
  }
  return true;
}

function kurtarilabilirArsivHatasi(error) {
  const message = String(error?.message || "");
  return error?.code === "LUCA_ARCHIVE_INCOMPLETE"
    || /Veri alınamadı veya veri boyutu çok küçük/i.test(message)
    || /^Luca toplu ZIP hatasi:\s*Beklenmeyen hata\.?$/i.test(message.trim())
    || /^Luca toplu indirme servisi:\s*Beklenmeyen hata\.?$/i.test(message.trim());
}

function iptalTakipEkrani(eylem) {
  const panel = document.querySelector("#luca-board");
  if (!panel || !panel.getClientRects().length || getComputedStyle(panel).display === "none" || getComputedStyle(panel).visibility === "hidden") return null;
  const metin = String(panel.innerText || "");
  if (!/işlem\s*takip/.test(metin.toLocaleLowerCase("tr"))) return null;
  if (eylem === "kapat") {
    const buttons = [...panel.querySelectorAll("button, input, a, [onclick]")].filter((el) => el.getClientRects().length && String(el.innerText || el.textContent || el.value || "").trim().toLocaleLowerCase("tr") === "kapat");
    if (buttons.length !== 1) throw new Error("Luca işlem takip penceresi kapatılamadı.");
    buttons[0].click();
  }
  return metin;
}

function iptalTakipSonucunuOku(metin, records, ilerleme) {
  const expected = new Set(records.map((record) => record.no.toUpperCase()));
  if (expected.size !== records.length) throw new Error("Aynı fatura numarası birden fazla kez listelendi; iptal/itiraz sonucu eşleştirilemedi.");
  const matches = [...String(metin || "").matchAll(/\[(\d+)\s*\/\s*(\d+)\]\s*([^\s:]+)\s*:\s*([^\r\n\[]+)/g)];
  if (!matches.length) return null;
  const found = new Map(), indexes = new Set();
  for (const match of matches) {
    const index = Number(match[1]), total = Number(match[2]), no = match[3].trim().toUpperCase(), status = match[4].trim();
    if (total !== records.length || index < 1 || index > total || indexes.has(index) || !expected.has(no) || found.has(no)) throw new Error("Luca iptal/itiraz takip satırları seçilen faturalarla eşleşmedi.");
    indexes.add(index);
    const normalized = status.toLocaleLowerCase("tr");
    if (/hata|başarısız|basarisiz|sorgulanamad|zaman\s*aşım/.test(normalized)) throw new Error("Luca iptal/itiraz sorgusunda hata bildirdi; indirme başlatılmadı.");
    if (/iptal|itiraz|\bred\b|redded/.test(normalized)) found.set(no, "iptal");
    else if (/^fatura\s+var\s*\/\s*geçerli[.!]?$/.test(normalized)) found.set(no, "gecerli");
    else throw new Error("Luca iptal/itiraz sonucu tanınmadı; indirme başlatılmadı.");
  }
  ilerleme?.(found.size, records.length);
  if (found.size !== records.length) return null;
  return found;
}

async function iptalItirazSorgula({ frame, menu, bas, bit, records, iptal, log, ilerleme }) {
  if (!records.length) return [];
  if (new Set(records.map((record) => record.no.toUpperCase())).size !== records.length) throw new Error("Fatura numaraları tekil değil; iptal/itiraz sorgusu başlatılmadı.");
  const frames = () => frame.page().frames();
  for (const candidate of frames()) {
    if (await candidate.evaluate(iptalTakipEkrani).catch(() => null)) throw new Error("Luca işlem takip penceresi açık; önceki işlemin tamamlandığını doğrulayın.");
  }
  const kimlikler = records.map((record) => record.key);
  await frame.evaluate(faturaSayfaEylemi, { menu, bas, bit, eylem: "sec", kimlikler });
  log(`${records.length} fatura için iptal/itiraz sorgulanıyor`);
  await frame.evaluate(faturaSayfaEylemi, { menu, bas, bit, eylem: "iptal-sorgula", kimlikler });
  const deadline = Date.now() + 20 * 60 * 1000;
  let result = null, takipFrame = null, sonIlerleme = 0;
  const ilerlemeyiBildir = (sayi, toplam) => {
    if (sayi > sonIlerleme) { sonIlerleme = sayi; ilerleme?.(sayi, toplam); }
  };
  while (Date.now() < deadline) {
    iptal();
    for (const candidate of frames()) {
      const metin = await candidate.evaluate(iptalTakipEkrani).catch(() => null);
      if (!metin) continue;
      const parsed = iptalTakipSonucunuOku(metin, records, ilerlemeyiBildir);
      if (parsed) { result = parsed; takipFrame = candidate; break; }
    }
    if (result) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!result) throw new Error("Luca iptal/itiraz sorgusunun tüm faturalar için tamamlandığı doğrulanamadı; indirme başlatılmadı.");
  await takipFrame.evaluate(iptalTakipEkrani, "kapat");
  await frame.evaluate(faturaSayfaEylemi, { menu, bas, bit, eylem: "refresh" });
  const refreshDeadline = Date.now() + 30000;
  let refreshed = null;
  while (Date.now() < refreshDeadline) {
    iptal();
    const current = await frame.evaluate(faturaSayfaEylemi, { menu, bas, bit, durumDogrula: true });
    if (!current.pending) { refreshed = current; break; }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  if (!refreshed) throw new Error("Luca fatura listesi yenilenemedi; indirme başlatılmadı.");
  const yeniler = new Map(refreshed.records.map((record) => [record.no.toUpperCase(), record]));
  if (yeniler.size !== records.length || refreshed.records.length !== records.length) throw new Error("Luca yenilemesinde fatura listesi değişti; indirme başlatılmadı.");
  const allowed = [];
  for (const original of records) {
    const key = original.no.toUpperCase(), updated = yeniler.get(key);
    if (!updated || String(original.ettn || "").toLowerCase() !== String(updated.ettn || "").toLowerCase()) throw new Error("Luca yenilemesinde fatura kimliği değişti; indirme başlatılmadı.");
    const status = updated.durum.toLocaleLowerCase("tr");
    const cancelled = /iptal|itiraz|redded|\bred\b/i.test(status);
    if (result.get(key) === "iptal" && !cancelled) throw new Error("Luca iptal sonucu yenilenen listede doğrulanamadı; indirme başlatılmadı.");
    if (cancelled) continue;
    if (!/^onaylandı[.!]?$/i.test(status)) throw new Error("Luca fatura onay durumu doğrulanamadı; indirme başlatılmadı.");
    allowed.push(updated);
  }
  log(`İptal/itiraz sorgusu tamamlandı: ${records.length - allowed.length} geçersiz fatura indirmeden çıkarıldı`);
  return { records: allowed, page: refreshed };
}

async function sayfalariIndir({ frame, menu, bas, bit, indir, log, iptal, ilerleme }) {
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const read = async (previous) => {
    const deadline = Date.now() + 30000;
    let refreshed = false;
    while (Date.now() < deadline) {
      iptal();
      const page = await frame.evaluate(faturaSayfaEylemi, { menu, bas, bit });
      if (!page.pending && (!previous || JSON.stringify(page.identities) !== previous)) {
        if (page.pager.hasPrevious && !page.pager.pageNumber) {
          if (!refreshed) { refreshed = true; await frame.evaluate(faturaSayfaEylemi, { menu, bas, bit, eylem: "refresh" }); }
        } else return page;
      }
      await pause(350);
    }
    throw new Error("Luca fatura sayfası veya sayfa geçişi 30 saniyede doğrulanamadı.");
  };
  let page = await read(), pageCount = 0, batchCount = 0, expected = 0, downloaded = 0;
  const backwards = new Set(), seenPages = new Set(), seenInvoices = new Set(), failed = [];
  const recover = async (batch) => {
    iptal();
    await frame.evaluate(faturaSayfaEylemi, { menu, bas, bit, eylem: "sec", kimlikler: batch.map((record) => record.key) });
    log(`${pageCount}. sayfa / ${++batchCount}. paket: ${batch.length} fatura indiriliyor`);
    try {
      await indir(batch);
      downloaded += batch.length;
    } catch (error) {
      if (!kurtarilabilirArsivHatasi(error)) throw error;
      if (batch.length === 1) {
        failed.push({ record: batch[0], reason: error.message });
        return;
      }
      const middle = Math.ceil(batch.length / 2);
      log(`Arşiv içeriği doğrulanamadı; ${batch.length} fatura iki küçük pakette yeniden denenecek.`);
      await recover(batch.slice(0, middle));
      await recover(batch.slice(middle));
    }
  };
  while (page.pager.hasPrevious) {
    const fingerprint = JSON.stringify(page.identities);
    if (backwards.has(fingerprint) || backwards.size >= 10000) throw new Error("Luca ilk fatura sayfasına dönüş doğrulanamadı.");
    backwards.add(fingerprint);
    await frame.evaluate(faturaSayfaEylemi, { menu, bas, bit, eylem: "previous" });
    page = await read(fingerprint);
  }
  while (true) {
    iptal();
    const fingerprint = JSON.stringify(page.identities);
    if (seenPages.has(fingerprint) || ++pageCount > 10000) throw new Error("Luca fatura sayfası tekrarlandı; eksiksiz indirme doğrulanamadı.");
    seenPages.add(fingerprint);
    expected = Math.max(expected, page.total || 0);
    for (const identity of page.identities) {
      if (seenInvoices.has(identity)) throw new Error("Luca fatura sayfaları çakışıyor; liste değişmiş olabilir.");
      seenInvoices.add(identity);
    }
    if (page.records.length) {
      const kontrol = await iptalItirazSorgula({ frame, menu, bas, bit, records: page.records, iptal, log, ilerleme });
      if (kontrol.page.identities.length !== page.identities.length || page.pager.pageNumber && kontrol.page.pager.pageNumber !== page.pager.pageNumber) throw new Error("Luca yenilemesinde fatura sayfası değişti; indirme başlatılmadı.");
      page = kontrol.page;
      for (let offset = 0; offset < kontrol.records.length; offset += 500) {
        await recover(kontrol.records.slice(offset, offset + 500));
      }
    }
    if (!page.pager.hasNext) {
      if (!page.pager.nextKnown && page.identities.length >= 500 || seenInvoices.size < expected) throw new Error("Luca son sayfa veya toplam fatura sayısı doğrulanamadı.");
      if (failed.length) {
        const error = new Error(`${downloaded} fatura indirildi; ${failed.length} fatura doğrulanamadı: ${failed.map(({ record }) => record.no).join(", ")}.`);
        error.code = "LUCA_INVOICES_INCOMPLETE";
        error.failedInvoices = failed;
        throw error;
      }
      return { pages: pageCount, listed: seenInvoices.size, downloaded };
    }
    const sonParmakIzi = JSON.stringify(page.identities);
    await frame.evaluate(faturaSayfaEylemi, { menu, bas, bit, eylem: "next" });
    page = await read(sonParmakIzi);
  }
}

function modernZipYakala() {
  const original = window.topluFaturaZipIndir;
  const jq = window.$j || window.jQuery;
  if (typeof original !== "function" || typeof jq?.ajax !== "function") return false;
  const state = window.__mubisZipKap || (window.__mubisZipKap = { faz: "bekliyor", base64: "", boyut: 0, hata: "" });
  const restore = () => { if (window.topluFaturaZipIndir === wrapper) window.topluFaturaZipIndir = original; };
  const fail = (error) => { state.faz = "hata"; state.hata = String(error?.message || error || "Luca ZIP yanıtı okunamadı."); restore(); };
  const wrapper = function(...args) {
    if (state.faz !== "bekliyor") return;
    const ajax = jq.ajax;
    let intercepted = false;
    jq.ajax = function(options, ...rest) {
      const url = new URL(String(options?.url || ""), window.location.href);
      let data;
      try { data = typeof options.data === "string" ? JSON.parse(options.data) : options.data; } catch { throw new Error("Luca ZIP istek biçimi doğrulanamadı."); }
      if (url.origin !== window.location.origin || url.pathname.toLowerCase() !== "/luca/gib530/toplu_fatura_indir.jq" || (data?.params || data)?.islem !== "toplu_zip_indir") throw new Error("Luca ZIP istek hedefi doğrulanamadı.");
      intercepted = true;
      state.faz = "istek";
      return ajax.call(this, { ...options, success(response) {
        try {
          const zip = response?.data?.zip;
          if (typeof zip !== "string" || !zip.length) throw new Error(response?.error || "Luca ZIP verisi boş.");
          const binary = window.atob(zip);
          if (binary.length < 4 || binary.charCodeAt(0) !== 0x50 || binary.charCodeAt(1) !== 0x4b) throw new Error("Luca yanıtı geçerli ZIP içermiyor.");
          state.base64 = zip;
          state.boyut = binary.length;
          state.faz = "hazir";
          window.Luca?.board?.("Seçilen faturalar başarıyla indirildi.", "success");
        } catch (error) { fail(error); } finally { restore(); }
      }, error(xhr, _text, error) { fail(error || `HTTP ${xhr?.status || "?"}`); } }, ...rest);
    };
    try { original.apply(this, args); if (!intercepted) fail("Luca ZIP isteği doğrulanamadı."); }
    catch (error) { fail(error); }
    finally { jq.ajax = ajax; }
  };
  window.topluFaturaZipIndir = wrapper;
  state.restoreModern = restore;
  return true;
}

module.exports = { faturaSayfaEylemi, arsiviDogrula, sayfalariIndir, modernZipYakala, iptalTakipSonucunuOku, iptalItirazSorgula };
