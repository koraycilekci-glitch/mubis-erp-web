const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

async function main() {
  const { build } = await import('vite')
  const { default: react } = await import('@vitejs/plugin-react')
  const executable = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  if (!fs.existsSync(executable)) throw new Error('Set CHROME_PATH to an installed Chrome executable.')
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'mubis-fis-browser-'))
  const modulePath = file => JSON.stringify(path.resolve(file).replace(/\\/g, '/'))
  const sample = { id: 1, fatura_turu: 'Z RAPORU', fatura_no: 'Z-1897', tarih: '2026-10-19', karsi_unvan: 'ÖRNEK VERİ · Görünüm kontrolü', matrah: 650, kdv: 81, tutar: 731, nakit: 0, kredi: 731,
    kdvDetaylari: [{ oran: 0, matrah: 50, kdv: 0 }, { oran: 1, matrah: 100, kdv: 1 }, { oran: 10, matrah: 200, kdv: 20 }, { oran: 20, matrah: 300, kdv: 60 }] }
  const entry = `import React from ${modulePath(require.resolve('react'))};
    import { createRoot } from ${modulePath(require.resolve('react-dom/client'))};
    import Table from ${modulePath('src/components/FisDokumTablosu.jsx')};
    import Modal from ${modulePath('src/components/FisModal.jsx')};
    import { fisRaporPdf } from ${modulePath('src/utils/fisRapor.js')};
    import ${modulePath('src/index.css')};
    const check = (condition, message) => { if (!condition) throw new Error(message) };
    async function verify() {
      const sample = ${JSON.stringify(sample)};
      let selected = null;
      const root = createRoot(document.getElementById('root'));
      root.render(React.createElement(Table, { faturalar: [sample], onAc: record => selected = record }));
      await new Promise(resolve => setTimeout(resolve, 400));
      const headers = [...document.querySelectorAll('th')].map(header => header.textContent);
      check(headers.join('|') === 'TARİH|EVRAK NO|AÇIKLAMA|MATRAH / KDV ORANI|KDV|KREDİ K.|NAKİT|İŞLEM', 'Wrong receipt headers');
      const rows = [...document.querySelectorAll('tbody tr')];
      check(rows.length === 4, 'One row per VAT rate required');
      check(rows[0].textContent.includes('731,00') && rows[0].textContent.includes('0,00'), 'First row must show payments');
      check(rows.slice(1).every(row => !row.textContent.includes('731,00')), 'Repeated payment totals');
      check([...document.querySelectorAll('td')].every(cell => cell.scrollWidth <= cell.clientWidth + 2), 'Cell contents overlap');
      document.querySelector('button[title="Kayıt dökümünü görüntüle"]').click();
      check(selected?.fatura_no === 'Z-1897', 'Receipt action did not open correct record');
      root.render(React.createElement(Modal, { f: selected, onClose: () => {} }));
      await new Promise(resolve => setTimeout(resolve, 400));
      const frame = document.querySelector('iframe');
      check(frame?.contentDocument?.body.textContent.includes('TOPLAM CİRO'), 'Modal is not the receipt report');
      check(!frame.contentDocument.body.textContent.includes('E-FATURA / E-ARŞİV'), 'Wrong UBL template');
      check(frame.contentDocument.documentElement.scrollWidth <= frame.clientWidth + 2, 'Receipt is clipped');
      const pdf = await fisRaporPdf(sample, false);
      check(pdf.size > 10000, 'Empty PDF');
      const bytes = new Uint8Array(await pdf.arrayBuffer());
      let binary = ''; for (const value of bytes) binary += String.fromCharCode(value);
      return { headers, rows: rows.length, pdf: btoa(binary) };
    }
    verify().then(result => { document.getElementById('verification-result').textContent = JSON.stringify(result) })
      .catch(error => { document.getElementById('verification-result').textContent = JSON.stringify({ error: error.stack || String(error) }) });`
  const entryFile = path.join(output, 'entry.js')
  fs.writeFileSync(entryFile, entry)
  await build({ configFile: false, logLevel: 'warn', plugins: [react()], define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    resolve: { alias: { react: path.dirname(require.resolve('react/package.json')), 'react-dom': path.dirname(require.resolve('react-dom/package.json')) } },
    build: { outDir: output, emptyOutDir: false, copyPublicDir: false, lib: { entry: entryFile, name: 'ReceiptVerification', formats: ['iife'], fileName: () => 'receipt.js', cssFileName: 'receipt' } },
  })
  const html = '<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Z Raporu Testi</title><link rel="stylesheet" href="receipt.css"></head><body style="background:#172d65;color:white;padding:24px"><div id="root"></div><pre id="verification-result">pending</pre><script src="receipt.js" defer></script></body></html>'
  const htmlFile = path.join(output, 'preview.html')
  fs.writeFileSync(htmlFile, html)
  const browser = spawnSync(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--allow-file-access-from-files', '--window-size=1280,960', '--virtual-time-budget=15000', '--dump-dom', '--user-data-dir=' + path.join(output, 'chrome'), 'file:///' + htmlFile.replace(/\\/g, '/')], { encoding: 'utf8', maxBuffer: 10000000, timeout: 60000 })
  if (browser.error) throw browser.error
  const match = browser.stdout.match(/<pre id="verification-result">([\s\S]*?)<\/pre>/)
  assert.ok(match && match[1] !== 'pending', 'Browser test did not complete: ' + browser.stderr.slice(-1500))
  const result = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
  if (result.error) throw new Error(result.error)
  const pdf = Buffer.from(result.pdf, 'base64')
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 1)
  fs.writeFileSync(path.join(output, 'z-raporu-ornek.pdf'), pdf)
  console.log('PASS: browser table layout, VAT rows, non-repeated payments, view action, receipt modal, no clipping and actual single-page PDF generation.')
  console.log(JSON.stringify({ headers: result.headers, rows: result.rows, pdfBytes: pdf.length, output }))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
