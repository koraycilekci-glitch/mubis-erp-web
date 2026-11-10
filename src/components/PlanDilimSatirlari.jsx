import { Minus } from 'lucide-react'
import { HAFTA_GUNLERI, dilimModu, bugunHaftaGunu } from '../utils/planDilim'

// 2.8.320: Otomatik plan dilim satırları. Her satırda Günlük/Haftalık geçişi,
// gün seçimi ve saat bulunur. Günlük = ayın günü (1-31), Haftalık = haftanın
// seçilen günleri. Aynı bileşen borç, POS/KDV ve borç dökümü ekranlarında
// kullanılır; böylece üç yerde davranış aynı kalır.
export default function PlanDilimSatirlari({ dilimler, onDegistir, onSil, varsayilanSaat = '06:00' }) {
  return (dilimler || []).map((z, idx) => {
    const mod = dilimModu(z)
    const seciliGunler = Array.isArray(z.hafta_gunleri) ? z.hafta_gunleri.map(Number) : []
    const haftaSec = (v) => {
      const yeni = seciliGunler.includes(v)
        ? seciliGunler.filter(x => x !== v)
        : [...seciliGunler, v]
      onDegistir(idx, { hafta_gunleri: yeni.sort((a, b) => a - b) })
    }
    return (
      <div key={idx} className="rounded-lg border border-blue-800/40 bg-blue-900/20 p-2 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <div className="inline-flex rounded-lg overflow-hidden border border-blue-700/50">
            <button
              type="button"
              onClick={() => onDegistir(idx, {
                mod: 'gunluk',
                gunler_ay: (z.gunler_ay || []).length ? z.gunler_ay : [new Date().getDate()]
              })}
              className={`px-2 py-1 text-[10px] font-medium transition-colors ${mod === 'gunluk' ? 'bg-cyan-600/30 text-cyan-200' : 'bg-blue-950/60 text-gray-400 hover:text-white'}`}
            >
              Günlük
            </button>
            <button
              type="button"
              onClick={() => onDegistir(idx, {
                mod: 'haftalik',
                hafta_gunleri: (z.hafta_gunleri || []).length ? z.hafta_gunleri : [bugunHaftaGunu()]
              })}
              className={`px-2 py-1 text-[10px] font-medium transition-colors ${mod === 'haftalik' ? 'bg-amber-500/30 text-amber-200' : 'bg-blue-950/60 text-gray-400 hover:text-white'}`}
            >
              Haftalık
            </button>
          </div>
          <span className="text-[10px] text-gray-500">{mod === 'haftalik' ? 'haftanın günleri' : 'ayın günü'}</span>
          <div className="flex-1" />
          <input
            type="time"
            value={z.saat || varsayilanSaat}
            onChange={e => onDegistir(idx, { saat: e.target.value })}
            className="bg-blue-900/60 border border-blue-700/50 rounded-lg px-2 py-1.5 text-white text-xs"
          />
          <button
            type="button"
            onClick={() => onSil(idx)}
            title="Bu dilimi sil"
            className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
        </div>
        {mod === 'gunluk' ? (
          <div className="relative w-fit">
            <input
              type="number"
              min={1}
              max={31}
              value={z.gunler_ay?.[0] || ''}
              onChange={e => {
                const n = Math.min(31, Math.max(0, Number(e.target.value) || 0))
                onDegistir(idx, { gunler_ay: n >= 1 ? [n] : [] })
              }}
              placeholder="Gün"
              title="Ayın kaçıncı günü (1-31)"
              className="w-20 bg-blue-900/60 border border-blue-700/50 rounded-lg pl-2 pr-7 py-1.5 text-white text-xs tabular-nums"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-gray-500 pointer-events-none">gün</span>
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {HAFTA_GUNLERI.map(g => (
              <button
                key={g.v}
                type="button"
                title={g.e}
                onClick={() => haftaSec(g.v)}
                className={`py-1 rounded-md text-[10px] font-medium border transition-colors ${seciliGunler.includes(g.v)
                  ? 'bg-amber-500/25 border-amber-500/50 text-amber-200'
                  : 'bg-blue-950/50 border-blue-800/50 text-gray-400 hover:text-white'}`}
              >
                {g.k}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  })
}
