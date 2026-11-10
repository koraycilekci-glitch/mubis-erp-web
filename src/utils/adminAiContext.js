// MUBIS Asistan - admin/personel icin musteri/evrak sorgu baglami.
// "Ahmet Kurel Temmuz KDV tahakkukunu goster" gibi sorulari cozer ve
// ilgili musterinin evrak linki + tutarini AI'ya verir.

import { getClients } from '../services/clientService'
import { getBeyanStorageKey, getFormattedBeyanDeadline, getMonthName } from './dateUtils'
import { getTahakkukList, getHizmetListesi } from './tahakkukUtils'
import { buildCariAiContext } from './cariAiContext'

const AY_MAP = {
  ocak: 0, şubat: 1, subat: 1, mart: 2, nisan: 3, mayıs: 4, mayis: 4,
  haziran: 5, temmuz: 6, ağustos: 7, agustos: 7, eylül: 8, eylul: 8,
  ekim: 9, kasım: 10, kasim: 10, aralık: 11, aralik: 11
}

const VERGI_TIPLERI = [
  { keys: ['kdv2', 'kdv 2', 'kdv-2', 'tevkifat'], type: 'kdv2', ad: 'KDV2 (tevkifat)', sonOdemeGun: 25 },
  { keys: ['kdv', 'katma değer', 'katma deger'], type: 'kdv', ad: 'KDV', sonOdemeGun: 28 },
  { keys: ['muhtasar', 'prim hizmet', 'prim hizmeti'], type: 'muhtasar', ad: 'Muhtasar ve Prim Hizmet', sonOdemeGun: 26 },
  { keys: ['sgk', 'sigorta', 'sigorta primi', 'sgk primi'], type: 'sgk', ad: 'SGK primi', sonOdemeGun: null },
  { keys: ['geçici vergi', 'gecici vergi'], type: 'gecici_vergi', ad: 'Geçici Vergi', sonOdemeGun: 17 },
  { keys: ['kurumlar vergisi', 'kurumlar'], type: 'kurumlar_vergi', ad: 'Kurumlar Vergisi', sonOdemeGun: 30 },
  { keys: ['gelir vergisi', 'gelir'], type: 'gelir_vergi', ad: 'Gelir Vergisi', sonOdemeGun: 31 },
  { keys: ['damga vergisi', 'damga'], type: 'damga_vergi', ad: 'Damga Vergisi', sonOdemeGun: 26 },
  { keys: ['vergi levhası', 'vergi levhasi', 'vergi levhas'], type: 'vergi_levhasi', ad: 'Vergi Levhası', sonOdemeGun: null }
]

function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/ş/g, 's').replace(/ı/g, 'i').replace(/İ/g, 'i').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/,/g, ' ').replace(/\./g, ' ')
}

