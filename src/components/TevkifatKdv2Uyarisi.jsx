// Ana ekran — Tevkifatlı alış faturası / KDV2 beyan uyarısı.
//
// Kural:
//  - Beyan dönemi = içinde bulunulan aydan ÖNCEKİ ay (KDV2 o dönem için verilir).
//  - O dönemde müşterinin TEVKİFATLI ALIŞ faturası (yon gelen + fatura_turu
//    TEVKIFAT) varsa ve KDV2 beyanı henüz "yapıldı" değilse uyarı gösterilir.
//  - Beyan son tarihi her ayın 25'i. Ayın 25'inden SONRA tüm uyarılar kalkar.
//  - Aylık Beyan Takip'te KDV2 "Yapıldı/Onaylandı/Tahakkuk Gönderildi" olarak
//    işaretlenen müşterinin uyarısı listeden düşer (durum DB'den taze okunur).
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { tevkifatMi } from '../services/tevkifatService'
import { kdv2AktifEtGerekirse } from '../services/efaturaService'

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const TAMAM = ['yapildi', 'onaylandi', 'tahakkuk_gonderildi', 'kapandi']

export default function TevkifatKdv2Uyarisi() {
  const [bekleyenler, setBekleyenler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)

  const donem = useMemo(() => {
    const bugun = new Date()
    const onceki = new Date(bugun.getFullYear(), bugun.getMonth() - 1, 1)
    return {
      yil: onceki.getFullYear(),
      ayIndex: onceki.getMonth(),   // 0 tabanlı (beyan anahtarıyla aynı)
      ayNo: onceki.getMonth() + 1,  // 1 tabanlı
      gun: bugun.getDate()
    }
  }, [])

  const uyariGecerli = donem.gun <= 25
  const sonTarih = {
    ayAdi: AYLAR[donem.ayIndex === 11 ? 0 : donem.ayIndex + 1],
    yil: donem.ayIndex === 11 ? donem.yil + 1 : donem.yil
  }

  useEffect(() => {
    if (!uyariGecerli) { setYukleniyor(false); setBekleyenler([]); return }
    let canli = true
    const yukle = async () => {
      setYukleniyor(true)
      try {
        const ayStr = String(donem.ayNo).padStart(2, '0')
        const sonGun = new Date(donem.yil, donem.ayNo, 0).getDate()
        const bas = `${donem.yil}-${ayStr}-01`
        const bit = `${donem.yil}-${ayStr}-${String(sonGun).padStart(2, '0')}`
        // 1) Dönemin tevkifatlı alış faturaları — müşteri bazında
        const faturaHarita = new Map()
        for (let i = 0; i < 50; i++) {
          const { data, error } = await supabase
            .from('efatura_faturalar')
            .select('id,client_id,yon,fatura_turu,tarih,matrah,kdv,tutar')
            .gte('tarih', bas).lte('tarih', bit)
            .order('id', { ascending: true })
            .range(i * 1000, i * 1000 + 999)
          if (error) throw error
          const parti = data || []
          for (const f of parti) {
            const yon = String(f.yon || '').toLowerCase()
            const gelen = yon === 'gelen' || yon === 'alis' || yon === 'alinan' || yon === ''
            if (!gelen) continue
            if (!tevkifatMi(f.fatura_turu)) continue
            const cid = Number(f.client_id)
            if (!faturaHarita.has(cid)) faturaHarita.set(cid, [])
            faturaHarita.get(cid).push(f)
          }
          if (parti.length < 1000) break
        }
        if (!faturaHarita.size) { if (canli) setBekleyenler([]); return }

        // 2) Bu müşterilerin güncel beyan durumları + adları
        const idler = [...faturaHarita.keys()]
        const anahtar = `${donem.yil}_${donem.ayIndex}_kdv2`
        const liste = []
        for (let i = 0; i < idler.length; i += 100) {
          const grup = idler.slice(i, i + 100)
          const { data, error } = await supabase
            .from('clients')
            .select('id,name,company,short_name,beyan_profile,beyan_durumlari')
            .in('id', grup)
          if (error) throw error
          for (const c of (data || [])) {
            const durumlar = c.beyan_durumlari || {}
            const durum = String(durumlar[anahtar] || '')
            if (TAMAM.includes(durum)) continue
            // KDV2 profilini otomatik aktifleştir (Aylık Beyan Takip'te satır oluşsun)
            const profil = c.beyan_profile || {}
            if (!profil?.kdv2?.[donem.ayIndex]?.active) {
              try { await kdv2AktifEtGerekirse(c, faturaHarita.get(Number(c.id)) || []) } catch { /* sessiz */ }
            }
            liste.push({
              id: c.id,
              ad: c.name || c.company || c.short_name || `#${c.id}`
            })
          }
        }
        if (canli) setBekleyenler(liste.sort((a, b) => a.ad.localeCompare(b.ad, 'tr')))
      } catch (e) {
        console.warn('[kdv2-uyari] okunamadı:', e?.message || e)
        if (canli) setBekleyenler([])
      } finally {
        if (canli) setYukleniyor(false)
      }
    }
    yukle()
    // Beyan durumu değişince uyarıyı tazele
    const dinle = () => { yukle() }
    window.addEventListener('beyan-profile-guncellendi', dinle)
    window.addEventListener('mubis-beyan-guncellendi', dinle)
    window.addEventListener('focus', dinle)
    return () => {
      canli = false
      window.removeEventListener('beyan-profile-guncellendi', dinle)
      window.removeEventListener('mubis-beyan-guncellendi', dinle)
      window.removeEventListener('focus', dinle)
    }
  }, [uyariGecerli, donem.yil, donem.ayIndex, donem.ayNo])

  if (!uyariGecerli || yukleniyor || !bekleyenler.length) return null

  return (
    <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-amber-200 text-sm font-semibold">
            Tevkifatlı alış faturası var — KDV2 beyanı bekliyor ({bekleyenler.length})
          </p>
          <p className="text-amber-100/80 text-xs mt-1">
            {AYLAR[donem.ayIndex]} {donem.yil} dönemi · Son beyan tarihi:{' '}
            <strong>25 {sonTarih.ayAdi} {sonTarih.yil}</strong>
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {bekleyenler.map(k => (
              <Link
                key={k.id}
                to="/admin/aylik-beyan-takip"
                className="px-2 py-0.5 rounded-md bg-amber-400/20 text-amber-100 text-xs hover:bg-amber-400/30"
                title="Aylık Beyan Takip'e git"
              >
                {k.ad}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
