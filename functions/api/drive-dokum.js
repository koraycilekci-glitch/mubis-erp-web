import { CORS, json, dogrulaKullanici, accessTokenAl, driveHeaders, DRIVE_API } from './_driveCommon.js'
import { driveClientAuthorize, signDriveCapability, verifyDriveCapability } from './_driveAccess.js'

const FOLDER = 'application/vnd.google-apps.folder'
const MAX_FILE = 5 * 1024 * 1024
const MONTHS = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK']
const EXTENSIONS = ['csv', 'cvs', 'xlsm', 'xlsx', 'xls']
const normalize = value => String(value || '').toLocaleUpperCase('tr').replace(/İ/g, 'I').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '')
const escapeQuery = value => String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")

async function driveJson(token, suffix) {
  const response = await fetch(`${DRIVE_API}/files${suffix}`, { headers: driveHeaders(token), signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`Google Drive okuma hatası (${response.status}). Bağlantıyı ve klasör izinlerini kontrol edin.`)
  return response.json()
}

async function children(token, folder, foldersOnly = false) {
  const files = []
  let pageToken = ''
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({ q: `'${escapeQuery(folder)}' in parents and trashed = false` + (foldersOnly ? ` and mimeType = '${FOLDER}'` : ''), fields: 'files(id,name,mimeType,size),nextPageToken', pageSize: '1000' })
    if (pageToken) params.set('pageToken', pageToken)
    const data = await driveJson(token, '?' + params)
    files.push(...(data.files || []))
    pageToken = data.nextPageToken
    if (!pageToken) return files
  }
  throw new Error('Drive klasör listesi çok büyük; otomatik döküm taraması tamamlanamadı.')
}

async function findFolder(token, parent, names) {
  const folders = await children(token, parent, true)
  for (const name of names.filter(Boolean)) {
    const matches = folders.filter(folder => normalize(folder.name) === normalize(name))
    if (matches.length > 1) throw new Error('Birden fazla eşleşen Drive klasörü var; klasör adlarını kontrol edin.')
    if (matches.length === 1) return matches[0].id
  }
  return null
}

async function sourceRoot(auth, client, token) {
  const { data, error } = await auth.admin.from('app_settings').select('value').eq('office_id', client.office_id).eq('key', 'google_drive_edefter_folder_id').maybeSingle()
  if (error) throw new Error('EDEFTER klasör ayarı okunamadı.')
  let root = String(data?.value || '').trim()
  if (!root) {
    if (Number(client.office_id) !== 1) throw new Error('Bu ofis için Google Drive EDEFTER klasörü tanımlanmalı.')
    root = await findFolder(token, 'root', ['EDEFTER'])
  }
  if (!root) throw new Error('Bağlı Google Drive hesabında EDEFTER klasörü bulunamadı.')
  const metadata = await driveJson(token, `/${encodeURIComponent(root)}?fields=id,mimeType,trashed`)
  if (metadata.trashed || metadata.mimeType !== FOLDER) throw new Error('EDEFTER kaynağı geçerli bir Drive klasörü değil.')
  return root
}

