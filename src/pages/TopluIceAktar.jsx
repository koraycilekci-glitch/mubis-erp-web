import { useRef, useState } from 'react'
import {
  FolderOpen, Upload, FileText, CheckCircle, AlertTriangle, X,
  RefreshCw, FolderSearch, Play
} from 'lucide-react'
import { useClients } from '../hooks/useClients'
import { clientDisplayName, sortClients } from '../utils/clientDisplay'
import { uploadBulkBeyanDocuments, uploadClientBulkDocument } from '../services/documentService'
import { supabase } from '../lib/supabase'

// Klasor yapisindan iceri aktarma:
// BEYANNAME / <Musteri> / <Tur> / <Yil> / <Ay> / dosya.pdf

const AY_MAP = {
  'OCAK': 0, 'SUBAT': 1, 'MART': 2, 'NISAN': 3, 'MAYIS': 4, 'HAZIRAN': 5,
  'TEMMUZ': 6, 'AGUSTOS': 7, 'EYLUL': 8, 'EKIM': 9, 'KASIM': 10, 'ARALIK': 11
}

const TUR_MAP = [
  { test: /^KDV\s*2/, beyanType: 'kdv2', label: 'KDV2' },
  { test: /^KDV/, beyanType: 'kdv', label: 'KDV' },
  { test: /MUHTASAR/, beyanType: 'muhtasar', label: 'Muhtasar' },
  { test: /SIGORTA|SGK/, beyanType: 'sgk', label: 'SGK' },
  { test: /GECICI/, beyanType: 'gecici_vergi', label: 'Gecici Vergi' },
  { test: /KURUMLAR/, beyanType: 'kurumlar_vergi', label: 'Kurumlar Vergisi' },
  { test: /GELIR/, beyanType: 'gelir_vergi', label: 'Gelir Vergisi' },
  { test: /VERGI LEVHA/, beyanType: 'vergi_levhasi', label: 'Vergi Levhasi' },
  { test: /EVRAK/, beyanType: 'evrak', label: 'Genel Evrak' }
]

function trUpper(s) {
  return String(s || '')
    .replace(/i̇/g, 'I')
    .replace(/ı/g, 'I').replace(/İ/g, 'I').replace(/i/g, 'I')
    .replace(/ş/g, 'S').replace(/Ş/g, 'S')
    .replace(/ğ/g, 'G').replace(/Ğ/g, 'G')
    .replace(/ü/g, 'U').replace(/Ü/g, 'U')
    .replace(/ö/g, 'O').replace(/Ö/g, 'O')
    .replace(/ç/g, 'C').replace(/Ç/g, 'C')
    .toUpperCase()
}

