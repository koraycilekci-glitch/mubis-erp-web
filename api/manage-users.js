import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://gxuqrxmpgoeyykoolmwv.supabase.co'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

  if (!serviceKey) {
    return res.status(500).json({ error: 'Supabase service key eksik. Vercel ayarlarinda SUPABASE_SERVICE_ROLE_KEY tanimlanmali.' })
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  // Profil upsert: sema cache hatasi veren kolonu dusurerek tekrar dener
  async function upsertProfile(payload) {
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

  if (req.method === 'POST') {
    const { action } = req.body || {}

    // --- Kullanici guncelle ---
    if (action === 'update') {
      const { userId, name, email, role } = req.body
      if (!userId) return res.status(400).json({ error: 'userId zorunlu' })

      try {
        const updates = {}
        if (name) updates.name = name
        if (role) updates.role = role
        if (email) updates.email = email

        const { error: pErr } = await supabaseAdmin
          .from('profiles')
          .update(updates)
          .eq('id', userId)
        if (pErr) throw pErr

        const authUpd = { user_metadata: { name, role } }
        if (email) authUpd.email = email
        authUpd.email_confirm = true
        const { error: aErr } = await supabaseAdmin.auth.admin.updateUserById(userId, authUpd)
        if (aErr) throw aErr

        return res.status(200).json({ success: true })
      } catch (err) {
        return res.status(500).json({ error: err.message || 'Kullanici guncellenemedi' })
      }
    }

    // --- Yeni kullanici ---
    const { email, password, name, role, client_id, office_id } = req.body
    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'Email, sifre, isim ve rol zorunlu' })
    }

    try {
      const { data: existing } = await supabaseAdmin.auth.admin.listUsers()
      const alreadyExists = existing?.users?.some(u => u.email === email)
      if (alreadyExists) {
        return res.status(400).json({ error: 'Bu email adresi z kayitli' })
      }

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role, office_id: office_id || null }
      })

      if (authError) throw authError

      const userId = authData.user.id

      const profileError = await upsertProfile({
        id: userId,
        name,
        email,
        role,
        office_id: office_id || null,
        client_id: client_id || null,
        temp_password: true
      })

      if (profileError) throw profileError

      return res.status(200).json({ success: true, user: authData.user })
    } catch (err) {
      console.error('Kullanici olusturma hatasi:', err)
      return res.status(500).json({ error: err.message || 'Kullanici olusturulamadi' })
    }
  }

  if (req.method === 'DELETE') {
    const { userId, userIds } = req.query
    const ids = userIds ? String(userIds).split(',').filter(Boolean) : (userId ? [userId] : [])

    if (ids.length === 0) {
      return res.status(400).json({ error: 'userId veya userIds zorunlu' })
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
      return res.status(500).json({ error: `${errors.length} kullanici silinemedi`, details: errors })
    }
    return res.status(200).json({ success: true, deleted: ids.length })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
