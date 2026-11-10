// MUBIS - Musteri portal giris hesabi olustur (Cloudflare Pages Function)
// POST /api/create-client-user
// Body: { email, password, name, clientId, officeId }
// SUPABASE_SERVICE_ROLE_KEY ile auth.admin.createUser + profiles/clients guncelleme.
import { createClient } from '@supabase/supabase-js'

export async function onRequestPost({ request, env }) {
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })

  const url = env?.VITE_SUPABASE_URL || env?.SUPABASE_URL || 'https://gxuqrxmpgoeyykoolmwv.supabase.co'
  const serviceKey = env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_SERVICE_KEY
  if (!serviceKey) {
    return json({ error: 'SUPABASE_SERVICE_ROLE_KEY degiskeni tanimli degil (Production ortami). Cloudflare Pages > Settings > Variables and Secrets > Production sekmesine aynen bu isimle ekleyin, sonra bir deploy gerekiyor.' }, 500)
  }

  let body = {}
  try { body = await request.json() } catch { return json({ error: 'Gecersiz JSON govdesi' }, 400) }
  const { email, password, name } = body
  if (!email || !password) return json({ error: 'Email ve sifre gerekli' }, 400)

  const parsedClientId = Number(body.clientId)
  const clientId = Number.isInteger(parsedClientId) && parsedClientId > 0 ? parsedClientId : null
  if (!clientId) return json({ error: 'Geçerli müşteri kimliği gerekli' }, 400)

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const token = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return json({ error: 'Oturum bilgisi gerekli' }, 401)
  const { data: caller, error: authError } = await admin.auth.getUser(token)
  if (authError || !caller?.user) return json({ error: 'Oturum doğrulanamadı' }, 401)
  const { data: profile, error: profileError } = await admin.from('profiles').select('role,office_id').eq('id', caller.user.id).maybeSingle()
  if (profileError || !['super_admin', 'admin', 'personel'].includes(profile?.role)) return json({ error: 'Bu işlem için yetkiniz yok' }, 403)
  const { data: client, error: clientError } = await admin.from('clients').select('id,office_id,auth_user_id').eq('id', clientId).maybeSingle()
  if (clientError || !client) return json({ error: 'Müşteri bulunamadı' }, 404)
  if (profile.role !== 'super_admin' && (!profile.office_id || String(profile.office_id) !== String(client.office_id))) {
    return json({ error: 'Bu müşteri için yetkiniz yok' }, 403)
  }

  try {
    const ofisId = client.office_id
    if (!ofisId) return json({ error: 'Müşterinin ofis bilgisi bulunamadı' }, 400)

    const { data: listData } = await admin.auth.admin.listUsers()
    const existing = listData?.users?.find(u => u.email === email)

    let userId
    if (existing) {
      const { data: existingProfile, error: existingProfileError } = await admin.from('profiles').select('role,client_id').eq('id', existing.id).maybeSingle()
      if (existingProfileError || !['client', 'musteri'].includes(existingProfile?.role) || String(existingProfile?.client_id) !== String(clientId)) {
        return json({ error: 'Bu e-posta başka bir hesap tarafından kullanılıyor' }, 409)
      }
      userId = existing.id
    } else {
      if (client.auth_user_id) return json({ error: 'Bu müşterinin portal hesabı zaten var' }, 409)
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role: 'musteri', temp_password: true, office_id: String(ofisId) }
      })
      if (error) throw error
      userId = data.user.id
    }

    if (client.auth_user_id && client.auth_user_id !== userId) return json({ error: 'Bu müşterinin portal hesabı zaten var' }, 409)

    const { error: updateProfileError } = await admin.from('profiles').upsert({
      id: userId,
      role: 'musteri',
      name: name || '',
      temp_password: true,
      client_id: clientId || null,
      office_id: ofisId
    }, { onConflict: 'id' })
    if (updateProfileError) throw updateProfileError

    if (clientId) {
      const query = admin.from('clients').update({ auth_user_id: userId }).eq('id', clientId)
      const { data: updatedClient, error: updateClientError } = await (client.auth_user_id ? query.eq('auth_user_id', userId) : query.is('auth_user_id', null)).select('id').maybeSingle()
      if (updateClientError) throw updateClientError
      if (!updatedClient) return json({ error: 'Müşterinin portal hesabı başka bir işlem tarafından değiştirildi' }, 409)
    }

    return json({ success: true, userId })
  } catch (err) {
    console.error('Musteri auth kullanici olusturma hatasi:', err)
    return json({ error: err.message || 'Portal hesabi olusturulamadi' }, 500)
  }
}
