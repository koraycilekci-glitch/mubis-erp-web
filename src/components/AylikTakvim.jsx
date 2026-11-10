// Aylık takvim — her ay tekrar eden GÜN NUMARALARINI (1-31) seçtirir.
// Otomatik borç sorgulama, borç bildirimi ve POS/KDV döküm planlarında ortak
// kullanılır. Tek tıklama tek günü seçer; "Çoklu seçim" açıkken veya Ctrl ile
// birden fazla gün seçilebilir.
import { useState } from 'react'

const AY_ADLARI_UZUN = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

export default function AylikTakvim({
  yil,
  ay,
  secili = [],
  onDegistir,
  onAyDegistir,
  baslik,
  kompakt = false
}) {
  const [coklu, setCoklu] = useState(false)
  const ilkGun = new Date(yil, ay, 1)
  const gunSayisi = new Date(yil, ay + 1, 0).getDate()
  const bosluk = (ilkGun.getDay() + 6) % 7 // Pazartesi başlangıçlı
  const hucreler = [
    ...Array.from({ length: bosluk }, () => null),
    ...Array.from({ length: gunSayisi }, (_, i) => i + 1)
  ]

  const tikla = (gun, olay) => {
    if (coklu || olay.ctrlKey || olay.metaKey) {
      onDegistir(prev => prev.includes(gun) ? prev.filter(g => g !== gun) : [...prev, gun].sort((a, b) => a - b))
    } else {
      onDegistir(() => (secili.length === 1 && secili[0] === gun ? [] : [gun]))
    }
  }

  const ayGeri = () => onAyDegistir(ay === 0 ? { yil: yil - 1, ay: 11 } : { yil, ay: ay - 1 })
  const ayIleri = () => onAyDegistir(ay === 11 ? { yil: yil + 1, ay: 0 } : { yil, ay: ay + 1 })

  return (
    <div className={`bg-blue-950/50 border border-blue-700/40 rounded-xl ${kompakt ? 'p-2' : 'p-3'}`}>
      {baslik && <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">{baslik}</p>}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={ayGeri} className="px-2 py-1 rounded-lg bg-blue-900/60 text-blue-300 hover:text-white text-xs">‹</button>
          <span className="text-sm font-medium text-white min-w-[110px] text-center">{AY_ADLARI_UZUN[ay]} {yil}</span>
          <button type="button" onClick={ayIleri} className="px-2 py-1 rounded-lg bg-blue-900/60 text-blue-300 hover:text-white text-xs">›</button>
        </div>
        <button
          type="button"
          onClick={() => setCoklu(v => !v)}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border ${
            coklu
              ? 'bg-emerald-500/25 border-emerald-500/60 text-emerald-300'
              : 'bg-blue-900/50 border-blue-700/40 text-gray-400'
          }`}
          title="Birden fazla gün seçmek için açın"
        >
          {coklu ? 'Çoklu seçim açık' : 'Çoklu seçim'}
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(g => (
          <div key={g} className="text-[10px] text-gray-500 font-medium">{g}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {hucreler.map((gun, i) => {
          if (!gun) return <div key={`b${i}`} />
          const aktif = secili.includes(gun)
          return (
            <button
              key={gun}
              type="button"
              onClick={(e) => tikla(gun, e)}
              className={`${kompakt ? 'h-7' : 'h-8'} rounded-lg text-xs font-medium transition-colors ${
                aktif
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                  : 'bg-blue-900/40 text-gray-300 hover:bg-blue-800/60 hover:text-white'
              }`}
            >
              {gun}
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between mt-2 text-[11px] text-gray-400">
        <span>{secili.length ? `Seçili: ${secili.join(', ')}` : 'Gün seçilmedi'}</span>
        {secili.length > 0 && (
          <button type="button" onClick={() => onDegistir(() => [])} className="text-red-400 hover:text-red-300">Temizle</button>
        )}
      </div>
    </div>
  )
}
