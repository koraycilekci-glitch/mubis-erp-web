const path = require("path");
const AdmZip = require("adm-zip");
const { DOMParser } = require("@xmldom/xmldom");

function faturaSayfaEylemi({ menu, bas, bit, eylem = "oku", kimlikler = [] }) {
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
    delete window.__mubisFaturaPager;
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
  let dateIndex = -1;
  for (const row of document.querySelectorAll("tr")) {
    const cells = Array.from(row.cells);
    for (let index = 0; index < cells.length; index++) {
      if (temizle(cells[index].innerText) === "Belge Tarihi") { dateIndex = index; break; }
    }
    if (dateIndex >= 0) break;
  }
  const first = tarih(bas), last = tarih(bit);
  if (!first || !last || first > last) throw new Error("Fatura dönemi doğrulanamadı.");
  const records = [];
  for (const row of satirlar) {
    const date = dateIndex >= 0 ? tarih(row.cells[dateIndex]) : "";
    if (!date) throw new Error("Luca fatura satırının belge tarihi okunamadı; indirme başlatılmadı.");
    if (date >= first && date <= last) records.push({ no: row.no, ettn: temizle(row.invoice.ettn || row.invoice.uuid), key: row.key });
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

async function sayfalariIndir({ frame, menu, bas, bit, indir, log, iptal }) {
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
    for (let offset = 0; offset < page.records.length; offset += 500) {
      await recover(page.records.slice(offset, offset + 500));
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
    await frame.evaluate(faturaSayfaEylemi, { menu, bas, bit, eylem: "next" });
    page = await read(fingerprint);
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

module.exports = { faturaSayfaEylemi, arsiviDogrula, sayfalariIndir, modernZipYakala };
