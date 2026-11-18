import { useState } from 'react'
import { Download, Eye, Trash2 } from 'lucide-react'
import { fisFaturaSatirlari } from '../utils/fisDetay'
import { fisRaporPdf } from '../utils/fisRapor'
import { formatDateTR } from '../utils/dateUtils'

const para = deger => deger == null ? '—' : Number(deger).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function FisDokumTablosu({ faturalar, detaylar = {}, onAc, seciliIds, onSec, onTumunuSec, onSil, siliniyor = false }) {
  const [hata, setHata] = useState('')
  const [indirilen, setIndirilen] = useState(null)
  if (!faturalar.length) return null
  const secilebilir = Boolean(seciliIds && onSec)
  const belge = fatura => ({ ...fatura, kdvDetaylari: fatura.kdvDetaylari?.length ? fatura.kdvDetaylari : detaylar[fatura.id] || [] })
  const pdfIndir = async fatura => {
    setHata(''); setIndirilen(fatura.id)
    try { await fisRaporPdf(belge(fatura)) } catch { setHata('PDF oluşturulamadı. Belgeyi görüntüleyip Yazdır seçeneğini kullanın.') }
    finally { setIndirilen(null) }
  }
  return (
    <div className="mb-5 rounded-lg border border-blue-700/40 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] text-sm">
          <caption className="text-left px-3 py-2 text-xs text-blue-200 bg-blue-900/30">Z raporu / gider fişi · Her KDV oranı ayrı satırdır.</caption>
          <thead className="bg-blue-900/40 text-xs text-blue-100">
            <tr>
              {secilebilir && <th className="p-3 w-10"><input type="checkbox" aria-label="Tüm fişleri seç" checked={faturalar.every(fatura => seciliIds.has(fatura.id))} onChange={event => onTumunuSec?.(event.target.checked)} className="accent-yellow-500" /></th>}
              {['TARİH', 'EVRAK NO', 'AÇIKLAMA', 'MATRAH / KDV ORANI', 'KDV', 'KREDİ K.', 'NAKİT', 'İŞLEM'].map((baslik, indeks) => <th key={baslik} className={`px-3 py-3 whitespace-nowrap ${indeks >= 3 && indeks <= 6 ? 'text-right' : 'text-left'}`}>{baslik}</th>)}
            </tr>
          </thead>
          <tbody>
            {faturalar.flatMap(fatura => fisFaturaSatirlari(belge(fatura)).map((satir, indeks) => (
              <tr key={satir.satirKey || fatura.id} className={`border-t border-blue-800/30 text-gray-200 ${indeks > 0 ? 'bg-blue-900/10' : ''}`}>
                {secilebilir && <td className="px-3 py-3"><input type="checkbox" aria-label={`${satir.fisNo || 'Fiş'} seç`} checked={seciliIds.has(fatura.id)} onChange={event => onSec(event, fatura.id)} className="accent-yellow-500" /></td>}
                <td className="px-3 py-3 whitespace-nowrap">{satir.tarih ? formatDateTR(satir.tarih) : '—'}</td>
                <td className="px-3 py-3 whitespace-nowrap font-medium">{satir.fisNo || '—'}</td>
                <td className="px-3 py-3 min-w-[160px] max-w-[260px] break-words">{satir.satici || '—'}</td>
                <td className="px-3 py-3 whitespace-nowrap text-right tabular-nums" title={fatura.fisDetayUyari || ''}>
                  <div className="flex justify-end items-center gap-3"><span className="text-[11px] text-cyan-300 w-10 text-left">{satir.kdvOran != null ? `%${satir.kdvOran}` : '—'}</span><span>{para(satir.matrah)}</span></div>
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-right tabular-nums">{para(satir.kdv)}</td>
                <td className="px-3 py-3 whitespace-nowrap text-right tabular-nums text-cyan-200">{satir.odemeDevamSatiri ? '—' : para(satir.kredi)}</td>
                <td className="px-3 py-3 whitespace-nowrap text-right tabular-nums text-cyan-200">{satir.odemeDevamSatiri ? '—' : para(satir.nakit)}</td>
                <td className="px-3 py-3"><div className="flex gap-1.5">
                  <button onClick={() => onAc(belge(fatura))} title="Kayıt dökümünü görüntüle" className="p-1.5 rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"><Eye className="w-4 h-4" /></button>
                  <button disabled={indirilen !== null} onClick={() => pdfIndir(fatura)} title="Kayıt dökümü PDF indir" className="p-1.5 rounded bg-green-500/20 text-green-300 hover:bg-green-500/30 disabled:opacity-40"><Download className="w-4 h-4" /></button>
                  {onSil && <button disabled={siliniyor} onClick={event => onSil(event, fatura)} title="Kaydı sil" className="p-1.5 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 disabled:opacity-40"><Trash2 className="w-4 h-4" /></button>}
                </div></td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      <p className="px-3 py-2 text-[11px] text-gray-400 border-t border-blue-800/30">Kredi kartı ve nakit belge toplamıdır; yalnızca ilk KDV satırında gösterilir. Kaynakta bulunmayan bilgiler — ile belirtilir.</p>
      {hata && <p role="alert" className="px-3 pb-3 text-sm text-red-300">{hata}</p>}
      {faturalar.some(fatura => fatura.fisDetayUyari) && <p className="px-3 pb-3 text-xs text-amber-300">Bazı belgelerin KDV veya ödeme kırılımı doğrulanamadı. Ayrıntı için kayıt dökümünü açın.</p>}
    </div>
  )
}
