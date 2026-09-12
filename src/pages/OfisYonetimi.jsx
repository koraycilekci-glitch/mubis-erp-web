import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  Building2, Plus, Users, Briefcase, Power, RefreshCw, X, Save,
  ShieldAlert, Calendar, Phone, Mail, Check
} from 'lucide-react'
import {
  getOfficeStats, createOffice, updateOffice, setOfficeActive,
  getOfficeUsers, assignUserToOffice
} from '../services/officeService'
import { supabase } from '../lib/supabase'

export default function OfisYonetimi() {
  const { user } = useAuth()
  const [ofisler, setOfisler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState('')
  const [basari, setBasari] = useState('')

  const [yeniModal, setYeniModal] = useState(false)
  const [detay, setDetay] = useState(null)

  const superAdmin = user?.role === 'super_admin'

  const yukle = async () => {
    setYukleniyor(true)
    setHata('')
    try {
      setOfisler(await getOfficeStats())
    } catch (e) {
      setHata(e.message || 'Ofisler yuklenemedi')
    } finally {
      setYukleniyor(false)
    }
  }

  useEffect(() => { if (superAdmin) yukle() }, [superAdmin])

  const bildir = (mesaj) => {
    setBasari(mesaj)
    setTimeout(() => setBasari(''), 4000)
  }

  if (!superAdmin) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-red-500/10 border border-red-500/40 rounded-2xl p-8 text-center">
          <ShieldAlert className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-white mb-2">Yetkiniz Yok</h2>
          <p className="text-gray-400 text-sm">
            Bu sayfa yalnizca sistem yoneticisi (super admin) tarafindan goruntulenebilir.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Baslik */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-yellow-400" /> Ofis Yonetimi
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Sistemi kullanan mali musavirlik ofisleri. Her ofis yalnizca kendi musterilerini gorur.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={yukle} className="px-3 py-2 rounded-xl bg-blue-900/40 text-gray-300 hover:bg-blue-800/50 text-sm flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${yukleniyor ? 'animate-spin' : ''}`} /> Yenile
          </button>
          <button onClick={() => setYeniModal(true)} className="px-4 py-2 rounded-xl bg-yellow-400 text-blue-950 font-semibold hover:bg-yellow-300 text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Yeni Ofis
          </button>
        </div>
      </div>

      {hata && <div className="mb-4 bg-red-500/10 border border-red-500/40 rounded-xl p-3 text-red-300 text-sm">{hata}</div>}
      {basari && <div className="mb-4 bg-green-500/10 border border-green-500/40 rounded-xl p-3 text-green-300 text-sm flex items-center gap-2"><Check className="w-4 h-4" />{basari}</div>}

      {/* Liste */}
      <div className="grid gap-3">
        {yukleniyor && ofisler.length === 0 && (
          <div className="text-gray-400 text-sm p-6 text-center">Yukleniyor...</div>
        )}

        {ofisler.map(o => (
          <div key={o.id} className="bg-blue-950/40 border border-blue-800/30 rounded-2xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-white font-semibold">{o.name}</h3>
                  <span className="px-2 py-0.5 rounded-lg bg-blue-900/50 text-blue-300 text-xs font-mono">{o.code}</span>
                  {o.id === 1 && <span className="px-2 py-0.5 rounded-lg bg-yellow-500/20 text-yellow-300 text-xs">Ana Ofis</span>}
                  {o.is_active
                    ? <span className="px-2 py-0.5 rounded-lg bg-green-500/20 text-green-300 text-xs">Aktif</span>
                    : <span className="px-2 py-0.5 rounded-lg bg-red-500/20 text-red-300 text-xs">Pasif</span>}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-400">
                  <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{o.musteriSayisi} musteri</span>
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" />{o.kullaniciSayisi} kullanici</span>
                  {o.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{o.phone}</span>}
                  {o.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{o.email}</span>}
                  {o.valid_until && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Bitis: {new Date(o.valid_until).toLocaleDateString('tr-TR')}</span>}
                </div>
                <p className="text-gray-500 text-[11px] mt-2">
                  Musteri giris adi bicimi:{' '}
                  <span className="font-mono text-gray-400">
                    {o.id === 1 ? 'VKN@mubis.app' : `${o.code}-VKN@mubis.app`}
                  </span>
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setDetay(o)}
                  className="px-3 py-1.5 rounded-lg bg-blue-900/40 text-gray-300 hover:bg-blue-800/50 text-xs"
                >
                  Duzenle
                </button>
                {o.id !== 1 && (
                  <button
                    onClick={async () => {
                      try {
                        await setOfficeActive(o.id, !o.is_active)
                        bildir(o.is_active ? 'Ofis pasife alindi' : 'Ofis aktiflestirildi')
                        yukle()
                      } catch (e) { setHata(e.message) }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 ${
                      o.is_active
                        ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25'
                        : 'bg-green-500/15 text-green-300 hover:bg-green-500/25'
                    }`}
                  >
                    <Power className="w-3 h-3" />{o.is_active ? 'Pasife Al' : 'Aktiflestir'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {yeniModal && (
        <YeniOfisModal
          onClose={() => setYeniModal(false)}
          onDone={(mesaj) => { setYeniModal(false); bildir(mesaj); yukle() }}
          onError={setHata}
        />
      )}

      {detay && (
        <OfisDetayModal
          ofis={detay}
          onClose={() => setDetay(null)}
          onDone={(mesaj) => { setDetay(null); bildir(mesaj); yukle() }}
          onError={setHata}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------
// Yeni ofis + ilk admin hesabi
// ---------------------------------------------------------------
function YeniOfisModal({ onClose, onDone, onError }) {
  const [form, setForm] = useState({
    code: '', name: '', phone: '', email: '',
    adminEmail: '', adminName: '', adminPassword: ''
  })
  const [islem, setIslem] = useState(false)

  const kaydet = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      onError('Ofis kodu ve adi zorunludur')
      return
    }
    if (!/^[a-z0-9]+$/.test(form.code.trim().toLowerCase())) {
      onError('Ofis kodu yalnizca kucuk harf ve rakam icerebilir (ornek: demirmm)')
      return
    }

    setIslem(true)
    try {
      const officeId = await createOffice({
        code: form.code, name: form.name, phone: form.phone, email: form.email
      })

      // Ofis admini hesabi (istege bagli)
      if (form.adminEmail.trim() && form.adminPassword.trim()) {
        const { data: { session } } = await supabase.auth.getSession()
        const r = await fetch('/api/create-office-admin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token || ''}`
          },
          body: JSON.stringify({
            email: form.adminEmail.trim(),
            password: form.adminPassword,
            name: form.adminName || form.name,
            officeId
          })
        })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'Ofis admini olusturulamadi')
      }

      onDone('Ofis olusturuldu')
    } catch (e) {
      onError(e.message || 'Ofis olusturulamadi')
    } finally {
      setIslem(false)
    }
  }

  const alan = (label, key, tip = 'text', ipucu = '') => (
    <div>
      <label className="block text-gray-400 text-xs mb-1">{label}</label>
      <input
        type={tip}
        value={form[key]}
        onChange={e => setForm({ ...form, [key]: e.target.value })}
        placeholder={ipucu}
        className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
      />
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-blue-950 border border-blue-800/50 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-blue-800/40 sticky top-0 bg-blue-950">
          <h3 className="text-white font-semibold">Yeni Ofis</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-3">
          {alan('Ofis Kodu *', 'code', 'text', 'demirmm')}
          <p className="text-gray-500 text-[11px] -mt-2">
            Musteri giris adlarinda onek olarak kullanilir: <span className="font-mono">kod-VKN@mubis.app</span>.
            Sonradan degistirilmemelidir.
          </p>
          {alan('Ofis Adi *', 'name', 'text', 'Demir Mali Musavirlik')}
          {alan('Telefon', 'phone', 'text', '0212 000 00 00')}
          {alan('E-posta', 'email', 'email', 'info@ornek.com')}

          <div className="pt-3 border-t border-blue-800/40">
            <p className="text-white text-sm font-medium mb-2">Ofis Yoneticisi (istege bagli)</p>
            <div className="space-y-3">
              {alan('Ad Soyad', 'adminName', 'text', 'Ahmet Demir')}
              {alan('E-posta (giris)', 'adminEmail', 'email', 'ahmet@ornek.com')}
              {alan('Gecici Sifre', 'adminPassword', 'text', 'en az 6 karakter')}
            </div>
            <p className="text-gray-500 text-[11px] mt-2">
              Bos birakirsaniz ofis olusur ama yoneticisi olmaz; sonradan atayabilirsiniz.
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-blue-800/40 flex gap-2 sticky bottom-0 bg-blue-950">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-blue-900/40 text-gray-300 text-sm">Vazgec</button>
          <button onClick={kaydet} disabled={islem} className="flex-1 py-2.5 rounded-xl bg-yellow-400 text-blue-950 font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
            {islem ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Olustur
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------
// Ofis duzenleme + kullanicilar
// ---------------------------------------------------------------
function OfisDetayModal({ ofis, onClose, onDone, onError }) {
  const [form, setForm] = useState({
    name: ofis.name || '',
    phone: ofis.phone || '',
    email: ofis.email || '',
    address: ofis.address || '',
    logo_url: ofis.logo_url || '',
    valid_until: ofis.valid_until || '',
    notes: ofis.notes || ''
  })
  const [kullanicilar, setKullanicilar] = useState([])
  const [islem, setIslem] = useState(false)
  const [atamaEmail, setAtamaEmail] = useState('')
  const [yeniKullanici, setYeniKullanici] = useState({ name: '', email: '', password: '' })

  const kullaniciListesiniYenile = () => {
    getOfficeUsers(ofis.id).then(setKullanicilar).catch(() => {})
  }

  useEffect(() => {
    kullaniciListesiniYenile()
  }, [ofis.id])

  const getAuthHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` }
  }

  // Bu ofise yeni admin kullanıcısı ekle
  const kullaniciEkle = async () => {
    const email = yeniKullanici.email.trim()
    if (!email || !yeniKullanici.password || yeniKullanici.password.length < 6) {
      onError('E-posta ve en az 6 karakterli sifre gerekli')
      return
    }
    setIslem(true)
    try {
      const headers = await getAuthHeader()
      const r = await fetch('/api/manage-users', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email,
          password: yeniKullanici.password,
          name: yeniKullanici.name || email,
          role: 'admin',
          office_id: ofis.id
        })
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Kullanici eklenemedi')
      setYeniKullanici({ name: '', email: '', password: '' })
      kullaniciListesiniYenile()
      onDone('Kullanici eklendi. Gecici sifresiyle giris yapmasini bekleyin.')
    } catch (e) {
      onError(e.message)
    } finally {
      setIslem(false)
    }
  }

  // Kullanicinin sifresini gecici olarak sifirla
  const sifreSifirla = async (k) => {
    const yeni = window.prompt(`${k.name || k.email} icin yeni gecici sifre (en az 6 karakter):`)
    if (!yeni) return
    if (yeni.length < 6) {
      onError('Sifre en az 6 karakter olmalidir')
      return
    }
    setIslem(true)
    try {
      const headers = await getAuthHeader()
      const r = await fetch('/api/manage-users', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'reset-password', userId: k.id, password: yeni })
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Sifre sifirlanamadi')
      onDone('Sifre sifirlandi. Kullanici yeni giriste sifresini degistirmek zorunda kalacak.')
    } catch (e) {
      onError(e.message)
    } finally {
      setIslem(false)
    }
  }

  // Kullaniciyi tamamen sil
  const kullaniciSil = async (k) => {
    if (!window.confirm(`${k.name || k.email} kullanıcisi tamamen silinecek. Emin misiniz?`)) return
    setIslem(true)
    try {
      const headers = await getAuthHeader()
      const r = await fetch(`/api/manage-users?userId=${k.id}`, { method: 'DELETE', headers })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Kullanici silinemedi')
      kullaniciListesiniYenile()
      onDone('Kullanici silindi')
    } catch (e) {
      onError(e.message)
    } finally {
      setIslem(false)
    }
  }

  const kaydet = async () => {
    setIslem(true)
    try {
      await updateOffice(ofis.id, {
        ...form,
        valid_until: form.valid_until || null
      })
      onDone('Ofis guncellendi')
    } catch (e) {
      onError(e.message)
    } finally {
      setIslem(false)
    }
  }

  // Mevcut bir kullaniciyi e-posta ile bu ofise tasi
  const kullaniciAta = async () => {
    if (!atamaEmail.trim()) return
    setIslem(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email')
        .ilike('email', atamaEmail.trim())
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error('Bu e-posta ile kayitli kullanici bulunamadi')

      await assignUserToOffice(data.id, ofis.id, 'admin')
      setAtamaEmail('')
      setKullanicilar(await getOfficeUsers(ofis.id))
    } catch (e) {
      onError(e.message)
    } finally {
      setIslem(false)
    }
  }

  const alan = (label, key, tip = 'text') => (
    <div>
      <label className="block text-gray-400 text-xs mb-1">{label}</label>
      <input
        type={tip}
        value={form[key]}
        onChange={e => setForm({ ...form, [key]: e.target.value })}
        className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
      />
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-blue-950 border border-blue-800/50 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-blue-800/40 sticky top-0 bg-blue-950">
          <div>
            <h3 className="text-white font-semibold">{ofis.name}</h3>
            <p className="text-gray-500 text-xs font-mono">kod: {ofis.code}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-3">
          {alan('Ofis Adi', 'name')}
          {alan('Telefon', 'phone')}
          {alan('E-posta', 'email')}
          {alan('Adres', 'address')}
          {alan('Logo Adresi (URL)', 'logo_url')}
          {form.logo_url && (
            <img
              src={form.logo_url}
              alt="Ofis logosu"
              className="h-10 w-auto object-contain bg-blue-900/30 rounded-lg px-3 py-1.5"
              onError={e => { e.currentTarget.style.display = 'none' }}
            />
          )}
          {alan('Abonelik Bitis Tarihi', 'valid_until', 'date')}
          <div>
            <label className="block text-gray-400 text-xs mb-1">Not</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400 resize-none"
            />
          </div>

          <div className="pt-3 border-t border-blue-800/40">
            <p className="text-white text-sm font-medium mb-2">Ofis Kullanicilari ({kullanicilar.length})</p>
            <div className="space-y-1.5 mb-3">
              {kullanicilar.length === 0 && <p className="text-gray-500 text-xs">Henuz kullanici yok.</p>}
              {kullanicilar.map(k => (
                <div key={k.id} className="flex items-center justify-between gap-2 bg-blue-900/25 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <span className="text-gray-300 text-xs block truncate">{k.name || k.email}</span>
                    <span className="text-gray-500 text-[11px] font-mono truncate block">{k.email}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-gray-500 text-[11px]">{k.role}</span>
                    <button
                      onClick={() => sifreSifirla(k)}
                      disabled={islem}
                      title="Sifre sifirla"
                      className="px-2 py-1 rounded-lg bg-yellow-500/15 text-yellow-300 text-[11px] hover:bg-yellow-500/25 disabled:opacity-50"
                    >
                      Sifre Sifirla
                    </button>
                    <button
                      onClick={() => kullaniciSil(k)}
                      disabled={islem}
                      title="Kullaniciyi sil"
                      className="px-2 py-1 rounded-lg bg-red-500/15 text-red-300 text-[11px] hover:bg-red-500/25 disabled:opacity-50"
                    >
                      Sil
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Yeni kullanici ekleme */}
            <p className="text-white text-sm font-medium mb-2">Yeni Kullanici Ekle</p>
            <div className="space-y-2 mb-2">
              <input
                value={yeniKullanici.name}
                onChange={e => setYeniKullanici({ ...yeniKullanici, name: e.target.value })}
                placeholder="Ad Soyad"
                className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
              />
              <input
                type="email"
                value={yeniKullanici.email}
                onChange={e => setYeniKullanici({ ...yeniKullanici, email: e.target.value })}
                placeholder="E-posta (giris adi)"
                className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
              />
              <input
                value={yeniKullanici.password}
                onChange={e => setYeniKullanici({ ...yeniKullanici, password: e.target.value })}
                placeholder="Gecici sifre (en az 6 karakter)"
                className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
              />
              <button
                onClick={kullaniciEkle}
                disabled={islem}
                className="w-full py-2 rounded-lg bg-blue-500/20 text-blue-300 text-xs hover:bg-blue-500/30 disabled:opacity-50 flex items-center justify-center gap-1"
              >
                <Plus className="w-3 h-3" /> Kullanici Ekle
              </button>
              <p className="text-gray-500 text-[11px]">
                Bu ofise bagli yeni admin hesabi olusturur. Kullanici ilk giriste sifresini degistirmek zorunda kalir.
              </p>
            </div>

            <div className="border-t border-blue-800/40 pt-3">
              <div className="flex gap-2">
                <input
                  value={atamaEmail}
                  onChange={e => setAtamaEmail(e.target.value)}
                  placeholder="Kayitli kullanici e-postasi"
                  className="flex-1 bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                />
                <button onClick={kullaniciAta} disabled={islem} className="px-3 py-2 rounded-lg bg-blue-500/20 text-blue-300 text-xs hover:bg-blue-500/30 disabled:opacity-50">
                  Ofise Ata
                </button>
              </div>
              <p className="text-gray-500 text-[11px] mt-1.5">
                Kayitli bir kullaniciyi bu ofise admin olarak tasir.
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-blue-800/40 flex gap-2 sticky bottom-0 bg-blue-950">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-blue-900/40 text-gray-300 text-sm">Kapat</button>
          <button onClick={kaydet} disabled={islem} className="flex-1 py-2.5 rounded-xl bg-yellow-400 text-blue-950 font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
            {islem ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Kaydet
          </button>
        </div>
      </div>
    </div>
  )
}
