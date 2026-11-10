import { Download, X, Printer } from 'lucide-react'
import { formatDateTR } from '../utils/dateUtils'

// UTTS (ve diger verisiz) kayitlar icin termal-fis gorunumlu modal.
// Kayit alanlarindan fis uretir: tarih, fatura no, VKN/TCKN, matrah, KDV, toplam.
const tl = (v) => v != null ? Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'

export default function FisModal({ f, onClose }) {
  if (!f) return null
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
