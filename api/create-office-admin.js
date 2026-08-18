import { createClient } from '@supabase/supabase-js'

/**
 * Yeni ofis icin admin hesabi olusturur.
 * Yalnizca super_admin cagirabilir; cagiran kullanicinin rolu
 * gonderilen erisim jetonu ile dogrulanir.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Yalnizca POST' })
  }

  try {
    const { email, password, name, officeId } = req.body || {}

    if (!email || !password || !officeId) {
      return res.status(400).json({ error: 'E-posta, sifre ve ofis bilgisi gerekli' })
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Sifre en az 6 karakter olmalidir' })
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://gxuqrxmpgoeyykoolmwv.supabase.co'
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

    if (!serviceKey) {
      return res.status(500).json({ error: 'Supabase service key eksik. Vercel ayarlarinda SUPABASE_SERVICE_ROLE_KEY tanimlanmali.' })
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // --- Cagiranin super_admin oldugunu dogrula ---
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return res.status(401).json({ error: 'Oturum bilgisi bulunamadi' })
    }

    const { data: caller, error: callerErr } = await admin.auth.getUser(token)
    if (callerErr || !caller?.user) {
      return res.status(401).json({ error: 'Oturum dogrulanamadi' })
    }

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', caller.user.id)
      .maybeSingle()

    if (callerProfile?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Bu islem icin sistem yoneticisi yetkisi gerekir' })
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

    return res.status(200).json({ success: true, userId })
  } catch (err) {
    console.error('Ofis admini olusturma hatasi:', err)
    return res.status(500).json({ error: err.message })
  }
}
