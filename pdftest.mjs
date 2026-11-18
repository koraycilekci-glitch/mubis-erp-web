import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readFileSync } from 'fs'
const data = new Uint8Array(readFileSync("G:/Drive'ım/BEYANNAME/AHMET SARIKAYA/GELİR VERGİSİ/2025/Beyanname (1).pdf"))
const pdf = await getDocument({ data }).promise
console.log('pages', pdf.numPages)
for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p)
  const content = await page.getTextContent()
  const text = content.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('')
  console.log('===== PAGE', p, '=====')
  console.log(text)
}