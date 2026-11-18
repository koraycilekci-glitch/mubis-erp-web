import { fisDetaylariniDogrula, fisOdemeBilgisi, fisYuvarla } from './fisDetay.js'

const para = deger => deger == null || deger === '' || !Number.isFinite(Number(deger)) ? '—' : Number(deger).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const kacir = deger => String(deger ?? '').replace(/[&<>"']/g, karakter => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[karakter])
const tarihMetni = tarih => String(tarih || '').slice(0, 10).replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3.$2.$1') || '—'

export function fisRaporModeli(fatura) {
  const zMi = (fatura.fatura_turu || fatura.tur) === 'Z RAPORU'
  const toplam = fatura.tutar ?? fatura.toplam
  const detaylar = fisDetaylariniDogrula(fatura.kdvDetaylari, fatura.matrah, fatura.kdv, toplam)
  const odeme = fisOdemeBilgisi(fatura)
  const satir = (etiket, deger) => ({ etiket, deger: para(deger) })
  const bolumler = [{
    baslik: 'Vergi Dökümü',
    gruplar: detaylar.length ? detaylar.map(detay => ({
      etiket: `%${detay.oran} KDV`,
      satirlar: [satir('TOPLAM', fisYuvarla(detay.matrah + detay.kdv)), satir('MATRAH', detay.matrah), satir('KDV', detay.kdv)],
    })) : [{ etiket: 'KDV kırılımı doğrulanamadı', satirlar: [satir('MATRAH', fatura.matrah), satir('KDV', fatura.kdv)] }],
  }]
  if (zMi) {
    bolumler.push(
      { baslik: 'Kasa Döküm', gruplar: [{ etiket: 'Nakit', satirlar: [satir('GİRİŞ', odeme.nakit), satir('ÇIKIŞ', fatura.kasaCikis), satir('BAKİYE', fatura.kasaBakiye)] }] },
      { baslik: 'Banka Döküm', gruplar: [{ etiket: 'Kredi Kartı / POS', satirlar: [satir('GİRİŞ', odeme.kredi), satir('ÇIKIŞ', fatura.bankaCikis), satir('BAKİYE', fatura.bankaBakiye)] }] },
      { baslik: 'Evrak Döküm', gruplar: [{ etiket: 'Fiş', satirlar: [
        { etiket: 'EVRAK SAYISI', deger: fatura.evrakSayisi == null ? '—' : String(fatura.evrakSayisi) },
        satir('TOPLAM TUTAR', toplam), satir('TOPLAM İNDİRİM', fatura.indirim),
      ] }] },
    )
  }
  bolumler.push({ baslik: 'Ödemeler Özet', gruplar: [
    { etiket: 'Nakit', satirlar: [satir('TOPLAM', odeme.nakit)] },
    { etiket: 'Kredi Kartı', satirlar: [satir('TOPLAM', odeme.kredi)] },
  ] })
  return {
    baslik: zMi ? 'Z Raporu' : 'Gider Fişi',
    tarih: tarihMetni(fatura.tarih),
    saat: fatura.saat || '—',
    evrakNo: fatura.fatura_no || fatura.fisNo || fatura.zNo || '—',
    aciklama: fatura.karsi_unvan || fatura.satici || '',
    bolumler,
    toplamEtiket: zMi ? 'TOPLAM CİRO' : 'GENEL TOPLAM',
    toplam: para(toplam),
    uyari: fatura.fisDetayUyari || (!detaylar.length ? 'Kaynak belgedeki KDV kırılımı kontrol edilmelidir.' : ''),
  }
}

export function fisRaporHtml(fatura) {
  const rapor = fisRaporModeli(fatura)
  const bolumler = rapor.bolumler.map(bolum => `<section><h2>${kacir(bolum.baslik)}</h2>${bolum.gruplar.map(grup => `<div class="grup"><div class="etiket">${kacir(grup.etiket)}</div><div class="degerler">${grup.satirlar.map(satir => `<div class="satir"><span>${kacir(satir.etiket)} :</span><strong>${kacir(satir.deger)}</strong></div>`).join('')}</div></div>`).join('')}</section>`).join('')
  return `<!doctype html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${kacir(rapor.baslik)} - ${kacir(rapor.evrakNo)}</title><style>
*{box-sizing:border-box}body{margin:0;padding:20px 12px;background:#f1f1f1;color:#111;font:12px Arial,sans-serif}.rapor{width:100%;max-width:365px;margin:auto;background:#fff;border:1px solid #666}header{padding:15px 12px 12px}h1{font-size:18px;text-align:center;margin:0 0 20px}header p{font-size:11px;margin:8px 0 0;overflow-wrap:anywhere}.bilgi{display:flex;justify-content:space-between;gap:10px;font-size:11px;font-weight:bold}h2{font-size:13px;margin:0;padding:8px 7px;border-top:1px solid #777;border-bottom:1px solid #aaa}section{break-inside:avoid}.grup{display:grid;grid-template-columns:1fr 1.6fr;gap:8px;padding:9px 7px}.grup+.grup{border-top:1px dotted #ddd}.etiket{font-size:11px;padding-top:2px}.degerler{min-width:0}.satir{display:flex;justify-content:space-between;gap:8px;line-height:1.9;font-size:11px}.satir strong{font-weight:normal;white-space:nowrap;font-variant-numeric:tabular-nums}.toplam{display:flex;justify-content:space-between;border-top:2px solid #555;padding:12px 7px;font-size:14px;font-weight:bold}.uyari{padding:8px;font-size:10px;border-top:1px solid #aaa}footer{padding:9px 7px;border-top:1px dotted #aaa;font-size:9px;color:#555;line-height:1.5}@page{size:A4;margin:12mm}@media print{body{background:white;padding:0}.rapor{max-width:96mm;margin:0 auto}h2,.toplam{break-after:avoid}footer{color:#333}}
</style></head><body><article class="rapor"><header><h1>${kacir(rapor.baslik)}</h1><div class="bilgi"><span>Düzenlenme Tarihi : ${kacir(rapor.tarih)}</span><span>Saat : ${kacir(rapor.saat)}</span></div><p><b>EVRAK NO :</b> ${kacir(rapor.evrakNo)}</p>${rapor.aciklama ? `<p>${kacir(rapor.aciklama)}</p>` : ''}</header>${bolumler}<div class="toplam"><span>${kacir(rapor.toplamEtiket)}</span><span>${kacir(rapor.toplam)}</span></div>${rapor.uyari ? `<div class="uyari">${kacir(rapor.uyari)}</div>` : ''}<footer>MUBİS · Kayıt dökümü; resmî yazar kasa belgesi değildir.<br>Kaynakta bulunmayan bilgiler “—” ile gösterilir. Tutarlar TL'dir.</footer></article></body></html>`
}

export async function fisRaporPdf(fatura, indir = true) {
  const { createUnicodePdf } = await import('./unicodePdf.js')
  const rapor = fisRaporModeli(fatura)
  const pdf = createUnicodePdf()
  const sol = 55, sag = 155, genislik = sag - sol
  let y = 15
  const metin = (deger, x, boyut = 9, kalin = false, hizala = 'left') => {
    pdf.setFont('Arial', kalin ? 'bold' : 'normal')
    pdf.setFontSize(boyut)
    pdf.text(String(deger), x, y, { align: hizala })
  }
  const cizgi = () => { pdf.setDrawColor('#777777'); pdf.rect(sol - 2, y, genislik + 4, 0, 'D') }
  const yerAc = yukseklik => {
    if (y + yukseklik > 280) { pdf.addPage(); y = 16; metin(`${rapor.baslik} · ${rapor.evrakNo} (devam)`, sol, 9, true); y += 8 }
  }
  metin(rapor.baslik, 105, 14, true, 'center'); y += 12
  metin(`Düzenlenme Tarihi : ${rapor.tarih}`, sol, 8, true)
  metin(`Saat : ${rapor.saat}`, sag, 8, true, 'right'); y += 7
  metin(`EVRAK NO : ${rapor.evrakNo}`, sol, 9, true); y += 6
  if (rapor.aciklama) {
    pdf.setFontSize(9)
    const satirlar = pdf.splitTextToSize(rapor.aciklama, genislik)
    satirlar.forEach(satir => { yerAc(5); metin(satir, sol); y += 4.5 })
  }
  for (const bolum of rapor.bolumler) {
    yerAc(22); cizgi(); y += 5; metin(bolum.baslik, sol, 10, true); y += 3; cizgi(); y += 5
    for (const grup of bolum.gruplar) {
      yerAc(grup.satirlar.length * 4 + 5)
      pdf.setFontSize(8)
      const etiketSatirlari = pdf.splitTextToSize(grup.etiket, 33)
      etiketSatirlari.forEach((etiket, indeks) => { metin(etiket, sol, 8); if (indeks < etiketSatirlari.length - 1) y += 4 })
      for (const satir of grup.satirlar) {
        metin(`${satir.etiket} :`, sol + 38, 8)
        metin(satir.deger, sag, 8, false, 'right'); y += 4
      }
      y += 2
    }
  }
  yerAc(30); cizgi(); y += 8; metin(rapor.toplamEtiket, sol, 11, true); metin(rapor.toplam, sag, 11, true, 'right'); y += 9
  const notlar = [rapor.uyari, 'MUBİS · Kayıt dökümü; resmî yazar kasa belgesi değildir.', 'Kaynakta bulunmayan bilgiler — ile gösterilir. Tutarlar TL.'].filter(Boolean)
  pdf.setFontSize(7)
  for (const not of notlar) {
    const satirlar = pdf.splitTextToSize(not, genislik)
    yerAc(satirlar.length * 4)
    satirlar.forEach(satir => { metin(satir, sol, 7); y += 4 })
  }
  if (indir) pdf.save(`${rapor.baslik.replace(/\s/g, '_')}_${String(rapor.evrakNo).replace(/[^\p{L}\p{N}_-]/gu, '_')}.pdf`)
  else return pdf.blob()
}
