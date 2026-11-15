// MUBiS — Lisans ortak yardimcilari (Cloudflare Pages Functions)
//
// Akis: Ofis talep kodu uretir (MUBREQ1) -> uretici (siz) scripts/lisans-uret.mjs ile
// imzali lisans kodu uretir (MUBLIC1) -> ofis kodu girer -> sunucu dogrulup kaydeder.
//
// Dogrulama: RSA-SHA256 (WebCrypto). Public key bu modulde gomulu; private key
// uretici tarafinda keys/lisans-private.pem olarak durur (git'e girmez).
//
// Muafiyet: env.LISANS_MUAF_OFFICES (virgullu office_id listesi, varsayilan '1').
// Deneme: ilk gorulmede otomatik 30 gun (lisans_deneme tablosu).
// Bitis: aktif lisans yoksa ve deneme bittiyse durum 'gerekli' doner (API tarafinda 402).

export const LISANS_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAle7Exs9hbpBHVU8TEYiI
Q8IFfyANZ1J/ssKljkr4W9PJqE3VjJp51OstTgcKQj4CCiAhV1LuNgC4rUJVvJWX
hCshStxFUmPj7GT9Rr/7W8rTkUf50JZQ923LtJXRoHrZPD9VjLk/bLDpSIepk7Aj
RRtL6ILFOhGUL7pVGQciAlJpqBALiXEhB+1DoWPaJKauWPALVhdtczFejM2ySI3a
ZRbHR83OrfgivpWXSEJlqbenQQ0U0KUQEWiOd9z4HPN81N2xOIqrnTcmPoTIiw1K
wkh2VePgYxN7d2NdrK0pCHNyl1KLYsuGHNFZYyrsBfD3zBsD7ZopCJmwvya2NphZ
FwIDAQAB
-----END PUBLIC KEY-----`

const DENEME_GUN = 30
const CHECKSUM_ONEK = 'MUBREQ1.'

function b64urlKodla(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlAc(str) {
  const b = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = '='.repeat((4 - (b.length % 4)) % 4)
  const s = atob(b + pad)
  return Uint8Array.from(s, c => c.charCodeAt(0))
}

function sha256hex(str) {
  // Cloudflare Workers: crypto.subtle.digest senkron degil; checksum icin
  // basit, kararli ve hizli bir karma kullanmak yeterli (gizli degil).
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  const hex = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
  return hex.padStart(16, '0')
}

// -------- Talep kodu (MUBREQ1) --------
export function talepKoduUret(officeId, cihazId) {
  const govde = b64urlKodla(new TextEncoder().encode(JSON.stringify({
    v: 1, office: String(officeId), device: String(cihazId || ''),
  })))
  const cs = sha256hex(CHECKSUM_ONEK + govde)
  return `${CHECKSUM_ONEK}${govde}.${cs}`
}

export function talepKoduCoz(value) {
  const kod = String(value || '').trim()
  const parcalar = kod.split('.')
  if (kod.length > 1000 || parcalar.length !== 3 || parcalar[0] !== 'MUBREQ1' ||
      !/^[A-Za-z0-9_-]+$/.test(parcalar[1]) || parcalar[2] !== sha256hex(CHECKSUM_ONEK + parcalar[1])) {
    throw new Error('Talep kodu eksik veya bozuk.')
  }
  const p = JSON.parse(new TextDecoder().decode(b64urlAc(parcalar[1])))
  if (p?.v !== 1 || !/^\d+$/.test(String(p.office)) || !/^[A-F0-9]{8,64}$/i.test(String(p.device))) {
    throw new Error('Talep kodu icerigi gecersiz.')
  }
  return { office: Number(p.office), device: String(p.device) }
}

// -------- Lisans kodu (MUBLIC1) dogrulama --------
async function publicKeyAl() {
  const pem = LISANS_PUBLIC_KEY
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const der = b64urlAc(b64.replace(/\+/g, '-').replace(/\//g, '_'))
  return crypto.subtle.importKey('spki', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
}

export async function lisansKoduCoz(value) {
  const kod = String(value || '').trim()
  const parcalar = kod.split('.')
  if (parcalar.length !== 3 || parcalar[0] !== 'MUBLIC1' ||
      !/^[A-Za-z0-9_-]+$/.test(parcalar[1]) || !/^[A-Za-z0-9_-]+$/.test(parcalar[2])) {
    throw new Error('Lisans kodu bozuk (format).')
  }
  const payloadStr = `${parcalar[0]}.${parcalar[1]}`
  const imza = b64urlAc(parcalar[2])
  const gecerli = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    await publicKeyAl(),
    imza,
    new TextEncoder().encode(payloadStr)
  )
  if (!gecerli) throw new Error('Lisans kodu imzasi gecersiz.')
  const p = JSON.parse(new TextDecoder().decode(b64urlAc(parcalar[1])))
  if (p?.v !== 1 || !/^\d+$/.test(String(p.office)) || !['deneme', 'aylik', 'yillik', 'kalici'].includes(p.plan)) {
    throw new Error('Lisans kodu icerigi gecersiz.')
  }
  if (p.bitis && new Date(p.bitis).getTime() < Date.now()) {
    throw new Error('Bu lisans kodunun bitis tarihi gecmis (' + p.bitis.slice(0, 10) + ').')
  }
  return p
}

// -------- Durum sorgulama (ofis bazli) --------
export function muafOfisler(env) {
  return String(env?.LISANS_MUAF_OFFICES ?? '1').split(',').map(s => s.trim()).filter(Boolean).map(Number)
}

export async function lisansDurumu(admin, env, officeId) {
  if (!officeId || muafOfisler(env).includes(Number(officeId))) {
    return { gerekli: false, muaf: true }
  }

  // aktif lisans var mi?
  const { data: lisanslar, error: lHata } = await admin
    .from('lisanslar')
    .select('id, lisans_kodu, plan, baslangic, bitis, durum')
    .eq('office_id', Number(officeId))
    .eq('durum', 'aktif')
    .order('bitis', { ascending: false, nullsFirst: false })
    .limit(1)
  if (lHata) return { gerekli: false, muaf: true, hata: lHata.message } // hata durumunda kilitlemeyelim
  const lisans = (lisanslar || [])[0] || null
  if (lisans) {
    const kalici = lisans.plan === 'kalici' || !lisans.bitis
    const bitisGecerli = kalici || new Date(lisans.bitis).getTime() > Date.now()
    if (bitisGecerli) {
      return {
        gerekli: false, muaf: false,
        plan: lisans.plan, bitis: lisans.bitis,
        kalanGun: kalici ? null : Math.ceil((new Date(lisans.bitis).getTime() - Date.now()) / 86400000),
      }
    }
  }

  // deneme durumu
  const { data: deneme } = await admin
    .from('lisans_deneme')
    .select('id, deneme_bitis')
    .eq('office_id', Number(officeId))
    .maybeSingle()
  if (!deneme) {
    const bitis = new Date(Date.now() + DENEME_GUN * 86400000).toISOString()
    await admin.from('lisans_deneme').insert({ office_id: Number(officeId), deneme_bitis: bitis })
    return { gerekli: false, muaf: false, plan: 'deneme', bitis, kalanGun: DENEME_GUN }
  }
  const kalan = Math.ceil((new Date(deneme.deneme_bitis).getTime() - Date.now()) / 86400000)
  if (kalan > 0) {
    return { gerekli: false, muaf: false, plan: 'deneme', bitis: deneme.deneme_bitis, kalanGun: kalan }
  }

  return { gerekli: true, muaf: false, plan: lisans?.plan || 'deneme', bitis: lisans?.bitis || deneme.deneme_bitis }
}
