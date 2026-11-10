import { supabase } from '../lib/supabase'
import { getMyOfficeId } from './officeService'

const DEFAULT_SETTINGS = {
  whatsapp_channel: 'api', // 'api' | 'web'
  // WhatsApp Web gonderiminin hangi makineden yapilacagi:
  // 'vps' = Istanbul sunucusundaki yardimci (ofis kapali olsa da calisir)
  // 'yerel' = bu bilgisayardaki yardimci program (QR bir kez okutulur)
  whatsapp_web_kaynak: 'vps',
  // Otomatik borç bildirimi planı (JSON):
  // { aktif, gunler:[1,3,5] (0=Pazar), saat:'10:00', kanal:'whatsapp'|'email' }
  borc_bildirim_plan: JSON.stringify({ aktif: false, gunler: [1], saat: '10:00', kanal: 'whatsapp' }),
  whatsapp_phone_number_id: '',
  whatsapp_access_token: '',
  whatsapp_template_name: 'beyanname_bildirim',
  smtp_host: '',
  smtp_port: '587',
  smtp_user: '',
  smtp_pass: '',
  smtp_from: '',
  smtp_secure: 'false',
  ai_voice_gender: 'kadin',
  payment_provider: 'paytr', // aktif odeme kurulusu: 'paytr' | 'odeal' | 'eft'
  payment_providers_enabled: JSON.stringify(['paytr']), // anlasilan kuruluslar
  ai_voice_name: '',
  ai_voice_rate: '1.02',
  ai_voice_pitch: '1',
  client_document_permissions: JSON.stringify({
    beyanname: {
      kdv: true, kdv2: true, muhtasar: true, sgk: true, gecici_vergi: true,
      kurumlar_vergi: true, gelir_vergi: true, edefter: true, muhtasar_3aylik: true, esmm: true
    },
    tahakkuk: {
      kdv: true, kdv2: true, muhtasar: true, sgk: true, gecici_vergi: true,
      kurumlar_vergi: true, gelir_vergi: true, edefter: true, muhtasar_3aylik: true, esmm: true
    },
    mizan: true,
    sigorta_tahakkuk: true,
    hizmet_listesi: true,
    bordro: true,
    gelir_beyani: true,
    gecici_vergi: true,
    vergi_levhasi: true,
    mali_evraklar: true
  }),
  client_document_folders: JSON.stringify({
    folders: [
      {
        id: 'mali_veriler',
        name: 'Mali Veriler',
        children: [
          {
            id: 'gelir_beyani',
            name: 'Gelir Beyanı',
            contents: [
              { source: 'gelir_beyani', docType: 'beyanname', label: 'Gelir/Kurumlar Vergi Beyanı' },
              { source: 'gelir_beyani', docType: 'tahakkuk', label: 'Tahakkuk' },
              { source: 'gelir_beyani', docType: 'mizan', label: 'Mizan' }
            ]
          },
          {
            id: 'gecici_vergi',
            name: 'Geçici Vergi',
            contents: [
              { source: 'gecici_vergi', docType: 'beyanname', label: 'Geçici Vergi Beyanname' },
              { source: 'gecici_vergi', docType: 'tahakkuk', label: 'Tahakkuk' },
              { source: 'gecici_vergi', docType: 'mizan', label: 'Mizan' }
            ]
          },
          {
            id: 'vergi_levhasi',
            name: 'Vergi Levhası',
            contents: [
              { source: 'vergi_levhasi', label: 'Vergi Levhası' }
            ]
          }
        ]
      },
      {
        id: 'mali_evraklar',
        name: 'Mali Evraklar',
        children: [
          {
            id: 'imza_beyani',
            name: 'İmza Beyanı',
            contents: [{ source: 'mali_evraklar', category: 'imza_beyani', label: 'İmza Beyanı' }]
          },
          {
            id: 'gazete',
            name: 'Gazete',
            contents: [{ source: 'mali_evraklar', category: 'gazete', label: 'Gazete' }]
          },
          {
            id: 'kurulus',
            name: 'Kuruluş',
            contents: [{ source: 'mali_evraklar', category: 'kurulus', label: 'Kuruluş' }]
          },
          {
            id: 'diger',
            name: 'Diğer',
            contents: [{ source: 'mali_evraklar', category: 'diger', label: 'Diğer' }]
          },
          {
            id: 'bordro',
            name: 'Bordro',
            contents: [{ source: 'mali_evraklar', category: 'bordro', label: 'Bordro' }]
          },
          {
            id: 'hizmet_listesi',
            name: 'Hizmet Listesi',
            contents: [{ source: 'mali_evraklar', category: 'hizmet_listesi', label: 'Hizmet Listesi' }]
          },
          {
            id: 'sigorta_tahakkuk',
            name: 'Sigorta Tahakkuk',
            contents: [{ source: 'mali_evraklar', category: 'sigorta_tahakkuk', label: 'Sigorta Tahakkuk' }]
          }
        ]
      }
    ]
  })
}

