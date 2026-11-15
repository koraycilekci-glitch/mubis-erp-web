// src/services/lisansService.js
// MUBiS lisans istemcisi: durum, talep kodu üretimi, aktivasyon.
// Device kimliği tarayıcıda kalıcıdır (localStorage).

import { supabase } from '../lib/supabase'

const CIHAZ_KEY = 'mubis_cihaz_id'

export function cihazIdAl() {
  let id = localStorage.getItem(CIHAZ_KEY)
  if (!id) {
    const bayt = new Uint8Array(16)
    crypto.getRandomValues(bayt)
    id = Array.from(bayt).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
    localStorage.setItem(CIHAZ_KEY, id)
  }
  return id
}

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) return null
  return { Authorization: `Bearer ${token}` }
}

export async function lisansDurumu() {
  const auth = await authHeader()
  if (!auth) return { ok: false, error: 'Oturum bulunamadi' }
  const r = await fetch('/api/lisans?action=status', { headers: auth })
  return r.json()
}

export async function talepKoduUret() {
  const auth = await authHeader()
  if (!auth) return { ok: false, error: 'Oturum bulunamadi' }
  const device = cihazIdAl()
  const r = await fetch(`/api/lisans?action=talep&device=${device}`, { headers: auth })
  const j = await r.json()
  return j.ok ? { ...j, device } : j
}

export async function lisansAktiveEt(lisansKodu) {
  const auth = await authHeader()
  if (!auth) return { ok: false, error: 'Oturum bulunamadi' }
  const r = await fetch('/api/lisans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ action: 'aktive', lisans_kodu: String(lisansKodu || '').trim(), device: cihazIdAl() }),
  })
  return r.json()
}
