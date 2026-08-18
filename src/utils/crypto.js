// Musteri portal sifrelerinin sifrelenmesi / cozulmesi.
// Ortam degiskeni VITE_PORTAL_CRYPTO_KEY icermeli; ayni anahtar
// MUBIS Automation sunucusunda da bulunmali.

const ALGO = 'AES-GCM'
const KEY_LEN = 256

function getEnvKey() {
  return import.meta.env.VITE_PORTAL_CRYPTO_KEY || ''
}

async function importKey(rawKey) {
  const enc = new TextEncoder()
  const keyData = enc.encode(rawKey.padEnd(32, ' ').slice(0, 32))
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: ALGO },
    false,
    ['encrypt', 'decrypt']
  )
}

function bufToBase64(buf) {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToBuf(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

export async function encryptPortalValue(plainText) {
  if (!plainText) return ''
  const key = await importKey(getEnvKey())
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = new TextEncoder()
  const cipher = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    enc.encode(plainText)
  )
  const combined = new Uint8Array(iv.byteLength + cipher.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(cipher), iv.byteLength)
  return 'enc:' + bufToBase64(combined.buffer)
}

export async function decryptPortalValue(cipherText) {
  if (!cipherText) return ''
  if (!String(cipherText).startsWith('enc:')) return cipherText
  const key = await importKey(getEnvKey())
  const combined = new Uint8Array(base64ToBuf(String(cipherText).slice(4)))
  const iv = combined.slice(0, 12)
  const cipher = combined.slice(12)
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGO, iv },
    key,
    cipher
  )
  return new TextDecoder().decode(decrypted)
}

export async function encryptCredentials(creds) {
  const out = {}
  for (const [k, v] of Object.entries(creds || {})) {
    if (typeof v === 'string' && v.trim()) {
      out[k] = await encryptPortalValue(v)
    } else {
      out[k] = v
    }
  }
  return out
}

export async function decryptCredentials(creds) {
  const out = {}
  for (const [k, v] of Object.entries(creds || {})) {
    if (typeof v === 'string' && v.startsWith('enc:')) {
      out[k] = await decryptPortalValue(v)
    } else {
      out[k] = v
    }
  }
  return out
}