export function getDefaultDocumentFolders() {
  try {
    return JSON.parse(DEFAULT_SETTINGS.client_document_folders)
  } catch {
    return { folders: [] }
  }
}

export function parseDocumentFolders(raw) {
  try {
    return raw ? JSON.parse(raw) : getDefaultDocumentFolders()
  } catch {
    return getDefaultDocumentFolders()
  }
}

export function getDefaultDocumentPermissions() {
  try {
    return JSON.parse(DEFAULT_SETTINGS.client_document_permissions)
  } catch {
    return {}
  }
}

export function parseDocumentPermissions(raw) {
  try {
    return raw ? JSON.parse(raw) : getDefaultDocumentPermissions()
  } catch {
    return getDefaultDocumentPermissions()
  }
}

export function isDocumentTypeAllowed(permissions, category, beyanType = null) {
  if (!permissions) return true
  const cat = permissions[category]
  if (cat === undefined) return true
  if (typeof cat === 'boolean') return cat
  if (beyanType && typeof cat === 'object') {
    return cat[beyanType] !== false
  }
  return true
}

export async function getSettings() {
  // Ayarlar ofis bazlidir. RLS zaten baska ofisin satirlarini gizler,
  // yine de office_id ile filtreliyoruz (super_admin tum satirlari gorur).
  let ofisId = null
  try {
    ofisId = await getMyOfficeId()
  } catch { /* ofis okunamadi, filtresiz devam */ }

  let sorgu = supabase.from('app_settings').select('key, value, office_id')
  if (ofisId) sorgu = sorgu.eq('office_id', ofisId)

  const { data, error } = await sorgu
  if (error) throw error

  const settings = { ...DEFAULT_SETTINGS }
  ;(data || []).forEach(row => {
    settings[row.key] = row.value
  })
  return settings
}

export async function saveSettings(settings) {
  const ofisId = await getMyOfficeId()
  const rows = Object.entries(settings).map(([key, value]) => ({
    key,
    value: value || '',
    office_id: ofisId
  }))
  const { error } = await supabase
    .from('app_settings')
    .upsert(rows, { onConflict: 'office_id,key' })
  if (error) throw error
  return true
}

// Tek anahtar okuma/yazma (e-imza bayraklari, fatura kesim taslaklari vb.)
// Ofis bazli app_settings tablosunu kullanir; DDL gerektirmez.
export async function getAppSetting(key) {
  let ofisId = null
  try { ofisId = await getMyOfficeId() } catch { /* filtresiz devam */ }
  let sorgu = supabase.from('app_settings').select('value').eq('key', key)
  if (ofisId) sorgu = sorgu.eq('office_id', ofisId)
  const { data, error } = await sorgu.maybeSingle()
  if (error) throw error
  return data?.value ?? null
}

