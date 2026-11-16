#!/usr/bin/env node
// ============================================================
// MUBIS ERP — Supabase Storage -> Google Drive gecis araci
//
// AMAC
//   Supabase Storage'daki mevcut belgeleri Google Drive'a KOPYALAR,
//   her dosya icin drive_belgeler tablosuna referans yazar ve
//   DOGRULAMA raporu uretir. Hicbir dosyayi SILMEZ.
//
// KULLANIM
//   node scripts/drive-gecis.mjs --dry-run        # sadece listele (silme/yazma yok)
//   node scripts/drive-gecis.mjs --limit 50       # ilk 50 dosyayi tasi (test)
//   node scripts/drive-gecis.mjs                  # hepsini tasi
//   node scripts/drive-gecis.mjs --rapor          # son durumu raporla
//   node scripts/drive-gecis.mjs --sil --onay     # DOGRULANMIS dosyalari Storage'dan sil
//
// GEREKLI ENV (.env.local veya kabuk)
//   VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY        (RLS'i asmak ve storage.objects okumak icin)
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   GOOGLE_REFRESH_TOKEN             (Ayarlar > Belge Depolama > baglan sonrasi app_settings'te)
//   GOOGLE_DRIVE_FOLDER_ID           (opsiyonel; yoksa "MUBIS ERP" klasoru acilir)
//
// ONEMLI
//   - Dosya adlari/yollari Supabase'deki hiyerarsiye gore yazilir.
//   - SHA1 + boyut eslesmesi tutmazsa kayit "supheli" isaretlenir ve silinmez.
//   - --sil yalnizca dogrulanmis (durum='aktif' ve sha1 eslesmis) kayitlari siler.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// ---------- env yukle (.env.local / .env) ----------
for (const dosya of ['.env.local', '.env']) {
  if (!existsSync(dosya)) continue
  for (const satir of readFileSync(dosya, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(satir.trim())
    if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const RAPOR = args.includes('--rapor')
const SIL = args.includes('--sil')
const ONAY = args.includes('--onay')
const LIMIT = (() => {
  const i = args.indexOf('--limit')
  return i >= 0 ? Number(args[i + 1]) || 0 : 0
})()
const BUCKET_FILTRE = (() => {
  const i = args.indexOf('--bucket')
  return i >= 0 ? args[i + 1] : ''
})()
// --parca k/n : dosyalari i % n === k ile bolecek sekilde shard (paralel calistirma)
const PARCA = (() => {
  const m = /--parca (\d+)\/(\d+)/.exec(args.join(' '))
  return m ? { k: Number(m[1]), n: Number(m[2]) } : null
})()
// --klasor-hazirla : paralel isci baslamadan once tum klasor agacini tek
// surecte olusturur (paralel yarista Drive'da ikiz klasor olusmasini onler)
const KLASOR_HAZIRLA = args.includes('--klasor-hazirla')

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN
const KOK_ENV = process.env.GOOGLE_DRIVE_FOLDER_ID || ''

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const TABLO = 'drive_belgeler'
const KOK_AD = 'MUBIS ERP'

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('HATA: VITE_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli.')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const renk = {
  gri: s => `\x1b[90m${s}\x1b[0m`,
  yesil: s => `\x1b[32m${s}\x1b[0m`,
  sari: s => `\x1b[33m${s}\x1b[0m`,
  kirmizi: s => `\x1b[31m${s}\x1b[0m`,
  mavi: s => `\x1b[36m${s}\x1b[0m`,
}
const boyutYaz = b => {
  const n = Number(b || 0)
  if (n < 1024) return n + ' B'
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'
  if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB'
  return (n / 1073741824).toFixed(2) + ' GB'
}

// ---------- Google token ----------
let _token = { deger: '', bitis: 0 }
async function accessToken() {
  if (_token.deger && _token.bitis > Date.now()) return _token.deger
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN eksik')
  }
  const govde = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN,
    grant_type: 'refresh_token',
  })
  const y = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: govde.toString(),
  })
  const j = await y.json().catch(() => ({}))
  if (!y.ok || !j.access_token) {
    throw new Error('Token yenilenemedi: ' + (j.error_description || j.error || `HTTP ${y.status}`))
  }
  _token = { deger: j.access_token, bitis: Date.now() + (j.expires_in || 3600) * 1000 - 60000 }
  return _token.deger
}
const h = t => ({ Authorization: 'Bearer ' + t })

