// MUBIS - Yeni ofis icin admin hesabi olustur (Cloudflare Pages Function)
// POST /api/create-office-admin  Body: { email, password, name, officeId }
// Yalnizca super_admin cagirabilir.
import { createClient } from '@supabase/supabase-js'
import { json, supabaseAdmin } from './_lib.js'

export async function onRequestPost({ request, env }) {
  try {
    const { email, password, name, officeId } = await request.json().catch(() => ({}))

    if (!email || !password || !officeId) {
      return json({ error: 'E-posta, sifre ve ofis bilgisi gerekli' }, 400)
    }
    if (String(password).length < 6) {
      return json({ error: 'Sifre en az 6 karakter olmalidir' }, 400)
    }

    const admin = supabaseAdmin(env)
    if (!admin) {
      return json({ error: 'Supabase service key eksik. Cloudflare Pages > Variables and Secrets > SUPABASE_SERVICE_ROLE_KEY ekleyin.' }, 500)
    }

    // --- Cagiranin super_admin oldugunu dogrula ---
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return json({ error: 'Oturum bilgisi bulunamadi' }, 401)
    }

    const { data: caller, error: callerErr } = await admin.auth.getUser(token)
    if (callerErr || !caller?.user) {
      return json({ error: 'Oturum dogrulanamadi' }, 401)
    }

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', caller.user.id)
      .maybeSingle()

    if (callerProfile?.role !== 'super_admin') {
      return json({ error: 'Bu islem icin sistem yoneticisi yetkisi gerekir' }, 403)
    }

    // --- Kullaniciyi olustur / bul ---
    const { data: listData } = await admin.auth.admin.listUsers()
    const existing = listData?.users?.find(
      u => (u.email || '').toLowerCase() === String(email).toLowerCase()
    )

    let userId
    if (existing) {
      userId = existing.id
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: name || '', role: 'admin', office_id: String(officeId) }
      })
      if (error) throw error
      userId = data.user.id
    }

    // --- Profili ofise bagla ---
    await admin.from('profiles').upsert({
      id: userId,
      email,
      name: name || '',
      role: 'admin',
      temp_password: true,
      office_id: Number(officeId)
    }, { onConflict: 'id' })

    // --- Ofis sahibi bos ise bu kullaniciyi sahip yap ---
    await admin
      .from('offices')
      .update({ owner_id: userId })
      .eq('id', officeId)
      .is('owner_id', null)

    return json({ success: true, userId })
  } catch (err) {
    console.error('Ofis admini olusturma hatasi:', err)
    return json({ error: err.message }, 500)
  }
}