async function download(token, capability) {
  const metadata = await driveJson(token, `/${encodeURIComponent(capability.fileId)}?fields=id,name,mimeType,parents,size,trashed`)
  if (metadata.trashed || metadata.name !== capability.name || !metadata.parents?.includes(capability.parentId) || !Number.isFinite(Number(metadata.size)) || Number(metadata.size) > MAX_FILE) return json({ ok: false, error: 'Döküm değişmiş, taşınmış veya boyut sınırını aşmış; sorguyu yeniden başlatın.' }, 409)
  const response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(capability.fileId)}?alt=media`, { headers: driveHeaders(token), signal: AbortSignal.timeout(30000) })
  if (!response.ok || !response.body) return json({ ok: false, error: 'Drive dökümü indirilemedi.' }, 502)
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > MAX_FILE) {
        await reader.cancel()
        return json({ ok: false, error: 'Döküm 5 MB boyut sınırını aşıyor.' }, 413)
      }
      chunks.push(part.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return new Response(bytes, { headers: { ...CORS, 'Content-Type': 'application/octet-stream', 'Content-Length': String(size), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function onRequestPost({ request, env }) {
  try {
    const auth = await dogrulaKullanici(request, env)
    if (!auth.ok) return json({ ok: false, error: auth.hata }, auth.kod)
    const body = await request.json().catch(() => null)
    if (!body || !['list', 'download'].includes(body.action)) return json({ ok: false, error: 'Geçersiz döküm işlemi.' }, 400)
    if (body.clientId == null || String(body.clientId).trim() === '') return json({ ok: false, error: 'Müşteri seçin.' }, 400)
    const access = await driveClientAuthorize(auth, body.clientId)
    if (!access.ok) return json({ ok: false, error: access.hata }, access.kod)
    let capability
    if (body.action === 'download') {
      capability = await verifyDriveCapability(env, body.ticket, 'edefter-read')
      if (!capability || String(capability.clientId) !== String(access.client.id) || capability.userId !== auth.kullanici.id) return json({ ok: false, error: 'Döküm okuma yetkisi geçersiz veya süresi dolmuş.' }, 403)
    } else if (!Number.isInteger(Number(body.yil)) || Number(body.yil) < 2000 || Number(body.yil) > 2100 || !Number.isInteger(Number(body.ay)) || Number(body.ay) < 1 || Number(body.ay) > 12) {
      return json({ ok: false, error: 'Geçerli yıl ve ay seçin.' }, 400)
    }
    const oauth = await accessTokenAl(auth.admin, env)
    if (!oauth.ok) return json({ ok: false, error: oauth.hata || 'Google Drive bağlantısı gerekli.' }, 503)
    if (capability) return await download(oauth.token, capability)
    const root = await sourceRoot(auth, access.client, oauth.token)
    const customer = await findFolder(oauth.token, root, [access.client.short_name, access.client.name, access.client.company])
    const year = customer && await findFolder(oauth.token, customer, [String(Number(body.yil))])
    const month = year && await findFolder(oauth.token, year, [MONTHS[Number(body.ay) - 1], String(Number(body.ay)), String(body.ay).padStart(2, '0')])
    const files = []
    const errors = []
    if (!month) return json({ ok: true, dosyalar: files, hatalar: errors })
    let totalSize = 0
    for (const [direction, type] of [['GIDEN', 'zraporu'], ['GELEN', 'gider']]) {
      const folder = await findFolder(oauth.token, month, [direction])
      if (!folder) continue
      const candidates = (await children(oauth.token, folder)).filter(file => {
        const extension = /\.([^.]+)$/.exec(file.name || '')?.[1]?.toLowerCase()
        return EXTENSIONS.includes(extension) && !file.name.startsWith('~$') && !file.mimeType?.startsWith('application/vnd.google-apps.') && (type !== 'zraporu' || normalize(file.name).startsWith('ZRAPOR'))
      }).sort((first, second) => EXTENSIONS.indexOf(first.name.split('.').pop().toLowerCase()) - EXTENSIONS.indexOf(second.name.split('.').pop().toLowerCase()) || first.name.localeCompare(second.name, 'tr'))
      const seen = new Set()
      for (const file of candidates) {
        const base = normalize(file.name.replace(/\.[^.]+$/, ''))
        if (seen.has(base)) continue
        const size = Number(file.size)
        if (!Number.isFinite(size) || size > MAX_FILE || totalSize + size > 20 * 1024 * 1024 || files.length >= 50) {
          errors.push(`${file.name}: otomatik döküm boyut/adet sınırını aşıyor; Döküm Yükle ile ekleyin.`)
          continue
        }
        totalSize += size
        const ticket = await signDriveCapability(env, { purpose: 'edefter-read', clientId: access.client.id, userId: auth.kullanici.id, fileId: file.id, parentId: folder, name: file.name }, 1800)
        const documentType = type === 'gider' && normalize(file.name).includes('GUMRUK') ? 'gumruk' : type
        files.push({ ad: file.name, tip: documentType, ticket })
        seen.add(base)
      }
    }
    return json({ ok: true, dosyalar: files, hatalar: errors })
  } catch (error) {
    return json({ ok: false, error: error?.message || 'Drive dökümleri okunamadı.' }, 502)
  }
}