function para(n) {
  return Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Soruda ay ismi var mi bakar; yoksa mevcut ayi doner. */
function ayCoz(q) {
  const nq = normalize(q)
  for (const [ad, idx] of Object.entries(AY_MAP)) {
    if (nq.includes(ad)) return idx
  }
  return new Date().getMonth()
}

/** Soruda yil var mi bakar; yoksa mevcut yili doner. */
function yilCoz(q) {
  const m = String(q).match(/20\d{2}/)
  return m ? Number(m[0]) : new Date().getFullYear()
}

/** Soruda gecen vergi tipini cozer. */
function vergiTipiCoz(q) {
  const nq = normalize(q)
  for (const t of VERGI_TIPLERI) {
    for (const k of t.keys) {
      if (nq.includes(normalize(k))) return t
    }
  }
  return null
}

/** Soruda gecen musteri adina en cok benzeyen musteriyi bulur. */
function musteriBul(clients, q) {
  const nq = normalize(q)
  const scored = clients
    .map(c => {
      const name = normalize(c.name || c.company || '')
      const short = normalize(c.short_name || '')
      let score = 0
      if (name && nq.includes(name)) score += 200
      if (short && nq.includes(short)) score += 150
      const words = name.split(/\s+/).filter(w => w.length > 2)
      words.forEach(w => { if (nq.includes(w)) score += w.length })
      return { client: c, score }
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored[0]?.client || null
}

/** Soru cari hesap/cek-senet ile ilgili mi? */
function cariSoruMu(soru) {
  const nq = normalize(soru)
  const anahtarlar = ['cari', 'cek', 'senet', 'tahsilat', 'tahsil', 'bakiye', 'ekstre', 'alacak', 'borcu', 'borc', 'portfoy', 'virman']
  return anahtarlar.some(k => nq.includes(k))
}

/**
 * Admin/personel sorusu musteri/evrak/cari iceriyorsa baglam metni uretir.
 * @param {object} user - auth user
 * @param {string} soru
 * @returns {Promise<string>}
 */
export async function buildAdminAiContext(user, soru) {
  if (!user || !['admin', 'super_admin', 'personel'].includes(user.role)) return ''
  if (!soru || soru.length < 3) return ''

  const tip = vergiTipiCoz(soru)
  const cariModu = cariSoruMu(soru)
  if (!tip && !cariModu) return ''

  let clients = []
  try {
    clients = await getClients()
    if (user.officeId) {
      clients = clients.filter(c => c.office_id === user.officeId || c.office_id == null)
    }
  } catch (e) {
    console.warn('Admin AI baglami musteri listesi alinamadi:', e)
    return ''
  }

  const client = musteriBul(clients, soru)

  const parcalar = []

  // --- Vergi/evrak sorgusu ---
  if (tip) {
    const vergiCtx = vergiBaglami(client, clients, tip, soru)
    if (vergiCtx) parcalar.push(vergiCtx)
  }

  // --- Cari hesap sorgusu ---
  if (cariModu) {
    try {
      const cariMetni = await buildCariAiContext(client ? client.id : null)
      if (cariMetni) {
        const kapsam = client
          ? `Aşağıdaki cari veriler "${client.company || client.name}" müşterisinindir.`
          : 'Aşağıdaki cari veriler erişebildiğin TÜM müşterilerin carilerinin birleşimidir; birden fazla müşterinin kaydı olabilir.'
        parcalar.push(`${kapsam}\n\n${cariMetni}`)
      }
    } catch (e) {
      console.warn('Admin AI cari baglami olusturulamadi:', e)
    }
  }

  return parcalar.join('\n\n')
}

/** Vergi tipi sorgusu icin musteri baglamini uretir. */
function vergiBaglami(client, clients, tip, soru) {
  if (!client) return ''
  const yil = yilCoz(soru)
  const ay = ayCoz(soru)
  const donem = `${getMonthName(ay)} ${yil}`
  const musteriAdi = client.company || client.name || 'Müşteri'

  const docs = client.client_documents || {}

  if (tip.type === 'vergi_levhasi') {
    const vl = docs?.mali_veriler?.vergi_levhasi
    if (vl?.url) {
      return `YÖNETİCİ TALEBİ: ${musteriAdi} müşterisinin vergi levhası:\n- [Vergi Levhası](${vl.url})`
    }
    return `YÖNETİCİ TALEBİ: ${musteriAdi} müşterisinin vergi levhası sistemde yok.`
  }

  const storage = getBeyanStorageKey(tip.type, yil, ay)
  if (!storage) return ''
  const key = storage.statusKey
  const beyanDurumlari = client.beyan_durumlari || {}

  const tahakkuklar = getTahakkukList(beyanDurumlari, key)
  const toplam = tahakkuklar.reduce((s, t) => s + (Number(t.tutar) || 0), 0)
  const durum = beyanDurumlari[key] || 'yapilamadi'

  let sonOdeme = ''
  if (tip.sonOdemeGun) {
    sonOdeme = getFormattedBeyanDeadline(yil, ay, tip.sonOdemeGun)
  } else if (tip.type === 'sgk') {
    sonOdeme = getFormattedBeyanDeadline(yil, ay, new Date(yil, ay + 1, 0).getDate())
  }

  let ctx = `YÖNETİCİ TALEBİ: ${musteriAdi} müşterisinin ${donem} dönemi ${tip.ad} bilgileri:\n`
  ctx += `- Durum: ${durum}\n`
  if (sonOdeme) ctx += `- Son ödeme: ${sonOdeme}\n`

  if (tahakkuklar.length > 0) {
    ctx += `- Tahakkuk toplamı: ${para(toplam)} TL\n`
    tahakkuklar.forEach((t, i) => {
      ctx += `- [${tip.ad} tahakkuku ${i + 1}](${t.url})${t.tutar ? ` (${para(t.tutar)} TL)` : ''}\n`
    })
  } else {
    ctx += `- Tahakkuk henüz yüklenmemiş.\n`
  }

  if (tip.type === 'sgk') {
    const hizmet = getHizmetListesi(beyanDurumlari, key)
    if (hizmet.length > 0) {
      hizmet.forEach((h, i) => {
        ctx += `- [SGK hizmet listesi ${i + 1}](${h.url})\n`
      })
    }
  }

  ctx += `\nYANIT KURALI: Yukarıdaki linkleri ve tutarı kullanarak kısa bir cevap ver. Eksik bilgi varsa "sistemde görünmüyor" de.`
  return ctx
}
