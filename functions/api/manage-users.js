// MUBIS - Kullanici yonetimi (Cloudflare Pages Function)
// POST /api/manage-users  Body: { action, ... }
// DELETE /api/manage-users?userId=..&userIds=..
import { createClient } from '@supabase/supabase-js'

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  }
}

async function getAdmin(env) {
  const supabaseUrl = env?.VITE_SUPABASE_URL || env?.SUPABASE_URL || 'https://gxuqrxmpgoeyykoolmwv.supabase.co'
  const serviceKey = env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_SERVICE_KEY
  if (!serviceKey) return { error: 'Supabase service key eksik. Cloudflare Pages > Settings > Variables and Secrets > SUPABASE_SERVICE_ROLE_KEY ekleyin.' }
  return { admin: createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }) }
}

async function dogrula(supabaseAdmin, request) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return { error: 'Oturum bilgisi bulunamadi', status: 401 }

  const { data: caller, error: callerErr } = await supabaseAdmin.auth.getUser(token)
  if (callerErr || !caller?.user) return { error: 'Oturum dogrulanamadi', status: 401 }

  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', caller.user.id)
    .maybeSingle()

  if (callerProfile?.role !== 'super_admin') {
    return { error: 'Bu islem icin sistem yoneticisi yetkisi gerekir', status: 403 }
  }
  return { caller: caller.user }
}

// Profil upsert: sema cache hatasi veren kolonu dusurerek tekrar dener
async function upsertProfile(supabaseAdmin, payload) {
  let current = { ...payload }
  for (let i = 0; i < 4; i++) {
    const { error } = await supabaseAdmin.from('profiles').upsert(current)
    if (!error) return null
    const m = error.message?.match(/'([^']+)' column/i)
    if (m && m[1] in current) {
      delete current[m[1]]
      continue
    }
    return error
  }
  return new Error('Profil kaydedilemedi')
}

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: corsHeaders() })
}

export async function onRequestPost({ request, env }) {
  const g = await getAdmin(env)
  if (g.error) return json({ error: g.error }, 500)
  const supabaseAdmin = g.admin

  const d = await dogrula(supabaseAdmin, request)
  if (d.error) return json({ error: d.error }, d.status)

  let body = {}
  try { body = await request.json() } catch { return json({ error: 'Gecersiz JSON govdesi' }, 400) }
  const { action } = body || {}

  // --- Sifre sifirla (gecici sifre ver) ---
  if (action === 'reset-password') {
    const { userId, password } = body
    if (!userId || !password) return json({ error: 'userId ve sifre zorunlu' }, 400)
    if (String(password).length < 6) return json({ error: 'Sifre en az 6 karakter olmalidir' }, 400)

    try {
      const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true
      })
      if (aErr) throw aErr

      await supabaseAdmin
        .from('profiles')
        .update({ temp_password: true })
        .eq('id', userId)

      return json({ success: true })
    } catch (err) {
      return json({ error: err.message || 'Sifre sifirlanamadi' }, 500)
    }
  }

  // --- Kullanici guncelle ---
  if (action === 'update') {
    const { userId, name, email, role, mukellef } = body
    if (!userId) return json({ error: 'userId zorunlu' }, 400)

    try {
      const updates = {}
      if (name) updates.name = name
      if (role) updates.role = role
      if (email) updates.email = email
      // Mukellef: admin/personel icin sol menudeki kendi mukellef klasoru
      if (typeof mukellef === 'boolean') updates.mukellef = mukellef

      // Yeni eklenen kolonlar icin PostgREST sema-ozbellegi gec guncellenebilir —
      // gecici hatada 3 kez (1.2 sn arayla) yeniden dene
      let pErr = null
      for (let deneme = 0; deneme < 3; deneme++) {
        const r = await supabaseAdmin
          .from('profiles')
          .update(updates)
          .eq('id', userId)
        pErr = r.error
        if (!pErr) break
        await new Promise((c) => setTimeout(c, 1200))
      }
      if (pErr) throw pErr

      const authUpd = { user_metadata: { name, role } }
      if (email) authUpd.email = email
      authUpd.email_confirm = true
      const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(userId, authUpd)
      if (aErr) throw aErr

      return json({ success: true })
    } catch (err) {
      return json({ error: err.message || 'Kullanici guncellenemedi' }, 500)
    }
  }

  // --- Yeni kullanici ---
  const { email, password, name, role, client_id, office_id } = body
  if (!email || !password || !name || !role) {
    return json({ error: 'Email, sifre, isim ve rol zorunlu' }, 400)
  }

  try {
    const { data: existing } = await supabaseAdmin.auth.admin.listUsers()
    const alreadyExists = existing?.users?.some(u => u.email === email)
    if (alreadyExists) {
      return json({ error: 'Bu email adresi z kayitli' }, 400)
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role, office_id: office_id || null }
    })

    if (authError) throw authError

    const userId = authData.user.id

    const profileError = await upsertProfile(supabaseAdmin, {
      id: userId,
      name,
      email,
      role,
      office_id: office_id || null,
      client_id: client_id || null,
      temp_password: true
    })

    if (profileError) throw profileError

    return json({ success: true, user: authData.user })
  } catch (err) {
    console.error('Kullanici olusturma hatasi:', err)
    return json({ error: err.message || 'Kullanici olusturulamadi' }, 500)
  }
}

export async function onRequestDelete({ request, env }) {
  const g = await getAdmin(env)
  if (g.error) return json({ error: g.error }, 500)
  const supabaseAdmin = g.admin

  const d = await dogrula(supabaseAdmin, request)
  if (d.error) return json({ error: d.error }, d.status)

  const url = new URL(request.url)
  const userId = url.searchParams.get('userId')
  const userIds = url.searchParams.get('userIds')
  const ids = userIds ? String(userIds).split(',').filter(Boolean) : (userId ? [userId] : [])

  if (ids.length === 0) {
    return json({ error: 'userId veya userIds zorunlu' }, 400)
  }

  const errors = []
  for (const id of ids) {
    try {
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(id)
      if (authError) throw authError
      await supabaseAdmin.from('profiles').delete().eq('id', id)
    } catch (err) {
      errors.push(`${id}: ${err.message}`)
    }
  }

  if (errors.length > 0) {
    return json({ error: `${errors.length} kullanici silinemedi`, details: errors }, 500)
  }
  return json({ success: true, deleted: ids.length })
}