export async function setAppSetting(key, value) {
  const ofisId = await getMyOfficeId()
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value: value ?? '', office_id: ofisId }, { onConflict: 'office_id,key' })
  if (!error) return true
  // Musteri rolleri app_settings RLS insert politikasindan gecemez —
  // servis anahtari kullanan /api/app-settings koprusune dus.
  const { data: { session } } = await supabase.auth.getSession()
  const r = await fetch('/api/app-settings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
    },
    body: JSON.stringify({ key, value: value ?? '', office_id: ofisId })
  })
  if (r.ok) return true
  const hata = await r.json().catch(() => ({}))
  throw new Error(hata.error || `Taslak kaydetme API hatasi (${r.status})`)
}

// Verilen onekle baslayan anahtarlari döner: [{ key, value }]
export async function listAppSettings(prefix) {
  let ofisId = null
  try { ofisId = await getMyOfficeId() } catch { /* filtresiz devam */ }
  let sorgu = supabase.from('app_settings').select('key, value').like('key', `${prefix}%`)
  if (ofisId) sorgu = sorgu.eq('office_id', ofisId)
  const { data, error } = await sorgu
  if (error) throw error
  return data || []
}

export async function deleteAppSetting(key) {
  const ofisId = await getMyOfficeId()
  // DIKKAT: RLS delete'i HATA VERMEDEN 0 satir silebilir — bu yuzden
  // sayiyi istiyoruz; 0 ise API koprusune dusuyoruz.
  const { error, count } = await supabase
    .from('app_settings')
    .delete({ count: 'exact' })
    .eq('key', key)
    .eq('office_id', ofisId)
  if (!error && count > 0) return true
  // Musteri rolleri delete politikasindan gecemez (0 satir) — API koprusune dus.
  const { data: { session } } = await supabase.auth.getSession()
  const r = await fetch(`/api/app-settings?key=${encodeURIComponent(key)}&office_id=${ofisId}`, {
    method: 'DELETE',
    headers: session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}
  })
  if (r.ok) return true
  const hata = await r.json().catch(() => ({}))
  throw new Error(hata.error || `Silme API hatasi (${r.status})`)
}

// Kayit klasorleri (admin ayarlanabilir) — beyanname + fatura gelen/giden
// klasorleri. Bos/okunamazsa varsayilan G: yollari kullanilir. Her ofis
// (muhasebeci) kendi yollarini ayarlayabilir (app_settings ofis bazli).
export async function kayitKlasorleriGetir() {
  const varsayilan = {
    beyannameKlasoru: "G:\\Drive'ım\\BEYANNAME",
    faturaGelenKlasoru: "G:\\Drive'ım\\EDEFTER",
    faturaGidenKlasoru: "G:\\Drive'ım\\EDEFTER"
  }
  try {
    const st = await getSettings()
    return {
      beyannameKlasoru: String(st.beyanname_klasoru || '').trim() || varsayilan.beyannameKlasoru,
      faturaGelenKlasoru: String(st.fatura_gelen_klasoru || '').trim() || varsayilan.faturaGelenKlasoru,
      faturaGidenKlasoru: String(st.fatura_giden_klasoru || '').trim() || varsayilan.faturaGidenKlasoru
    }
  } catch {
    return varsayilan
  }
}

export function getWhatsAppConfig(settings) {
  return {
    phoneNumberId: settings?.whatsapp_phone_number_id || import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID || '',
    accessToken: settings?.whatsapp_access_token || import.meta.env.VITE_WHATSAPP_ACCESS_TOKEN || '',
    templateName: settings?.whatsapp_template_name || import.meta.env.VITE_WHATSAPP_TEMPLATE_NAME || 'beyanname_bildirim'
  }
}

export function getSMTPConfig(settings) {
  return {
    host: settings?.smtp_host || '',
    port: parseInt(settings?.smtp_port || '587'),
    user: settings?.smtp_user || '',
    pass: settings?.smtp_pass || '',
    from: settings?.smtp_from || settings?.smtp_user || '',
    secure: settings?.smtp_secure === 'true'
  }
}
