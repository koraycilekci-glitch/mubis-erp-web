import { Loader2, CopyX, X } from 'lucide-react'

// Elle ekleme tablosu: Fişler (admin) ve müşteri portalı ortak bileşeni.
// Tutarlar KDV dahil girilir; matrah ve KDV oran bazında otomatik hesaplanır.
export const ELLE_KOLONLAR = {
  z: ['tarih', 'evrakNo', 'aciklama', 's0', 's1', 's10', 's20', 'nakit'],
  fis: ['tarih', 'faturaNo', 'unvan', 'kdvOran', 'toplam'],
}
export const sayiAl = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0 }
// Her türlü tarih girişini gg.aa.yyyy'ye çevirir: 01102026, 011026, 01,10,2026, 01/10/2026, 01.10.2026, 01-10-2026
export const tarihDuzelt = (t) => {
  const rakam = String(t || '').replace(/\D/g, '')
  if (!rakam) return ''
  if (rakam.length >= 8) return `${rakam.slice(0, 2)}.${rakam.slice(2, 4)}.${rakam.slice(4, 8)}`
  if (rakam.length === 6) return `${rakam.slice(0, 2)}.${rakam.slice(2, 4)}.20${rakam.slice(4, 6)}`
  return t
}
// Satır tarihinden dönem okur: { y, a } ya da null
const tarihDonem = (t) => {
  const rakam = String(t || '').replace(/\D/g, '')
  if (rakam.length >= 8) return { y: Number(rakam.slice(4, 8)), a: Number(rakam.slice(2, 4)) }
  if (rakam.length === 6) return { y: Number('20' + rakam.slice(4, 6)), a: Number(rakam.slice(2, 4)) }
  return null
}
// Satır tarihi seçilen dönemden farklıysa true (yil/ay verilmezse uyarı yok)
export const donemUyumsuz = (t, yil2, ay2) => {
  if (yil2 == null || ay2 == null) return false
  const d = tarihDonem(t)
  return !!d && (d.y !== yil2 || d.a !== ay2)
}
export const elleBosSatir = (tip) => tip === 'z' ? {
  tarih: '', evrakNo: '', aciklama: 'Z RAPORU', s0: '', s1: '', s10: '', s20: '', nakit: '',
} : {
  tarih: '', faturaNo: '', unvan: '', kdvOran: '', toplam: '',
}
// Tutarlar KDV dahil girilir; matrah ve KDV oran bazında otomatik hesaplanır
export const elleSatirHesap = (s) => {
  if ('s0' in s) {
    const s0 = sayiAl(s.s0), s1 = sayiAl(s.s1), s10 = sayiAl(s.s10), s20 = sayiAl(s.s20)
    const toplam = s0 + s1 + s10 + s20
    const nakit = sayiAl(s.nakit)
    const m1 = s1 / 1.01, m10 = s10 / 1.10, m20 = s20 / 1.20
    return {
      toplam, nakit, kredi: toplam - nakit,
      matrah1: m1, matrah10: m10, matrah20: m20,
      kdv1: s1 - m1, kdv10: s10 - m10, kdv20: s20 - m20,
    }
  }
  // Gider fişi: KDV dahil toplam + tek oran
  const toplam = sayiAl(s.toplam)
  const matrah = toplam / (1 + sayiAl(s.kdvOran) / 100)
  return { toplam, matrah, kdv: toplam - matrah }
}
const fmt2 = (v) => (v ? v.toFixed(2) : '')

