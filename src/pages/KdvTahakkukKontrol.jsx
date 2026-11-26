import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import { AYLAR, fisTara, kdvTahakkukAylari, kdvTahakkukAyDurumu } from '../services/fisTaramaService'
import { acilisOncesiAy, kapanisSonrasiAy } from '../utils/beyanKapanis'

const faaliyetDisiAy = (musteri, yil, ay) => acilisOncesiAy(musteri, yil, ay) || kapanisSonrasiAy(musteri, yil, ay)

const sayfaYolu = '/admin/kdv-tahakkuk-kontrol'
const musteriAdi = (musteri) => musteri.name || musteri.company || musteri.shortName || `Müşteri #${musteri.id}`

export default function KdvTahakkukKontrol() {
  const { user, office } = useAuth()
  if (!user) return <Navigate to="/giris" replace />
  const yetkili = ['admin', 'super_admin'].includes(user.role) ||
    (user.role === 'personel' && !!office?.personel_yetkileri?.[sayfaYolu])
  return yetkili ? <TahakkukTablosu key={`${user.id}:${office?.id ?? ''}`} /> : <Navigate to="/admin" replace />
}

function TahakkukTablosu() {
  const { clients, loading, error } = useClients()
  const simdikiYil = new Date().getFullYear()
  const [yil, setYil] = useState(simdikiYil)
  const [arama, setArama] = useState('')
  const [secim, setSecim] = useState(new Set())
  const [taramada, setTaramada] = useState(false)
  const [sonuclar, setSonuclar] = useState({})
  const musteriListesi = (clients || []).filter(musteri => musteri.id != null).sort((sol, sag) => musteriAdi(sol).localeCompare(musteriAdi(sag), 'tr'))
  const gorunenler = musteriListesi.filter(musteri => musteriAdi(musteri).toLocaleLowerCase('tr').includes(arama.trim().toLocaleLowerCase('tr')))
  const secilenler = musteriListesi.filter(musteri => secim.has(musteri.id))
  const gorunenlerSecili = gorunenler.length > 0 && gorunenler.every(musteri => secim.has(musteri.id))

  const secimiDegistir = (liste, secili) => setSecim(onceki => {
    const yeni = new Set(onceki)
    for (const musteri of liste) {
      if (secili) yeni.add(musteri.id)
      else yeni.delete(musteri.id)
    }
    return yeni
  })

  const tara = async () => {
    if (taramada || !secilenler.length) return
    setTaramada(true)
    const guncelle = (id, sonuc) => setSonuclar(onceki => ({ ...onceki, [id]: sonuc }))
    setSonuclar(onceki => ({ ...onceki, ...Object.fromEntries(secilenler.map(musteri => [musteri.id, { durum: 'Sırada' }])) }))
    try {
      for (const musteri of secilenler) {
        if (AYLAR.every((_, indeks) => faaliyetDisiAy(musteri, yil, indeks + 1))) {
          guncelle(musteri.id, { durum: 'Faaliyet dönemi dışında' })
          continue
        }
        guncelle(musteri.id, { durum: 'Taranıyor' })
        try {
          const yanit = await fisTara({ client: musteri, yil, turler: ['kdv-tahakkuk'] })
          const sonuc = kdvTahakkukAylari(yanit.turler?.['kdv-tahakkuk'], yil)
          guncelle(musteri.id, { ...sonuc, durum: sonuc.kapsamTam ? 'Liste okundu' : 'Kapsam doğrulanamadı' })
        } catch (hata) {
          guncelle(musteri.id, { durum: 'Tarama başarısız', hata: hata?.message || 'Luca fiş listesi okunamadı.' })
        }
      }
    } finally {
      setTaramada(false)
    }
  }

  return (
    <section className="mx-auto max-w-[100rem] p-4 text-white sm:p-6">
      <h1 className="text-2xl font-bold">KDV Tahakkuk Kontrolü</h1>
      <p className="mt-2 text-sm text-blue-100/80">Luca Fiş Listesi salt okunur taranır. Aylar fiş tarihine göredir, beyan dönemine göre değildir. Fiş numaraları açıklamaya göre bulunan adaylardır; boş sonuç fişin kesin olarak eksik olduğunu göstermez.</p>
      <div className="my-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">Defter yılı
          <select value={yil} disabled={taramada} onChange={olay => { setYil(Number(olay.target.value)); setSonuclar({}) }} className="mt-1 block rounded bg-slate-800 p-2">
            {Array.from({ length: 6 }, (_, sira) => simdikiYil - sira).map(tekYil => <option key={tekYil}>{tekYil}</option>)}
          </select>
        </label>
        <label className="text-sm">Müşteri ara
          <input value={arama} onChange={olay => setArama(olay.target.value)} className="mt-1 block rounded bg-slate-800 p-2" />
        </label>
        <button type="button" disabled={taramada || !gorunenler.length} onClick={() => secimiDegistir(gorunenler, !gorunenlerSecili)} className="rounded bg-slate-700 px-3 py-2 text-sm disabled:opacity-50">{gorunenlerSecili ? 'Görünen seçimi kaldır' : 'Görünenleri seç'}</button>
        <button type="button" disabled={taramada || !secilenler.length} onClick={tara} className="rounded bg-blue-700 px-3 py-2 text-sm font-semibold disabled:opacity-50">{taramada ? 'Taranıyor…' : `Seçilenleri tara (${secilenler.length})`}</button>
      </div>
      {loading && <p role="status">Müşteriler yükleniyor…</p>}
      {error && <p role="alert" className="text-rose-300">Müşteri listesi yüklenemedi.</p>}
      {!loading && !error && !gorunenler.length && <p role="status">Gösterilecek müşteri bulunamadı.</p>}
      {!!gorunenler.length && (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-max text-left text-sm">
            <thead className="bg-slate-800">
              <tr>
                <th scope="col" className="p-3">Müşteri</th>
                <th scope="col" className="p-3">Tarama durumu</th>
                {AYLAR.map(ay => <th scope="col" key={ay} className="p-3">{ay}</th>)}
              </tr>
            </thead>
            <tbody>
              {gorunenler.map(musteri => {
                const sonuc = sonuclar[musteri.id]
                return (
                  <tr key={musteri.id} className="border-t border-white/10 align-top">
                    <th scope="row" className="p-3 font-medium">
                      <label className="flex items-center gap-2"><input type="checkbox" checked={secim.has(musteri.id)} disabled={taramada} onChange={olay => secimiDegistir([musteri], olay.target.checked)} />{musteriAdi(musteri)}</label>
                    </th>
                    <td className="max-w-56 p-3" aria-live="polite">{sonuc?.durum || 'Taranmadı'}{sonuc?.hata && <p className="mt-1 text-xs text-rose-300">{sonuc.hata}</p>}</td>
                    {AYLAR.map((ay, indeks) => (
                      <td key={ay} className="p-3">
                        {sonuc?.aylar?.[indeks]?.length ? sonuc.aylar[indeks].map((fis, sira) => (
                          <span key={`${fis.date}:${fis.voucherNo}:${sira}`} className="block text-sky-200" title={`${fis.date} · ${fis.description || 'Açıklama yok'}`}>{fis.voucherNo}</span>
                        )) : <span className="text-slate-400">{kdvTahakkukAyDurumu(sonuc, yil, indeks + 1, faaliyetDisiAy(musteri, yil, indeks + 1))}</span>}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
