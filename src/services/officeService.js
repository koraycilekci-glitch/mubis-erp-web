import { supabase } from '../lib/supabase'

/**
 * Ofis (tenant) islemleri.
 * Her mali musavirlik ofisi ayri bir kayittir; musteriler, ayarlar ve
 * belgeler ofis bazinda ayrilir.
 */

const ANA_OFIS_ID = 1

// ---------------------------------------------------------------
// Oturum bilgisi
// ---------------------------------------------------------------

let _cache = { userId: null, office: null }

/** Giris yapan kullanicinin ofis kaydini dondurur (onbellekli) */
export async function getMyOffice(force = false) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) { _cache = { userId: null, office: null }; return null }

  if (!force && _cache.userId === user.id && _cache.office) return _cache.office

  const { data: prof } = await supabase
    .from('profiles')
    .select('office_id, role')
    .eq('id', user.id)
    .single()

  let officeId = prof?.office_id

  // Musteri profilinde office_id bos kalmissa clients uzerinden bul
  if (!officeId) {
    const { data: c } = await supabase
      .from('clients')
      .select('office_id')
      .eq('auth_user_id', user.id)
      .limit(1)
      .maybeSingle()
    officeId = c?.office_id
  }

  if (!officeId) officeId = ANA_OFIS_ID

  const { data: office } = await supabase
    .from('offices')
    .select('*')
    .eq('id', officeId)
    .maybeSingle()

  const sonuc = office || { id: officeId, code: 'mubis', name: 'MUBiS Mali Musavirlik' }
  _cache = { userId: user.id, office: sonuc }
  return sonuc
}

/** Yalnizca ofis id degeri */
export async function getMyOfficeId() {
  const o = await getMyOffice()
  return o?.id || ANA_OFIS_ID
}

/** Onbellegi temizle (cikis / ofis degisikligi sonrasi) */
export function clearOfficeCache() {
  _cache = { userId: null, office: null }
}

// ---------------------------------------------------------------
// Storage yol onegi
// ---------------------------------------------------------------

/**
 * Ofisin storage klasor onegi.
 * Ana ofis (id=1) mevcut dosyalari bozmamak icin onek KULLANMAZ.
 * Diger ofisler 'ofis_<id>/' onegi alir.
 */
export function officePrefix(officeId) {
  const id = Number(officeId) || ANA_OFIS_ID
  return id === ANA_OFIS_ID ? '' : `ofis_${id}/`
}

/** Giris yapan kullanicinin ofis onegi */
export async function getMyOfficePrefix() {
  return officePrefix(await getMyOfficeId())
}

// ---------------------------------------------------------------
// Musteri giris adi onegi
// ---------------------------------------------------------------

/**
 * Musteri portal giris adini uretir.
 * Ana ofis  : 1234567890@mubis.app        (mevcut format korunur)
 * Diger ofis: ofiskodu-1234567890@mubis.app
 */
export function buildClientLoginEmail(identifier, office) {
  const temiz = String(identifier || '').trim()
  const id = Number(office?.id) || ANA_OFIS_ID
  if (id === ANA_OFIS_ID) return `${temiz}@mubis.app`
  const kod = (office?.code || `ofis${id}`).toLowerCase()
  return `${kod}-${temiz}@mubis.app`
}

/** Giris ekraninda kullanicinin yazdigi degeri e-postaya cevirir */
export function normalizeLoginIdentifier(identifier) {
  const t = String(identifier || '').trim()
  if (t.includes('@')) return t
  return `${t}@mubis.app`
}

// ---------------------------------------------------------------
// Super admin islemleri
// ---------------------------------------------------------------

export async function getOffices() {
  const { data, error } = await supabase
    .from('offices')
    .select('*')
    .order('id')
  if (error) throw error
  return data || []
}

export async function getOfficeStats() {
  const { data: offices, error } = await supabase.from('offices').select('*').order('id')
  if (error) throw error

  const { data: clientRows } = await supabase.from('clients').select('office_id')
  const { data: profileRows } = await supabase.from('profiles').select('office_id, role')

  return (offices || []).map(o => ({
    ...o,
    musteriSayisi: (clientRows || []).filter(c => c.office_id === o.id).length,
    kullaniciSayisi: (profileRows || []).filter(p => p.office_id === o.id && p.role !== 'client').length
  }))
}

/** Yeni ofis olusturur (super_admin) */
export async function createOffice({ code, name, phone = '', email = '' }) {
  const { data, error } = await supabase.rpc('create_office', {
    p_code: String(code || '').trim().toLowerCase(),
    p_name: String(name || '').trim(),
    p_phone: phone,
    p_email: email
  })
  if (error) throw error
  return data
}

export async function updateOffice(id, alanlar) {
  const { data, error } = await supabase
    .from('offices')
    .update({ ...alanlar, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  clearOfficeCache()
  return data
}

export async function setOfficeActive(id, aktif) {
  return updateOffice(id, { is_active: !!aktif })
}

/** Kullaniciyi ofise atar (super_admin) */
export async function assignUserToOffice(userId, officeId, role = 'admin') {
  const { error } = await supabase.rpc('assign_user_to_office', {
    p_user_id: userId,
    p_office_id: officeId,
    p_role: role
  })
  if (error) throw error
  return true
}

/** Bir ofisin kullanicilarini listeler */
export async function getOfficeUsers(officeId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, role, created_at')
    .eq('office_id', officeId)
    .neq('role', 'client')
    .order('created_at')
  if (error) throw error
  return data || []
}