export default function FisElleEkleTablosu({
  tip, satirlar, setSatirlar, yil = null, ay = null,
  baslik, bilgi = null, ipucu = '',
  onKapat = null, kaydet, kaydediyor = false, kaydetEtiketi = 'Kaydet',
  kaydetRenk = 'bg-emerald-600 hover:bg-emerald-500',
  idOnek = 'elle',
}) {
  const elleKopyaAlanlari = { z: ['tarih', 'evrakNo', 'aciklama'], fis: ['tarih', 'faturaNo', 'unvan'] }
  const ustSatiriKopyala = (ri) => {
    if (ri <= 0) return
    setSatirlar(arr => arr.map((x, i) => {
      if (i !== ri) return x
      const yeni = { ...x }
      for (const a of elleKopyaAlanlari[tip]) yeni[a] = arr[ri - 1][a]
      return yeni
    }))
  }
  const elleEnter = (e, ri, ci) => {
    // Ctrl+D: üst satırın metin alanlarını bu satıra kopyala
    if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault()
      ustSatiriKopyala(ri)
      return
    }
    if (e.key !== 'Enter') return
    e.preventDefault()
    const kolonlar = ELLE_KOLONLAR[tip]
    if (ci < kolonlar.length - 1) {
      const hedef = document.getElementById(`${idOnek}-${ri}-${kolonlar[ci + 1]}`)
      if (hedef) { hedef.focus(); if (hedef.select) hedef.select() }
    } else {
      // Son kolonda (NAKİT / TOPLAM) Enter → alt satır açılır, tarih kolonuna döner
      setSatirlar(arr => [...arr, elleBosSatir(tip)])
      setTimeout(() => {
        const hedef = document.getElementById(`${idOnek}-${ri + 1}-tarih`)
        if (hedef) hedef.focus()
      }, 50)
    }
  }
  const donemUyar = (t) => donemUyumsuz(t, yil, ay)

  return (
    <div className="bg-blue-950/40 border border-blue-700/50 rounded-2xl overflow-hidden max-h-[75vh] flex flex-col">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-blue-800/40 shrink-0">
        <span className="text-white font-bold text-sm">{baslik || (tip === 'z' ? 'Z Raporu' : 'Gider Fişi') + ' — Elle Ekle'}</span>
        {bilgi}
        {ipucu && <span className="text-gray-500 text-xs hidden lg:inline">{ipucu}</span>}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setSatirlar(arr => [...arr, elleBosSatir(tip)])}
            className="border border-white/20 hover:bg-white/10 text-gray-200 rounded-lg px-3 py-1.5 text-xs font-medium transition">
            + Satır
          </button>
          {onKapat && (
            <button onClick={onKapat}
              className="border border-white/20 hover:bg-white/10 text-gray-200 rounded-lg px-3 py-1.5 text-xs font-medium transition">
              Kapat
            </button>
          )}
          <button onClick={kaydet} disabled={kaydediyor}
            className={`flex items-center gap-1.5 ${kaydetRenk} disabled:opacity-50 text-white rounded-lg px-4 py-1.5 text-xs font-bold transition`}>
            {kaydediyor && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {kaydediyor ? 'Kaydediliyor…' : kaydetEtiketi}
          </button>
        </div>
      </div>
      <div className="overflow-auto flex-1">
        <table className="w-full text-xs whitespace-nowrap">
          {tip === 'z' ? (<>
          <thead>
            <tr className="bg-amber-700 text-white sticky top-0 z-10">
              {['TARİH', 'EVRAK NO', 'AÇIKLAMA', 'SATIŞ 0', 'SATIŞ 1', 'SATIŞ 10', 'SATIŞ 20', 'NAKİT', 'KREDİ K', 'MATRAH 1', 'MATRAH 10', 'MATRAH 20', 'KDV 1', 'KDV 10', 'KDV 20'].map((h, i) => (
                <th key={h} className={`px-2 py-2 font-semibold ${i >= 3 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {satirlar.map((s, ri) => {
              const h = elleSatirHesap(s)
              const hucre = (ci, alan, sayisal = false) => (
                <input id={`${idOnek}-${ri}-${alan}`} value={s[alan]}
                  inputMode={sayisal ? 'decimal' : undefined}
                  onKeyDown={e => elleEnter(e, ri, ci)}
                  onBlur={alan === 'tarih' ? () => setSatirlar(arr => arr.map((x, i) => i === ri ? { ...x, tarih: tarihDuzelt(x.tarih) } : x)) : undefined}
                  onChange={e => setSatirlar(arr => arr.map((x, i) => i === ri ? { ...x, [alan]: e.target.value } : x))}
                  placeholder={alan === 'tarih' ? 'gg.aa.yyyy' : undefined}
                  className={`w-full bg-blue-900/40 border border-blue-800/60 rounded px-1.5 py-1 text-white text-xs outline-none focus:border-yellow-400 ${sayisal ? 'text-right tabular-nums' : ''} ${alan === 'tarih' && donemUyar(s.tarih) ? 'border-amber-400 text-amber-300' : ''}`} />
              )
              return (
                <tr key={ri} className="border-t border-blue-900/40">
                  <td className="px-1 py-1 w-28">{hucre(0, 'tarih')}</td>
                  <td className="px-1 py-1 w-24">{hucre(1, 'evrakNo')}</td>
                  <td className="px-1 py-1 w-44">{hucre(2, 'aciklama')}</td>
                  <td className="px-1 py-1 w-24">{hucre(3, 's0', true)}</td>
                  <td className="px-1 py-1 w-24">{hucre(4, 's1', true)}</td>
                  <td className="px-1 py-1 w-24 bg-blue-900/20">{hucre(5, 's10', true)}</td>
                  <td className="px-1 py-1 w-24">{hucre(6, 's20', true)}</td>
                  <td className="px-1 py-1 w-24">{hucre(7, 'nakit', true)}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-cyan-300">{fmt2(h.kredi)}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-emerald-300">{fmt2(h.matrah1)}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-emerald-300">{fmt2(h.matrah10)}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-emerald-300">{fmt2(h.matrah20)}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-amber-300">{fmt2(h.kdv1)}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-amber-300">{fmt2(h.kdv10)}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-amber-300">{fmt2(h.kdv20)}</td>
                  <td className="px-2 py-1">
                    <button onClick={() => ustSatiriKopyala(ri)}
                      disabled={ri === 0}
                      className="p-1 rounded text-cyan-300 hover:bg-cyan-900/40 disabled:opacity-30" title="Üst satırın tarih/evrak no/açıklamasını kopyala (Ctrl+D)">
                      <CopyX className="w-3.5 h-3.5" />
                    </button>
                    {satirlar.length > 1 && (
                      <button onClick={() => setSatirlar(arr => arr.filter((_, i) => i !== ri))}
                        className="p-1 rounded text-red-400 hover:bg-red-900/40" title="Satırı sil">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            <tr className="border-t-2 border-blue-700/60 bg-blue-900/40 font-semibold text-gray-200">
              <td className="px-2 py-1.5" colSpan={3}>TOPLAM</td>
              {[0, 1, 10, 20].map(o => (
                <td key={o} className="px-2 py-1.5 text-right tabular-nums">
                  {fmt2(satirlar.reduce((a, s) => a + sayiAl(s['s' + o]), 0))}
                </td>
              ))}
              <td className="px-2 py-1.5 text-right tabular-nums">
                {fmt2(satirlar.reduce((a, s) => a + elleSatirHesap(s).nakit, 0))}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {fmt2(satirlar.reduce((a, s) => a + elleSatirHesap(s).kredi, 0))}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {fmt2(satirlar.reduce((a, s) => a + elleSatirHesap(s).matrah1, 0))}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {fmt2(satirlar.reduce((a, s) => a + elleSatirHesap(s).matrah10, 0))}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {fmt2(satirlar.reduce((a, s) => a + elleSatirHesap(s).matrah20, 0))}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {fmt2(satirlar.reduce((a, s) => a + elleSatirHesap(s).kdv1, 0))}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {fmt2(satirlar.reduce((a, s) => a + elleSatirHesap(s).kdv10, 0))}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {fmt2(satirlar.reduce((a, s) => a + elleSatirHesap(s).kdv20, 0))}
              </td>
              <td></td>
            </tr>
          </tbody>
          </>) : (<>
          <thead>
            <tr className="bg-amber-700 text-white sticky top-0 z-10">
              {['FİŞ TARİHİ', 'FİŞ NO', 'ÜNVANI', 'KDV ORANI', 'TOPLAM', 'KDV MATRAHI', 'KDV TUTARI'].map((h, i) => (
                <th key={h} className={`px-2 py-2 font-semibold ${i >= 3 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {satirlar.map((s, ri) => {
              const h = elleSatirHesap(s)
              const hucre = (ci, alan, sayisal = false) => (
                <input id={`${idOnek}-${ri}-${alan}`} value={s[alan]}
                  inputMode={sayisal ? 'decimal' : undefined}
                  onKeyDown={e => elleEnter(e, ri, ci)}
                  onBlur={alan === 'tarih' ? () => setSatirlar(arr => arr.map((x, i) => i === ri ? { ...x, tarih: tarihDuzelt(x.tarih) } : x)) : undefined}
                  onChange={e => setSatirlar(arr => arr.map((x, i) => i === ri ? { ...x, [alan]: e.target.value } : x))}
                  placeholder={alan === 'tarih' ? 'gg.aa.yyyy' : undefined}
                  className={`w-full bg-blue-900/40 border border-blue-800/60 rounded px-1.5 py-1 text-white text-xs outline-none focus:border-yellow-400 ${sayisal ? 'text-right tabular-nums' : ''} ${alan === 'tarih' && donemUyar(s.tarih) ? 'border-amber-400 text-amber-300' : ''}`} />
              )
              return (
                <tr key={ri} className="border-t border-blue-900/40">
                  <td className="px-1 py-1 w-28">{hucre(0, 'tarih')}</td>
                  <td className="px-1 py-1 w-28">{hucre(1, 'faturaNo')}</td>
                  <td className="px-1 py-1 w-60">{hucre(2, 'unvan')}</td>
                  <td className="px-1 py-1 w-24">{hucre(3, 'kdvOran', true)}</td>
                  <td className="px-1 py-1 w-28">{hucre(4, 'toplam', true)}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-emerald-300">{fmt2(h.matrah)}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-amber-300">{fmt2(h.kdv)}</td>
                  <td className="px-2 py-1">
                    <button onClick={() => ustSatiriKopyala(ri)}
                      disabled={ri === 0}
                      className="p-1 rounded text-cyan-300 hover:bg-cyan-900/40 disabled:opacity-30" title="Üst satırın tarih/fiş no/ünvanını kopyala (Ctrl+D)">
                      <CopyX className="w-3.5 h-3.5" />
                    </button>
                    {satirlar.length > 1 && (
                      <button onClick={() => setSatirlar(arr => arr.filter((_, i) => i !== ri))}
                        className="p-1 rounded text-red-400 hover:bg-red-900/40" title="Satırı sil">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            <tr className="border-t-2 border-blue-700/60 bg-blue-900/40 font-semibold text-gray-200">
              <td className="px-2 py-1.5" colSpan={4}>TOPLAM</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {fmt2(satirlar.reduce((a, s) => a + elleSatirHesap(s).toplam, 0))}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {fmt2(satirlar.reduce((a, s) => a + elleSatirHesap(s).matrah, 0))}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {fmt2(satirlar.reduce((a, s) => a + elleSatirHesap(s).kdv, 0))}
              </td>
              <td></td>
            </tr>
          </tbody>
          </>)}
        </table>
      </div>
    </div>
  )
}
