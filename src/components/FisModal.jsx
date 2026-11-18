import { useMemo, useRef, useState } from 'react'
import { Download, X, Printer } from 'lucide-react'
import { formatDateTR } from '../utils/dateUtils'
import { fisKaydiMi } from '../utils/fisDetay'
import { fisRaporHtml, fisRaporPdf } from '../utils/fisRapor'

// UTTS (ve diger verisiz) kayitlar icin termal-fis gorunumlu modal.
// Kayit alanlarindan fis uretir: tarih, fatura no, VKN/TCKN, matrah, KDV, toplam.
const tl = (v) => v != null ? Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'

export default function FisModal({ f, onClose }) {
  const frameRef = useRef(null)
  const [hata, setHata] = useState('')
  const [indiriliyor, setIndiriliyor] = useState(false)
  const fisHtml = useMemo(() => f && fisKaydiMi(f) ? fisRaporHtml(f) : '', [f])
  if (!f) return null
  if (fisHtml) return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={f.fatura_turu || f.tur} className="w-full max-w-md h-[92vh] bg-white rounded-lg shadow-2xl flex flex-col overflow-hidden" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-100 border-b border-slate-300 text-slate-900">
          <strong className="text-sm">{f.fatura_no || f.fisNo || 'Kayıt Dökümü'}</strong>
          <div className="flex gap-2">
            <button disabled={indiriliyor} onClick={async () => { setHata(''); setIndiriliyor(true); try { await fisRaporPdf(f) } catch { setHata('PDF oluşturulamadı. Yazdır düğmesiyle PDF olarak kaydedebilirsiniz.') } finally { setIndiriliyor(false) } }} title="PDF İndir" className="p-2 rounded hover:bg-slate-200 disabled:opacity-40"><Download className="w-4 h-4" /></button>
            <button onClick={() => frameRef.current?.contentWindow?.print()} title="Yazdır" className="p-2 rounded hover:bg-slate-200"><Printer className="w-4 h-4" /></button>
            <button onClick={onClose} title="Kapat" className="p-2 rounded hover:bg-slate-200"><X className="w-4 h-4" /></button>
          </div>
        </div>
        {hata && <p role="alert" className="p-3 text-sm text-red-700">{hata}</p>}
        <iframe ref={frameRef} title={f.fatura_turu || f.tur} srcDoc={fisHtml} sandbox="allow-same-origin allow-modals" className="flex-1 w-full border-0 bg-white" />
      </div>
    </div>
  )
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="max-h-[92vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end w-full max-w-xs mb-2 gap-2">
          {f.xml_url && (
            <a href={f.xml_url} download={`${(f.fatura_uuid || 'utts').replace(/[^\w-]/g, '_')}.xlsx`} title="Excel İndir" className="p-2 bg-green-500/20 rounded-lg text-green-400 hover:bg-green-500/30">
              <Download className="w-4 h-4" />
            </a>
          )}
          <button onClick={() => window.print()} title="Yazdır" className="p-2 bg-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500/30">
            <Printer className="w-4 h-4" />
          </button>
          <button onClick={onClose} title="Kapat" className="p-2 bg-red-500/20 rounded-lg text-red-400 hover:bg-red-500/30">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Fiş gövdesi */}
        <div className="bg-white text-gray-900 rounded-sm shadow-2xl w-full max-w-xs px-5 py-6 font-mono text-sm fis-kagidi overflow-y-auto">
          <div className="text-center">
            <div className="text-base font-bold tracking-widest">{f.tur === 'gumruk' ? 'İTHALAT FATURASI' : 'UTTS FİŞİ'}</div>
            <div className="text-[11px] text-gray-500">{f.tur === 'gumruk' ? 'GÜMRÜK (İTHALAT)' : (f.yon === 'giden' ? 'KESİLEN (SATIŞ)' : 'ALINAN (ALIŞ)')}</div>
          </div>
          <div className="border-t-2 border-dashed border-gray-400 my-3" />
          <div className="space-y-1.5 text-[13px]">
            <div className="flex justify-between gap-2"><span className="text-gray-500">TARİH</span><span className="font-semibold">{f.tarih ? formatDateTR(f.tarih) : '-'}</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-500">FİŞ NO</span><span className="font-semibold">{f.fatura_no || '-'}</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-500">VKN/TCKN</span><span className="font-semibold">{f.karsi_vkn || '-'}</span></div>
            {f.karsi_unvan && <div className="text-[12px] text-gray-600 break-words">{f.karsi_unvan}</div>}
          </div>
          <div className="border-t-2 border-dashed border-gray-400 my-3" />
          <div className="space-y-1.5 text-[13px]">
            <div className="flex justify-between gap-2"><span className="text-gray-500">MATRAH</span><span>{tl(f.matrah)} ₺</span></div>
            <div className="flex justify-between gap-2"><span className="text-gray-500">KDV</span><span>{tl(f.kdv)} ₺</span></div>
          </div>
          <div className="border-t-2 border-dashed border-gray-400 my-3" />
          <div className="flex justify-between items-baseline gap-2">
            <span className="font-bold">TOPLAM</span>
            <span className="text-xl font-bold">{tl(f.tutar)} ₺</span>
          </div>
          <div className="border-t-2 border-dashed border-gray-400 my-3" />
          <div className="text-center text-[10px] text-gray-400">MUBiS · {f.tur === 'gumruk' ? 'İthalat Kayıt Fişi' : 'UTTS Kayıt Fişi'}</div>
        </div>
      </div>
    </div>
  )
}