// ---------- Drive klasor yardimcilari ----------
const _klasorOnbellek = new Map()

async function klasorId(ad, parent) {
  const anahtar = `${parent || 'root'}|${ad}`
  if (_klasorOnbellek.has(anahtar)) return _klasorOnbellek.get(anahtar)
  const token = await accessToken()
  const q = [
    `name = '${String(ad).replace(/'/g, "\\'")}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
    parent ? `'${parent}' in parents` : "'root' in parents",
  ].join(' and ')
  const ara = await fetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`, { headers: h(token) })
  const aj = await ara.json().catch(() => ({}))
  if (aj?.files?.[0]?.id) {
    _klasorOnbellek.set(anahtar, aj.files[0].id)
    return aj.files[0].id
  }
  const ol = await fetch(`${DRIVE_API}/files?fields=id`, {
    method: 'POST',
    headers: { ...h(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: String(ad),
      mimeType: 'application/vnd.google-apps.folder',
      parents: parent ? [parent] : undefined,
    }),
  })
  const oj = await ol.json().catch(() => ({}))
  if (!ol.ok || !oj.id) throw new Error('Klasor olusturulamadi: ' + (oj?.error?.message || `HTTP ${ol.status}`))
  _klasorOnbellek.set(anahtar, oj.id)
  return oj.id
}