function normalizeName(s) {
  return trUpper(s)
    .replace(/[.,_\-()]/g, ' ')
    .replace(/\b(LIMITED|LTD|STI|ANONIM|SIRKETI|SANAYI|SAN|TICARET|TIC|VE)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseAy(ayRaw) {
  const u = trUpper(ayRaw).trim()
  if (AY_MAP[u] !== undefined) return AY_MAP[u]
  const num = parseInt(u, 10)
  if (!Number.isNaN(num) && num >= 1 && num <= 12) return num - 1
  return null
}

function parseTur(turRaw) {
  const u = trUpper(turRaw)
  for (const t of TUR_MAP) {
    if (t.test.test(u)) return t
  }
  return null
}

function parseRol(fileName) {
  const u = trUpper(fileName)
  if (u.includes('TAHAKKUK')) return 'tahakkuk'
  if (u.includes('HIZMET')) return 'hizmet_listesi'
  return 'beyanname'
}

const ROL_LABEL = { beyanname: 'Beyanname', tahakkuk: 'Tahakkuk', hizmet_listesi: 'Hizmet Listesi' }

function parsePath(relativePath) {
  const parts = String(relativePath || '').split('/').filter(Boolean)
  if (parts.length < 5) return { hata: 'Klasor yapisi beklenenden kisa (Musteri/Tur/Yil/Ay/dosya)' }
  const fileName = parts[parts.length - 1]
  const ayRaw = parts[parts.length - 2]
  const yilRaw = parts[parts.length - 3]
  const turRaw = parts[parts.length - 4]
  const musteriKlasor = parts[parts.length - 5]

  const yil = parseInt(yilRaw, 10)
  if (Number.isNaN(yil) || yil < 2000 || yil > 2100) return { musteriKlasor, fileName, hata: `Yil okunamadi: "${yilRaw}"` }
  const ay = parseAy(ayRaw)
  if (ay === null) return { musteriKlasor, fileName, yil, hata: `Ay okunamadi: "${ayRaw}"` }
  const tur = parseTur(turRaw)
  if (!tur) return { musteriKlasor, fileName, yil, ay, hata: `Beyan turu taninmadi: "${turRaw}"` }

  return {
    musteriKlasor,
    fileName,
    yil,
    ay,
    beyanType: tur.beyanType,
    turLabel: tur.label,
    rol: parseRol(fileName)
  }
}

export default function TopluIceAktar() {
  const { clients, loading: clientsLoading } = useClients()
  const fileInputRef = useRef(null)

  const [rows, setRows] = useState([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [ilerleme, setIlerleme] = useState({ aktif: 0, toplam: 0 })
  const [ozet, setOzet] = useState(null)

  const musteriEsle = (musteriKlasor) => {
    const hedef = normalizeName(musteriKlasor)
    if (!hedef || hedef.length < 3) return null
    let enIyi = null
    let enIyiSkor = 0
    for (const c of clients) {
      const adaylar = [c.name, c.company, c.shortName, c.kisaAd]
        .map(normalizeName)
        .filter(a => a && a.length >= 3)
      for (const a of adaylar) {
        let skor = 0
        if (a === hedef) skor = 100
        else if (a.includes(hedef) || hedef.includes(a)) skor = Math.min(a.length, hedef.length)
        if (skor > enIyiSkor) {
          enIyiSkor = skor
          enIyi = c
        }
      }
    }
    return enIyiSkor >= 4 ? enIyi : null
  }

  const klasorSec = (e) => {
    const files = Array.from(e.target.files || [])
    const pdfler = files.filter(f => /\.pdf$/i.test(f.name))
    const yeni = pdfler.map((f, i) => {
      const parsed = parsePath(f.webkitRelativePath || f.name)
      const eslesen = parsed.hata ? null : musteriEsle(parsed.musteriKlasor)
      const desteklenmiyor = parsed.beyanType === 'vergi_levhasi' || parsed.beyanType === 'evrak'
      return {
        id: i,
        file: f,
        ...parsed,
        clientId: eslesen?.id || '',
        clientAd: eslesen ? (eslesen.name || eslesen.company) : '',
        dahil: !parsed.hata && !!eslesen && !desteklenmiyor,
        durum: desteklenmiyor && !parsed.hata ? `${parsed.turLabel} icin bu arac kullanilamaz, manuel yukleyin` : '',
        hata: parsed.hata || ''
      }
    })
    setRows(yeni)
    setOzet(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const rowGuncelle = (id, patch) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  const seciliSatirlar = rows.filter(r => r.dahil && r.clientId && !r.hata && r.durum !== 'tamam')

  const yuklemeyiBaslat = async () => {
    if (seciliSatirlar.length === 0) return
    setYukleniyor(true)
    setIlerleme({ aktif: 0, toplam: seciliSatirlar.length })
    let basarili = 0
    let hatali = 0

    for (const row of seciliSatirlar) {
      const client = clients.find(c => c.id === row.clientId)
      rowGuncelle(row.id, { durum: 'yukleniyor' })
      try {
        if (row.rol === 'hizmet_listesi') {
          const uploaded = await uploadClientBulkDocument({
            client,
            year: row.yil,
            month: row.ay,
            beyanType: row.beyanType,
            category: 'hizmet_listesi',
            file: row.file,
            name: row.fileName.replace(/\.pdf$/i, '')
          })
          const baseKey = `${row.yil}_${row.ay}_${row.beyanType}`
          const { data: rowData } = await supabase
            .from('clients')
            .select('beyan_durumlari')
            .eq('id', client.id)
            .single()
          const cur = rowData?.beyan_durumlari || {}
          const list = Array.isArray(cur[`${baseKey}_documents`]) ? cur[`${baseKey}_documents`] : []
          const updated = {
            ...cur,
            [`${baseKey}_documents`]: [...list, uploaded],
            [`${baseKey}_beyan_url`]: uploaded.url
          }
          const { error } = await supabase
            .from('clients')
            .update({ beyan_durumlari: updated })
            .eq('id', client.id)
          if (error) throw error
        } else {
          await uploadBulkBeyanDocuments([{
            client,
            year: row.yil,
            month: row.ay,
            beyanType: row.beyanType,
            documentType: row.rol,
            file: row.file
          }])
        }
        basarili += 1
        rowGuncelle(row.id, { durum: 'tamam' })
      } catch (err) {
        hatali += 1
        rowGuncelle(row.id, { durum: 'hata: ' + (err.message || 'Bilinmeyen hata') })
      }
      setIlerleme(prev => ({ ...prev, aktif: prev.aktif + 1 }))
    }

    setYukleniyor(false)
    setOzet({ basarili, hatali })
  }

  const sifirla = () => {
    setRows([])
    setOzet(null)
    setIlerleme({ aktif: 0, toplam: 0 })
  }

  const eslesmeyenSayisi = rows.filter(r => !r.hata && !r.clientId && !r.durum).length
  const hataliYapi = rows.filter(r => r.hata).length

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <FolderSearch className="w-7 h-7 text-yellow-400" />
          Klasorden Ice Aktar
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Bilgisayarinizdaki BEYANNAME klasorunu secin; dosyalar <span className="text-gray-300">Musteri / Tur / Yil / Ay</span> yapisina gore otomatik eslestirilip ilgili musterinin beyanname ve tahakkuk kayitlarina yuklenir.
        </p>
      </div>

      {/* Adim 1: Klasor secimi */}
      <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <input
            ref={fileInputRef}
            type="file"
            webkitdirectory=""
            directory=""
            multiple
            onChange={klasorSec}
            className="hidden"
            id="klasor-sec"
          />
          <label
            htmlFor="klasor-sec"
            className="cursor-pointer bg-yellow-500 text-blue-950 px-5 py-2.5 rounded-lg font-semibold hover:bg-yellow-400 transition-colors flex items-center gap-2"
          >
            <FolderOpen className="w-5 h-5" />
            Klasor Sec (BEYANNAME)
          </label>
          {rows.length > 0 && (
            <>
              <span className="text-gray-300 text-sm">{rows.length} PDF bulundu</span>
              {eslesmeyenSayisi > 0 && (
                <span className="text-yellow-400 text-sm flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> {eslesmeyenSayisi} musteri eslesmedi
                </span>
              )}
              {hataliYapi > 0 && (
                <span className="text-red-400 text-sm">{hataliYapi} dosyanin yapisi taninmadi</span>
              )}
              <button onClick={sifirla} className="text-gray-400 hover:text-white text-sm flex items-center gap-1">
                <X className="w-4 h-4" /> Temizle
              </button>
            </>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Beklenen yapi: BEYANNAME / ELEKTRO AK / MUHTASAR / 2026 / TEMMUZ / beyanname.pdf —
          Dosya adinda "tahakkuk" gecenler tahakkuk, "hizmet" gecenler hizmet listesi, digerleri beyanname olarak yuklenir.
        </p>
      </div>

      {/* Adim 2: Onizleme tablosu */}
      {rows.length > 0 && (
        <div className="bg-blue-950/40 rounded-2xl border border-blue-800/30 overflow-hidden mb-6">
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-blue-900/50 sticky top-0">
                <tr className="text-left text-gray-300">
                  <th className="px-3 py-3 w-10"></th>
                  <th className="px-3 py-3">Dosya</th>
                  <th className="px-3 py-3">Klasordeki Musteri</th>
                  <th className="px-3 py-3">Eslesen Musteri</th>
                  <th className="px-3 py-3">Tur</th>
                  <th className="px-3 py-3">Donem</th>
                  <th className="px-3 py-3">Rol</th>
                  <th className="px-3 py-3">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-800/30">
                {rows.map(r => (
                  <tr key={r.id} className={`${r.hata ? 'bg-red-500/5' : r.durum === 'tamam' ? 'bg-green-500/5' : ''}`}>
                    <td className="px-3 py-2">
                      {!r.hata && r.durum !== 'tamam' && (
                        <input
                          type="checkbox"
                          checked={r.dahil}
                          disabled={!r.clientId || !!r.durum}
                          onChange={(e) => rowGuncelle(r.id, { dahil: e.target.checked })}
                          className="w-4 h-4 accent-yellow-500"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-300 max-w-[220px]">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <span className="truncate" title={r.fileName}>{r.fileName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-gray-400">{r.musteriKlasor || '-'}</td>
                    <td className="px-3 py-2">
                      {r.hata ? <span className="text-gray-600">-</span> : (
                        <select
                          value={r.clientId}
                          onChange={(e) => {
                            const c = clients.find(x => x.id === e.target.value)
                            rowGuncelle(r.id, {
                              clientId: e.target.value,
                              clientAd: c ? (c.name || c.company) : '',
                              dahil: !!e.target.value && !r.durum
                            })
                          }}
                          className={`bg-blue-900/40 border rounded-lg px-2 py-1.5 text-white text-xs max-w-[200px] ${r.clientId ? 'border-blue-700/50' : 'border-yellow-500/60'}`}
                        >
                          <option value="">-- Musteri secin --</option>
                          {sortClients(clients).map(c => (
                            <option key={c.id} value={c.id}>{clientDisplayName(c)}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-300">{r.turLabel || '-'}</td>
                    <td className="px-3 py-2 text-gray-300">{r.yil ? `${r.yil} / ${(r.ay ?? 0) + 1}. ay` : '-'}</td>
                    <td className="px-3 py-2">
                      {r.rol && (
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          r.rol === 'tahakkuk' ? 'bg-green-500/20 text-green-300'
                          : r.rol === 'hizmet_listesi' ? 'bg-purple-500/20 text-purple-300'
                          : 'bg-blue-500/20 text-blue-300'
                        }`}>
                          {ROL_LABEL[r.rol]}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.hata && <span className="text-red-400">{r.hata}</span>}
                      {r.durum === 'tamam' && <span className="text-green-400 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Yuklendi</span>}
                      {r.durum === 'yukleniyor' && <span className="text-yellow-400 flex items-center gap-1"><RefreshCw className="w-4 h-4 animate-spin" /> Yukleniyor...</span>}
                      {r.durum?.startsWith('hata') && <span className="text-red-400">{r.durum}</span>}
                      {r.durum && !['tamam', 'yukleniyor'].includes(r.durum) && !r.durum.startsWith('hata') && (
                        <span className="text-gray-500">{r.durum}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Adim 3: Yukleme */}
      {rows.length > 0 && (
        <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={yuklemeyiBaslat}
              disabled={yukleniyor || seciliSatirlar.length === 0 || clientsLoading}
              className="bg-green-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-green-500 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {yukleniyor ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
              {yukleniyor ? `Yukleniyor (${ilerleme.aktif}/${ilerleme.toplam})` : `Yuklemeyi Baslat (${seciliSatirlar.length} dosya)`}
            </button>
            {yukleniyor && (
              <div className="flex-1 min-w-[200px] bg-blue-900/40 rounded-full h-2.5">
                <div
                  className="bg-green-500 h-2.5 rounded-full transition-all"
                  style={{ width: `${ilerleme.toplam ? (ilerleme.aktif / ilerleme.toplam) * 100 : 0}%` }}
                />
              </div>
            )}
            {ozet && (
              <span className="text-sm">
                <span className="text-green-400 font-semibold">{ozet.basarili} basarili</span>
                {ozet.hatali > 0 && <span className="text-red-400 font-semibold ml-3">{ozet.hatali} hatali</span>}
              </span>
            )}
          </div>
          {eslesmeyenSayisi > 0 && !ozet && (
            <p className="text-xs text-yellow-400/80 mt-3 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              Eslesmeyen musteriler icin tablodan secim yapin; secim yapilmayan satirlar yuklenmez.
            </p>
          )}
        </div>
      )}

      {rows.length === 0 && (
        <div className="bg-blue-950/40 rounded-2xl p-12 border border-dashed border-blue-800/40 text-center text-gray-500">
          <Upload className="w-12 h-12 mx-auto mb-3 text-gray-600" />
          <p>Baslamak icin bilgisayarinizdaki BEYANNAME klasorunu secin.</p>
          <p className="text-xs mt-2">Tum alt klasorler taranir; yalnizca PDF dosyalari alinir.</p>
        </div>
      )}
    </div>
  )
}
