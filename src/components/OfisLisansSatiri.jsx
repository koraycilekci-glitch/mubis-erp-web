// src/components/OfisLisansSatiri.jsx
// Ofis Yonetimi > ofis karti icinde lisans durumu + aktivasyon (super_admin).
// Durum: lisanslar tablosundan (RLS: authenticated select) okunur.
// Aktivasyon: /api/lisans POST action='aktive' + office_id (super_admin baska ofise de girebilir).
import { useState } from 'react'
import { KeyRound, Copy, Check, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'

const PLAN_ADI = { deneme: 'Deneme', aylik: 'Aylık', yillik: 'Yıllık', kalici: 'Kalıcı' }

export default function OfisLisansSatiri({ ofisId, ofisAdi }) {
  const [acik, setAcik] = useState(false)
  const [lisans, setLisans] = useState(null)
  const [deneme, setDeneme] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [kod, setKod] = useState('')
  const [mesaj, setMesaj] = useState(null)
  const [islem, setIslem] = useState('')

  const yukle = async () => {
    setYukleniyor(true)
    const [{ data: l }, { data: d }] = await Promise.all([
      supabase.from('lisanslar').select('plan, baslangic, bitis, durum').eq('office_id', ofisId).order('bitis', { ascending: false, nullsFirst: false }).limit(1),
      supabase.from('lisans_deneme').select('deneme_bitis').eq('office_id', ofisId).maybeSingle(),
    ])
    setLisans(l?.[0] || null)
    setDeneme(d || null)
    setYukleniyor(false)
  }

  const goster = async () => {
    const yeni = !acik
    setAcik(yeni)
    if (yeni) await yukle()
  }

  const aktive = async () => {
    if (!kod.trim()) return
    setIslem('aktive')
    setMesaj(null)
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    if (!token) { setMesaj({ tip: 'hata', metin: 'Oturum bulunamadi' }); setIslem(''); return }
    const r = await fetch('/api/lisans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'aktive', lisans_kodu: String(kod).trim(), office_id: ofisId }),
    })
    const j = await r.json()
    setIslem('')
    if (j.ok) { setKod(''); setMesaj({ tip: 'ok', metin: j.mesaj || 'Aktive edildi' }); await yukle() }
    else setMesaj({ tip: 'hata', metin: j.error || 'Aktivasyon basarisiz' })
  }

  const aktif = lisans?.durum === 'aktif' && (lisans?.plan === 'kalici' || !lisans?.bitis || new Date(lisans.bitis) > new Date())
  const kalanGun = lisans?.bitis ? Math.ceil((new Date(lisans.bitis) - new Date()) / 86400000) : null

  return (
    <div className="mt-3 pt-3 border-t border-blue-800/20">
      <button onClick={goster} className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200">
        {acik ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <KeyRound className="w-3.5 h-3.5 text-yellow-400" />
        <span>Lisans</span>
        {!acik && (
          aktif ? (
            <span className="px-1.5 py-0.5 rounded bg-green-500/15 text-green-300">{PLAN_ADI[lisans.plan] || lisans.plan}{kalanGun != null ? ` · ${kalanGun} gün` : ''}</span>
          ) : deneme ? (
            <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300">Deneme · {Math.ceil((new Date(deneme.deneme_bitis) - new Date()) / 86400000)} gün</span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-red-500/15 text-red-300">Lisans yok</span>
          )
        )}
      </button>

      {acik && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-3 text-xs">
            {yukleniyor && <span className="text-gray-500">Yukleniyor…</span>}
            {!yukleniyor && (aktif ? (
              <>
                <span className="bg-blue-950/60 rounded-lg px-2 py-1 text-gray-300">Plan: <b className="text-white">{PLAN_ADI[lisans.plan] || lisans.plan}</b></span>
                <span className="bg-blue-950/60 rounded-lg px-2 py-1 text-gray-300">
                  Bitiş: <b className="text-white">{lisans.bitis ? new Date(lisans.bitis).toLocaleDateString('tr-TR') : 'Süresiz'}</b>
                </span>
                {kalanGun != null && <span className="bg-blue-950/60 rounded-lg px-2 py-1 text-gray-300">Kalan: <b className="text-white">{kalanGun} gün</b></span>}
              </>
            ) : (
              <span className="text-gray-400">
                {deneme
                  ? `Aktif lisans yok. Deneme bitişi: ${new Date(deneme.deneme_bitis).toLocaleDateString('tr-TR')}`
                  : 'Aktif lisans yok. Deneme başlamamış.'}
              </span>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text" value={kod} onChange={e => setKod(e.target.value)}
              placeholder="MUBLIC1.… lisans kodu"
              className="flex-1 bg-black/40 border border-blue-700/40 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500"
            />
            <button onClick={aktive} disabled={islem === 'aktive' || !kod.trim()}
              className="px-3 py-1.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-blue-950 text-xs font-bold disabled:opacity-40">
              {islem === 'aktive' ? 'Aktive…' : 'Aktive Et'}
            </button>
            <button onClick={yukle} className="p-1.5 rounded-lg hover:bg-white/5" title="Yenile">
              <RefreshCw className={`w-3.5 h-3.5 text-gray-400 ${yukleniyor ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {mesaj && (
            <div className={`text-xs flex items-center gap-1 ${mesaj.tip === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
              {mesaj.tip === 'ok' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {mesaj.metin}
            </div>
          )}

          <p className="text-gray-500 text-[11px]">
            {ofisAdi} için lisans kodu: müşterinin Ayarlar &gt; Lisans bölümünden talep kodunu üretmesi gerekir
            (office_id={ofisId}). Kodu <span className="font-mono">node scripts/lisans-uret.mjs --talep "..." --plan yillik --bitis YYYY-MM-DD</span> ile üretin.
          </p>
        </div>
      )}
    </div>
  )
}
