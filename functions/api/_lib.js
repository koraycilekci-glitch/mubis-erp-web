// MUBIS - CF Pages Functions ortak yardimcilari
import { createClient } from '@supabase/supabase-js'

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

export const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json', ...extra } })

export function supabaseAdmin(env) {
  const url = env?.VITE_SUPABASE_URL || env?.SUPABASE_URL || 'https://gxuqrxmpgoeyykoolmwv.supabase.co'
  const key = env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_SERVICE_KEY
  if (!key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export function normalizePhone(phone) {
  if (!phone) return ''
  let cleaned = String(phone).replace(/\D/g, '')
  if (cleaned.startsWith('0')) cleaned = cleaned.slice(1)
  if (!cleaned.startsWith('90')) cleaned = '90' + cleaned
  return cleaned
}

export function safeJsonParse(val) {
  if (val && typeof val === 'object') return val
  if (typeof val === 'string' && val.trim()) {
    try {
      const parsed = JSON.parse(val)
      if (typeof parsed === 'string') return safeJsonParse(parsed)
      return parsed
    } catch { return null }
  }
  return null
}

export function getKiraBilgisi(client) {
  return safeJsonParse(client.kira_bilgisi) || safeJsonParse(client.kiraBilgisi) || {}
}

export function trDateInputToDate(str) {
  if (!str) return null
  if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return new Date(str + 'T00:00:00')
  if (str.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
    const [g, a, y] = str.split('.')
    return new Date(`${y}-${a}-${g}T00:00:00`)
  }
  const d = new Date(str)
  return Number.isNaN(d.getTime()) ? null : d
}

export function daysUntil(date) {
  const now = new Date()
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24))
}

export async function sendWhatsAppText(phone, message, config) {
  const phoneNumberId = config?.phoneNumberId
  const accessToken = config?.accessToken
  const to = normalizePhone(phone)
  if (!to || !phoneNumberId || !accessToken) return { skipped: true }
  try {
    const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: message }
      })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error?.message || 'WhatsApp error')
    return { ok: true, messageId: data.messages?.[0]?.id }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

export async function fetchText(url, timeoutMs = 10000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept-Language': 'tr-TR,tr;q=0.9'
      }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = await res.arrayBuffer()
    // Karakter seti tespiti: content-type basligi yoksa HTML meta etiketine bak
    let charset = (res.headers.get('content-type') || '').match(/charset=([\w-]+)/i)?.[1] || ''
    const head = new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(0, 2048))
    if (!charset) charset = head.match(/charset=["']?([\w-]+)/i)?.[1] || 'utf-8'
    try {
      return new TextDecoder(charset.toLowerCase(), { fatal: false }).decode(buf)
    } catch {
      return new TextDecoder('utf-8', { fatal: false }).decode(buf)
    }
  } finally {
    clearTimeout(timeout)
  }
}