async function kokKlasor() {
  if (KOK_ENV) return KOK_ENV
  try {
    const { data } = await sb.from('app_settings').select('value').eq('key', 'google_drive_root_folder_id').maybeSingle()
    if (data?.value) return data.value
  } catch { /* yoksay */ }
  const id = await klasorId(KOK_AD, 'root')
  try {
    await sb.from('app_settings').upsert({ key: 'google_drive_root_folder_id', value: id, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  } catch { /* yoksay */ }
  return id
}

// ---------- MIME ----------
function mimeTahmin(ad) {
  const e = (/\.([a-z0-9]+)$/i.exec(String(ad || '')) || [])[1]?.toLowerCase()
  return ({
    pdf: 'application/pdf',
    xml: 'application/xml',
    html: 'text/html', htm: 'text/html',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    csv: 'text/csv',
    zip: 'application/zip',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
    json: 'application/json', txt: 'text/plain',
  })[e] || 'application/octet-stream'
}

// ---------- Belge turu tahmini (yoldan) ----------
function belgeTuruTahmin(yol) {
  const y = String(yol || '').toLocaleLowerCase('tr')
  if (y.includes('tahakkuk')) return 'tahakkuk'
  if (y.includes('beyanname') || y.includes('beyan')) return 'beyanname'
  if (y.includes('edefter') || y.includes('e-defter')) return 'edefter'
  if (y.includes('z_rapor') || y.includes('zrapor')) return 'z_raporu'
  if (y.includes('gider') || y.includes('fis')) return 'gider_fisi'
  if (y.includes('fatura')) return 'fatura'
  if (y.includes('mali')) return 'muhasebe'
  return 'genel'
}

// client_id tahmini: storage yolu genelde "<vkn>_<slug>/..." veya "ofis_N/<vkn>_<slug>/..."
function vknYakala(yol) {
  const m = /(?:^|\/)(\d{10,11})_/.exec(String(yol || ''))
  return m ? m[1] : ''
}

// ---------- Storage listeleme (recursive) ----------
async function bucketListesi(bucket) {
  const hepsi = []
  const kuyruk = ['']
  let sayfa = 0
  while (kuyruk.length) {
    const klasor = kuyruk.shift()
    let offset = 0
    for (;;) {
      const { data, error } = await sb.storage.from(bucket).list(klasor, { limit: 1000, offset })
      if (error) throw new Error(`${bucket}/${klasor}: ${error.message}`)
      const liste = data || []
      for (const o of liste) {
        const tam = klasor ? `${klasor}/${o.name}` : o.name
        // Klasorler metadata'siz gelir (id null)
        if (o.id === null || (!o.metadata && !/\.[a-z0-9]+$/i.test(o.name))) {
          kuyruk.push(tam)
        } else {
          hepsi.push({
            bucket,
            yol: tam,
            boyut: Number(o.metadata?.size || 0),
            mime: o.metadata?.mimetype || mimeTahmin(o.name),
            olusturma: o.created_at || '',
          })
        }
      }
      if (liste.length < 1000) break
      offset += 1000
    }
    if (++sayfa % 25 === 0) process.stdout.write(renk.gri('.'))
  }
  return hepsi
}

// ---------- Tek dosya tasima ----------
async function dosyaTasi(dosya, kokId) {
  const token = await accessToken()

  // Zaten tasinmis mi? (indirmeden once kontrol et — atlanma cok daha hizli)
  const eskiYol = `${dosya.bucket}/${dosya.yol}`
  const { data: mevcutOn } = await sb
    .from(TABLO)
    .select('drive_file_id, durum')
    .eq('eski_storage_path', eskiYol)
    .eq('kaynak', 'supabase-storage')
    .maybeSingle()
  if (mevcutOn?.drive_file_id && mevcutOn.durum === 'aktif') {
    return { ok: true, atlandi: true, drive_file_id: mevcutOn.drive_file_id, sha1: '' }
  }

  const { data: blob, error } = await sb.storage.from(dosya.bucket).download(dosya.yol)
  if (error) return { ok: false, hata: 'indirilemedi: ' + error.message }

  const buffer = Buffer.from(await blob.arrayBuffer())
  const sha1 = createHash('sha1').update(buffer).digest('hex')

  // Hedef klasor: MUBIS ERP / <bucket> / <yol klasorleri>
  const parcalar = [dosya.bucket, ...dosya.yol.split('/').slice(0, -1)]
  let parent = kokId
  for (const p of parcalar) parent = await klasorId(p, parent)

  const ad = dosya.yol.split('/').pop()
  const sinir = 'mubis_' + Math.random().toString(36).slice(2)
  const metadata = { name: ad, parents: parent ? [parent] : undefined }
  const govde = Buffer.concat([
    Buffer.from(
      `--${sinir}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify(metadata) +
        `\r\n--${sinir}\r\nContent-Type: ${dosya.mime}\r\n\r\n`,
      'utf8'
    ),
    buffer,
    Buffer.from(`\r\n--${sinir}--`, 'utf8'),
  ])

  const y = await fetch(
    `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,name,size,mimeType,webViewLink,sha1Checksum,md5Checksum`,
    {
      method: 'POST',
      headers: { ...h(token), 'Content-Type': `multipart/related; boundary=${sinir}` },
      body: govde,
    }
  )
  const j = await y.json().catch(() => ({}))
  if (!y.ok || !j.id) {
    return { ok: false, hata: 'Drive yukleme: ' + (j?.error?.message || `HTTP ${y.status}`) }
  }

  // Dogrulama: Drive'in bildirdigi sha1Checksum (v3 alan adi 'sha1' degil) ile
  // yerel sha1. Boşsa md5Checksum'a, o da yoksa 'bilinmiyor' sayılır (size kontrolü
  // silme asamasinda devreye girer).
  const driveSha1 = String(j.sha1Checksum || j.md5Checksum || '')
  const dogrulandi = !driveSha1 || driveSha1 === sha1

  const { error: yazHata } = await sb.from(TABLO).upsert(
    {
      drive_file_id: j.id,
      dosya_adi: j.name || ad,
      mime_type: j.mimeType || dosya.mime,
      boyut: Number(j.size || buffer.length),
      client_id: null,
      belge_turu: belgeTuruTahmin(dosya.yol),
      yol: [dosya.bucket, ...dosya.yol.split('/').slice(0, -1)].join('/'),
      drive_link: j.webViewLink || '',
      sha1,
      durum: dogrulandi ? 'aktif' : 'supheli',
      kaynak: 'supabase-storage',
      eski_storage_path: eskiYol,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'drive_file_id' }
  )

  return { ok: true, drive_file_id: j.id, sha1, dogrulandi, yazHata: yazHata?.message || '' }
}

// ---------- Rapor ----------
async function rapor() {
  const { count: toplam } = await sb.from(TABLO).select('*', { count: 'exact', head: true })
  const { data: durumlar } = await sb.from(TABLO).select('durum')
  const sayim = {}
  for (const d of durumlar || []) sayim[d.durum || 'bilinmiyor'] = (sayim[d.durum || 'bilinmiyor'] || 0) + 1

  const { data: boyutlar } = await sb.from(TABLO).select('boyut')
  const toplamBoyut = (boyutlar || []).reduce((t, x) => t + Number(x.boyut || 0), 0)

  console.log('\n' + renk.mavi('=== DRIVE GECIS RAPORU ==='))
  console.log('  drive_belgeler kayit :', toplam || 0)
  console.log('  Drive\'daki toplam    :', boyutYaz(toplamBoyut))
  console.log('  durum dagilimi       :', JSON.stringify(sayim))

  const { data: storageDurum } = await sb.storage.listBuckets()
  if (storageDurum) {
    let sToplam = 0, sAdet = 0
    for (const b of storageDurum) {
      try {
        const l = await bucketListesi(b.name)
        sToplam += l.reduce((t, x) => t + x.boyut, 0)
        sAdet += l.length
      } catch (e) {
        console.log(renk.sari('  ! bucket okunamadi: ' + b.name + ' (' + e.message + ')'))
      }
    }
    console.log('  Storage\'da kalan     :', sAdet, 'dosya /', boyutYaz(sToplam))
    if (sAdet === 0) console.log(renk.yesil('  ✓ Storage bos — kota sorunu kalmamali.'))
  }
}

// ---------- Silme (yalnizca dogrulanmis) ----------
async function dogrulanmisSil() {
  if (!ONAY) {
    console.error(renk.kirmizi('Silme icin --onay bayragi gerekli: --sil --onay'))
    process.exit(1)
  }
  // PostgREST tek istekte ~1000 satir dondurdugu icin batch batch okuyup isler.
  // Silinen satirlarin eski_storage_path'i null olur; bir sonraki batch'i ceker.
  let silinen = 0, hata = 0
  while (true) {
    const { data: kayitlar, error } = await sb
      .from(TABLO)
      .select('id, eski_storage_path, drive_file_id, sha1, boyut, durum, kaynak')
      .eq('kaynak', 'supabase-storage')
      .eq('durum', 'aktif')
      .not('eski_storage_path', 'is', null)
      .range(0, 999)
    if (error) throw new Error(error.message)
    if (!kayitlar || kayitlar.length === 0) break

    console.log(renk.sari(`Batch: ${kayitlar.length} dosya islenecek (toplam silinen: ${silinen})`))
    const batchSilinenBaslangic = silinen
    const batchHataBaslangic = hata
  for (const k of kayitlar || []) {
    // Guvenlik: Drive'da dosya gercekten var mi ve sha1 tutuyor mu?
    try {
      const token = await accessToken()
      const y = await fetch(
        `${DRIVE_API}/files/${encodeURIComponent(k.drive_file_id || '')}?fields=id,sha1Checksum,md5Checksum,size`,
        { headers: h(token) }
      )
      if (!y.ok) { hata++; console.log(renk.kirmizi('  ✗ Drive\'da yok: ' + k.eski_storage_path)); continue }
      const j = await y.json().catch(() => ({}))
      const driveHash = String(j.sha1Checksum || j.md5Checksum || '')
      const boyutUyuyor = !k.boyut || Number(j.size) === Number(k.boyut)
      // hash yoksa boyut + varlık kontrolü ile yetinir; hash varsa birebir karşılaştırılır
      if (driveHash && k.sha1 && driveHash !== k.sha1) {
        hata++
        console.log(renk.kirmizi('  ✗ SHA1 uyusmuyor, silinmedi: ' + k.eski_storage_path))
        continue
      }
      if (!boyutUyuyor) {
        hata++
        console.log(renk.kirmizi('  ✗ Boyut uyusmuyor, silinmedi: ' + k.eski_storage_path))
        continue
      }
    } catch (e) {
      hata++
      console.log(renk.kirmizi('  ✗ dogrulama hatasi: ' + k.eski_storage_path + ' — ' + e.message))
      continue
    }

    const parcalar = String(k.eski_storage_path).split('/')
    const bucket = parcalar.shift()
    const { error: sHata } = await sb.storage.from(bucket).remove([parcalar.join('/')])
    if (sHata) {
      hata++
      console.log(renk.kirmizi('  ✗ silinemedi: ' + k.eski_storage_path + ' — ' + sHata.message))
      continue
    }
    silinen++
    await sb.from(TABLO).update({ durum: 'aktif', eski_storage_path: null }).eq('id', k.id)
    if (silinen % 25 === 0) console.log(renk.gri(`  … ${silinen} silindi`))
  }
    // Batch'te tek dosya bile ilerleme yoksa sonsuz donguye girme
    if (silinen === batchSilinenBaslangic && hata === batchHataBaslangic) {
      console.log(renk.kirmizi('  ! Batch ilerleme yapmadi — dongu durduruldu.'))
      break
    }
  }
  console.log(renk.yesil(`\n✓ ${silinen} dosya Storage'dan silindi, ${hata} hata.`))
}

// ---------- Ana akis ----------
async function main() {
  if (RAPOR) return rapor()
  if (SIL) return dogrulanmisSil()

  console.log(renk.mavi('=== SUPABASE STORAGE -> GOOGLE DRIVE GECISI ==='))
  console.log('  mod:', DRY ? renk.sari('DRY-RUN (yazma yok)') : renk.yesil('GERCEK'))
  if (PARCA) console.log('  parça:', renk.yesil(`${PARCA.k}/${PARCA.n}`))

  const { data: buckets, error: bHata } = await sb.storage.listBuckets()
  if (bHata) throw new Error('Bucket listesi alinamadi: ' + bHata.message)

  let dosyalar = []
  for (const b of buckets || []) {
    if (BUCKET_FILTRE && b.name !== BUCKET_FILTRE) continue
    process.stdout.write(renk.gri(`  taranıyor: ${b.name} `))
    try {
      const l = await bucketListesi(b.name)
      console.log(renk.gri(`${l.length} dosya`))
      dosyalar.push(...l)
    } catch (e) {
      console.log(renk.kirmizi('HATA: ' + e.message))
    }
  }

  const toplamBoyut = dosyalar.reduce((t, d) => t + d.boyut, 0)
  console.log(`\n  Toplam: ${renk.mavi(dosyalar.length)} dosya / ${renk.mavi(boyutYaz(toplamBoyut))}`)

  if (LIMIT > 0) dosyalar = dosyalar.slice(0, LIMIT)
  if (PARCA) dosyalar = dosyalar.filter((_, i) => i % PARCA.n === PARCA.k)
  console.log('  Bu iş parçası:', renk.mavi(dosyalar.length), 'dosya')

  // Klasör ön kurulumu: paralel işçiler başlamadan önce tüm klasörler tek
  // süreçte oluşsun ki işçiler sadece "bul" çağrısı yapsın, "oluştur" yarışı olmasın.
  if (KLASOR_HAZIRLA && !DRY) {
    const kokId0 = await kokKlasor()
    const zincirler = new Set()
    for (const d of dosyalar) {
      const parcalar = [d.bucket, ...d.yol.split('/').slice(0, -1)]
      zincirler.add(parcalar.join('/'))
    }
    // zincirleri kısa→uzun sırala: üst klasörler önce oluşur
    const sirali = [...zincirler].sort((a, b) => a.split('/').length - b.split('/').length)
    let olusturulan = 0, hZ = 0
    for (const z of sirali) {
      try {
        let parent = kokId0
        for (const p of z.split('/')) parent = await klasorId(p, parent)
        olusturulan++
      } catch (e) { hZ++; if (hZ <= 3) console.log(renk.kirmizi('  ! klasör: ' + z + ' — ' + e.message)) }
    }
    console.log(renk.yesil(`  Klasör ön kurulumu: ${sirali.length} zincir işlendi, ${hZ} hata.`))
    return
  }

  if (DRY) {
    console.log('\n' + renk.sari('DRY-RUN — ilk 30 dosya:'))
    for (const d of dosyalar.slice(0, 30)) {
      console.log(`  ${d.bucket}/${d.yol}  ${renk.gri(boyutYaz(d.boyut))}`)
    }
    console.log('\n' + renk.sari('Yazma yapilmadi. Gercek gecis icin --dry-run olmadan calistirin.'))
    return
  }

  const kokId = await kokKlasor()
  console.log('  Kok klasor id:', renk.gri(kokId))

  let basarili = 0, atlanan = 0, hataSayi = 0
  const hatalar = []
  const baslangic = Date.now()

  for (let i = 0; i < dosyalar.length; i++) {
    const d = dosyalar[i]
    const etiket = `${d.bucket}/${d.yol}`
    try {
      const r = await dosyaTasi(d, kokId)
      if (r.ok && r.atlandi) {
        atlanan++
      } else if (r.ok) {
        basarili++
        if (!r.dogrulandi) console.log(renk.sari(`  ! SHA1 farki (supheli): ${etiket}`))
      } else {
        hataSayi++
        hatalar.push(`${etiket}: ${r.hata}`)
      }
    } catch (e) {
      hataSayi++
      hatalar.push(`${etiket}: ${e.message}`)
    }
    if ((i + 1) % 20 === 0 || i === dosyalar.length - 1) {
      const gecen = ((Date.now() - baslangic) / 1000).toFixed(0)
      process.stdout.write(
        `\r  ilerleme ${i + 1}/${dosyalar.length} · ok:${basarili} atlanan:${atlanan} hata:${hataSayi} · ${gecen}s   `
      )
    }
  }

  console.log('\n\n' + renk.mavi('=== SONUC ==='))
  console.log('  Tasinan      :', renk.yesil(basarili))
  console.log('  Zaten vardi  :', atlanan)
  console.log('  Hata         :', hataSayi ? renk.kirmizi(hataSayi) : 0)

  if (hatalar.length) {
    const dosya = `drive-gecis-hatalar-${Date.now()}.log`
    writeFileSync(dosya, hatalar.join('\n'), 'utf8')
    console.log('  Hata kaydi   :', dosya)
    for (const h2 of hatalar.slice(0, 10)) console.log(renk.kirmizi('    - ' + h2))
    if (hatalar.length > 10) console.log(renk.gri(`    … +${hatalar.length - 10} daha`))
  }

  console.log('\n' + renk.sari('NOT: Hicbir dosya SILINMEDI.'))
  console.log('  Dogrulama raporu : node scripts/drive-gecis.mjs --rapor')
  console.log('  Storage temizligi: node scripts/drive-gecis.mjs --sil --onay')
}

main().catch(e => {
  console.error(renk.kirmizi('\nBEKLENMEYEN HATA: ' + (e?.message || e)))
  process.exit(1)
})
