import { supabase } from '../lib/supabase'

/**
 * Giris yapan kullanicidan clients.id cozer.
 * Sirasiyla: sayisal user.id -> user.clientId -> auth_user_id -> username/email
 */
export async function resolveClientId(user) {
  if (!user) return null

  if (user.id && typeof user.id === 'number') return user.id
  if (user.clientId) return user.clientId

  if (user.id && typeof user.id === 'string' && user.id.includes('-')) {
    try {
      const { data } = await supabase
        .from('clients')
        .select('id')
        .eq('auth_user_id', user.id)
        .limit(1)
        .maybeSingle()
      if (data) return data.id
    } catch { /* devam */ }
  }

  if (user.email) {
    const prefix = user.email.split('@')[0]
    try {
      const { data } = await supabase
        .from('clients')
        .select('id')
        .or(`username.eq.${prefix},email.eq.${user.email}`)
        .limit(1)
        .maybeSingle()
      if (data) return data.id
    } catch { /* devam */ }
  }

  return null
}
