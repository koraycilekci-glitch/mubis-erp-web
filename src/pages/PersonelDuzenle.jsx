import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { useClients } from '../hooks/useClients'
import { addEmployee, getEmployees, updateEmployee } from '../services/clientService'
import { formatTurkishInput, parseTurkishNumber, hamTutarGirdisi } from '../utils/numberFormat'

const currentYear = new Date().getFullYear()

const createEmployeeForm = () => ({
  ad_soyad: '',
  tc_kimlik: '',
  ise_giris_tarihi: '',
  cikis_tarihi: '',
  dogum_tarihi: '',
  departman: '',
  gorev: '',
  email: '',
  telefon: '',
  adres: '',
  aktif: true,
  ucret_tipi: 'brut',
  net_ucret: '',
  brut_ucret: '',
  gecmis_yil_izinleri_kullanildi: false,
  gecmis_yil_bakiyeleri: [{ yil: currentYear - 1, gun: 0 }]
})

const dateValue = (value) => (value ? String(value).slice(0, 10) : '')
const numberValue = (value) => parseTurkishNumber(value)

export default function PersonelDuzenle() {
  const { employeeId } = useParams()
  const [searchParams] = useSearchParams()
  const clientId = searchParams.get('clientId') || ''
  const navigate = useNavigate()
  const { clients = [] } = useClients()

  const isEditing = Boolean(employeeId)
  const client = clients.find((c) => String(c.id) === String(clientId))

  const [form, setForm] = useState(createEmployeeForm())
  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    const load = async () => {
      if (!clientId) {
        setError('Müşteri belirtilmemiş. Lütfen İzin Takip sayfasından bir müşteri seçip tekrar deneyin.')
        setLoading(false)
        return
      }
      if (!isEditing) {
        setForm(createEmployeeForm())
        setLoading(false)
        return
      }
      try {
        const list = await getEmployees(clientId)
        const found = (Array.isArray(list) ? list : []).find((e) => String(e.id) === String(employeeId))
        if (!active) return
        if (!found) {
          setError('Personel kaydı bulunamadı.')
        } else {
          setForm({
            ...createEmployeeForm(),
            ...found,
            ise_giris_tarihi: dateValue(found.ise_giris || found.ise_giris_tarihi),
            cikis_tarihi: dateValue(found.isten_cikis || found.cikis_tarihi),
            dogum_tarihi: dateValue(found.dogum_tarihi),
            gecmis_yil_izinleri_kullanildi: found.gecmis_yil_izinleri_kullanildi === true,
            gecmis_yil_bakiyeleri: found.gecmis_yil_izinleri_kullanildi === true
              ? []
              : (Array.isArray(found.gecmis_yil_bakiyeleri) && found.gecmis_yil_bakiyeleri.length
                ? found.gecmis_yil_bakiyeleri
                : [{ yil: currentYear - 1, gun: 0 }])
          })
        }
      } catch (err) {
        if (active) setError(err?.message || 'Personel yüklenemedi.')
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => { active = false }
  }, [clientId, employeeId, isEditing])

  const updateField = (event) => {
    const { name, value, type, checked } = event.target
    setForm((previous) => ({ ...previous, [name]: type === 'checkbox' ? checked : value }))
  }

  const togglePastLeave = (event) => {
    const used = event.target.checked
    setForm((previous) => ({
      ...previous,
      gecmis_yil_izinleri_kullanildi: used,
      gecmis_yil_bakiyeleri: used
        ? []
        : (previous.gecmis_yil_bakiyeleri?.length ? previous.gecmis_yil_bakiyeleri : [{ yil: currentYear - 1, gun: 0 }])
    }))
  }

  const addPastBalance = () => {
    setForm((previous) => {
      const balances = Array.isArray(previous.gecmis_yil_bakiyeleri) ? previous.gecmis_yil_bakiyeleri : []
      const lastYear = balances.length ? numberValue(balances[balances.length - 1]?.yil) : currentYear
      return {
        ...previous,
        gecmis_yil_izinleri_kullanildi: false,
        gecmis_yil_bakiyeleri: [...balances, { yil: (lastYear || currentYear) - 1, gun: 0 }]
      }
    })
  }

  const updatePastBalance = (index, field, value) => {
    setForm((previous) => ({
      ...previous,
      gecmis_yil_izinleri_kullanildi: false,
      gecmis_yil_bakiyeleri: (previous.gecmis_yil_bakiyeleri || []).map((item, itemIndex) => (
        itemIndex === index ? { ...item, [field]: field === 'gun' ? value : numberValue(value) } : item
      ))
    }))
  }

  const removePastBalance = (index) => {
    setForm((previous) => ({
      ...previous,
      gecmis_yil_bakiyeleri: (previous.gecmis_yil_bakiyeleri || []).filter((_, itemIndex) => itemIndex !== index)
    }))
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (!clientId || !String(form.ad_soyad || '').trim()) return

    setSaving(true)
    setError('')
    try {
      const balances = form.gecmis_yil_izinleri_kullanildi
        ? []
        : (form.gecmis_yil_bakiyeleri || [])
          .map((item) => ({ yil: numberValue(item.yil), gun: numberValue(item.gun) }))
          .filter((item) => item.yil > 0 && item.gun >= 0)

      const payload = {
        ...form,
        client_id: clientId,
        ise_giris: form.ise_giris_tarihi || null,
        isten_cikis: form.cikis_tarihi || null,
        dogum_tarihi: form.dogum_tarihi || null,
        gecmis_yil_izinleri_kullanildi: form.gecmis_yil_izinleri_kullanildi === true,
        gecmis_yil_bakiyeleri: balances,
        ucret_tipi: form.ucret_tipi === 'net' ? 'net' : 'brut',
        net_ucret: form.ucret_tipi === 'net' ? (form.net_ucret === '' ? null : parseTurkishNumber(form.net_ucret)) : null,
        brut_ucret: form.ucret_tipi === 'brut' ? (form.brut_ucret === '' ? null : parseTurkishNumber(form.brut_ucret)) : null,
        net_maas: form.ucret_tipi === 'net' ? (form.net_ucret === '' ? null : parseTurkishNumber(form.net_ucret)) : null,
        brut_maas: form.ucret_tipi === 'brut' ? (form.brut_ucret === '' ? null : parseTurkishNumber(form.brut_ucret)) : null
      }

      if (isEditing) {
        await updateEmployee(employeeId, payload)
      } else {
        await addEmployee(Number(clientId), payload)
      }
      navigate(`/admin/izin-takip?clientId=${clientId}`)
    } catch (err) {
      setError(err?.message || 'Personel kaydedilemedi.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen space-y-6 p-4 text-white md:p-6">
      <div className="flex items-center gap-3">
        <Link
          to={`/admin/izin-takip${clientId ? `?clientId=${clientId}` : ''}`}
          className="flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
        >
          <ArrowLeft className="w-4 h-4" /> Geri
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">{isEditing ? 'Personel Düzenle' : 'Yeni Personel'}</h1>
          <p className="text-sm text-slate-400">{client ? (client.name || client.unvan || client.company) : 'Müşteri'}</p>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-500/15 p-3 text-sm text-red-300">{error}</div>}

      {loading ? (
        <div className="text-sm text-slate-400">Yükleniyor...</div>
      ) : !clientId ? null : (
        <form onSubmit={handleSave} className="grid gap-3 rounded-xl border border-slate-700 bg-slate-900 p-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-300">Ad Soyad *</span>
            <input name="ad_soyad" value={form.ad_soyad} onChange={updateField} placeholder="Personelin ad soyadı" required className="w-full rounded-lg bg-slate-800 px-3 py-2" />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-300">T.C. Kimlik No</span>
            <input name="tc_kimlik" value={form.tc_kimlik} onChange={updateField} placeholder="11 haneli T.C. kimlik numarası" className="w-full rounded-lg bg-slate-800 px-3 py-2" />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-300">İşe Giriş Tarihi</span>
            <input name="ise_giris_tarihi" type="date" value={form.ise_giris_tarihi} onChange={updateField} className="w-full rounded-lg bg-slate-800 px-3 py-2" />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-300">İşten Çıkış Tarihi</span>
            <input name="cikis_tarihi" type="date" value={form.cikis_tarihi} onChange={updateField} className="w-full rounded-lg bg-slate-800 px-3 py-2" />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-300">Doğum Tarihi</span>
            <input name="dogum_tarihi" type="date" value={form.dogum_tarihi} onChange={updateField} className="w-full rounded-lg bg-slate-800 px-3 py-2" />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-300">Departman</span>
            <input name="departman" value={form.departman} onChange={updateField} placeholder="Örn. Muhasebe" className="w-full rounded-lg bg-slate-800 px-3 py-2" />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-300">Görev</span>
            <input name="gorev" value={form.gorev} onChange={updateField} placeholder="Örn. Muhasebe elemanı" className="w-full rounded-lg bg-slate-800 px-3 py-2" />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-300">E-posta</span>
            <input name="email" type="email" value={form.email} onChange={updateField} placeholder="personel@email.com" className="w-full rounded-lg bg-slate-800 px-3 py-2" />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-300">Telefon</span>
            <input name="telefon" value={form.telefon} onChange={updateField} placeholder="05xx xxx xx xx" className="w-full rounded-lg bg-slate-800 px-3 py-2" />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium text-slate-300">Adres</span>
            <input name="adres" value={form.adres || ''} onChange={updateField} className="w-full rounded-lg bg-slate-800 px-3 py-2" />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium text-slate-300">Ücret Tipi</span>
            <select name="ucret_tipi" value={form.ucret_tipi} onChange={updateField} className="w-full rounded-lg bg-slate-800 px-3 py-2">
              <option value="brut">Brüt</option>
              <option value="net">Net</option>
            </select>
          </label>
          <div className="hidden md:block" />
          {form.ucret_tipi === 'net' ? (
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-300">Net ücret (TL)</span>
              <input name="net_ucret" type="text" inputMode="decimal" value={form.net_ucret} onChange={(event) => setForm((previous) => ({ ...previous, net_ucret: hamTutarGirdisi(event.target.value) }))} onBlur={(event) => setForm((previous) => ({ ...previous, net_ucret: formatTurkishInput(event.target.value) }))} placeholder="Net ücret tutarı" className="w-full rounded-lg bg-slate-800 px-3 py-2" />
            </label>
          ) : (
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-300">Brüt ücret (TL)</span>
              <input name="brut_ucret" type="text" inputMode="decimal" value={form.brut_ucret} onChange={(event) => setForm((previous) => ({ ...previous, brut_ucret: hamTutarGirdisi(event.target.value) }))} onBlur={(event) => setForm((previous) => ({ ...previous, brut_ucret: formatTurkishInput(event.target.value) }))} placeholder="Brüt ücret tutarı" className="w-full rounded-lg bg-slate-800 px-3 py-2" />
            </label>
          )}
          <div className="hidden md:block" />

          <label className="flex items-center gap-2 text-sm text-slate-300 md:col-span-2">
            <input type="checkbox" checked={form.gecmis_yil_izinleri_kullanildi === true} onChange={togglePastLeave} />
            Geçmiş yıl izinleri kullanıldı; eski bakiyeleri sıfırla
          </label>

          {form.gecmis_yil_izinleri_kullanildi !== true && (
            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Geçmiş yıllardan kalan izinler</span>
                <button type="button" onClick={addPastBalance} className="rounded-lg bg-slate-700 px-3 py-1 text-xs">Yıl ekle</button>
              </div>
              {(form.gecmis_yil_bakiyeleri || []).map((balance, index) => (
                <div key={`${balance.yil}-${index}`} className="flex flex-wrap gap-2">
                  <input type="number" min="2000" max={currentYear - 1} value={balance.yil} onChange={(event) => updatePastBalance(index, 'yil', event.target.value)} className="w-28 rounded-lg bg-slate-800 px-3 py-2" />
                  <input type="number" min="0" step="0.5" value={balance.gun} onChange={(event) => updatePastBalance(index, 'gun', event.target.value)} placeholder="Kalan gün" className="w-36 rounded-lg bg-slate-800 px-3 py-2" />
                  <button type="button" onClick={() => removePastBalance(index)} className="rounded-lg bg-red-600/80 px-3 py-2 text-sm">Sil</button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 md:col-span-2">
            <button type="submit" disabled={saving} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 disabled:opacity-60">
              <Save className="w-4 h-4" /> {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
            <Link to={`/admin/izin-takip?clientId=${clientId}`} className="rounded-lg bg-slate-700 px-4 py-2">Vazgeç</Link>
          </div>
        </form>
      )}
    </div>
  )
}
