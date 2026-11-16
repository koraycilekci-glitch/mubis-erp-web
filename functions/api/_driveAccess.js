const STAFF_ROLES = ['admin', 'personel']
const CLIENT_ROLES = ['client', 'musteri']
const MAX_LIFETIME = 60 * 60 * 24 * 30

export async function driveClientAuthorize(kontrol, clientId) {
  const role = kontrol.profil?.role
  if (!kontrol.ok || !role) return { ok: false, kod: 403, hata: 'Belge erisim yetkisi yok' }
  if (!clientId) return role === 'super_admin'
    ? { ok: true, client: null }
    : { ok: false, kod: 403, hata: 'Musteri bilgisi gerekli' }
  if (!/^\d+$/.test(String(clientId))) return { ok: false, kod: 400, hata: 'Gecersiz musteri' }
  const { data: client, error } = await kontrol.admin.from('clients')
    .select('id,office_id,auth_user_id,name,short_name,company,vkn,tc').eq('id', clientId).maybeSingle()
  if (error) return { ok: false, kod: 503, hata: 'Musteri yetkisi dogrulanamadi' }
  if (!client) return { ok: false, kod: 404, hata: 'Musteri bulunamadi' }
  if (role === 'super_admin') return { ok: true, client }
  if (CLIENT_ROLES.includes(role) && client.auth_user_id === kontrol.kullanici?.id) return { ok: true, client }
  if (STAFF_ROLES.includes(role) && kontrol.profil.office_id && String(client.office_id) === String(kontrol.profil.office_id)) return { ok: true, client }
  return { ok: false, kod: 403, hata: 'Bu musteri icin yetkiniz yok' }
}

export async function driveDocumentAuthorize(kontrol, fileId) {
  const { data: meta, error } = await kontrol.admin.from('drive_belgeler').select('*')
    .eq('drive_file_id', fileId).eq('durum', 'aktif').maybeSingle()
  if (error) return { ok: false, kod: 503, hata: 'Belge kaydi okunamadi' }
  if (!meta) return { ok: false, kod: 404, hata: 'Dosya bulunamadi' }
  if (meta.client_id) {
    const result = await driveClientAuthorize(kontrol, meta.client_id)
    return { ...result, meta }
  }
  if (kontrol.profil?.role === 'super_admin') return { ok: true, meta }
  const legacyPath = String(meta.eski_storage_path || '')
  const identifier = /(?:^|\/)(\d{10,11})_/.exec(legacyPath)?.[1]
  if (identifier) {
    const { data: clients, error: clientError } = await kontrol.admin.from('clients')
      .select('id').or(`vkn.eq.${identifier},tc.eq.${identifier}`).limit(20)
    if (clientError) return { ok: false, kod: 503, hata: 'Belge yetkisi dogrulanamadi' }
    for (const client of clients || []) {
      const result = await driveClientAuthorize(kontrol, client.id)
      const office = /(?:^|\/)ofis_(\d+)\//.exec(legacyPath)?.[1] || '1'
      if (result.ok && String(result.client.office_id) === office) return { ok: true, meta }
    }
  }
  return { ok: false, kod: 403, hata: 'Bu belge icin yetkiniz yok' }
}

async function signingKey(env) {
  const secret = env.MUBIS_SUNUCU_ANAHTARI || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY
  if (!secret) throw new Error('Belge imzalama yapilandirmasi eksik')
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

function encodeBytes(bytes) {
  return btoa(Array.from(bytes, value => String.fromCharCode(value)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeBytes(text) {
  return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0))
}

export async function signDriveCapability(env, claims, seconds = 3600) {
  const lifetime = Math.min(MAX_LIFETIME, Math.max(60, Math.floor(Number(seconds) || 3600)))
  const payload = encodeBytes(new TextEncoder().encode(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + lifetime })))
  const signature = await crypto.subtle.sign('HMAC', await signingKey(env), new TextEncoder().encode('mubis-drive:v1:' + payload))
  return payload + '.' + encodeBytes(new Uint8Array(signature))
}

export async function verifyDriveCapability(env, ticket, purpose) {
  if (typeof ticket !== 'string' || ticket.length > 8192) return null
  try {
    const parts = ticket.split('.')
    if (parts.length !== 2) return null
    const valid = await crypto.subtle.verify('HMAC', await signingKey(env), decodeBytes(parts[1]), new TextEncoder().encode('mubis-drive:v1:' + parts[0]))
    if (!valid) return null
    const claims = JSON.parse(new TextDecoder().decode(decodeBytes(parts[0])))
    const now = Math.floor(Date.now() / 1000)
    if (claims.purpose !== purpose || !Number.isInteger(claims.exp) || claims.exp <= now || claims.exp > now + MAX_LIFETIME) return null
    return claims
  } catch {
    return null
  }
}
