// Admin "Z Raporu Yükle" / "Gider Fişi Yükle" — Yükleme klasörü altında.
// Müşteri seçilir; telefondan gelen taramalar yukarıda işlenir,
// bilgisayardan yükleme bileşenleri (portal ile ayni) altta acilir.
import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Smartphone, Trash2, Receipt, ScanLine, ExternalLink } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useClients } from '../hooks/useClients'
import { clientDisplayName, sortClients } from '../utils/clientDisplay'
import ZReportManager from '../components/ZReportManager'
import ExpenseUploader from '../components/ExpenseUploader'
import { taramaListesi, taramaIsle, taramaSil, taramaFotoUrl } from '../services/taramaService'

export default function AdminOcrYukle({ tip = 'zrapor' }) {
  const { clients, loading } = useClients()
  const [seciliId, setSeciliId] = useState('')
  const secili = (clients || []).find(c => String(c.id) === String(seciliId))
  const [taramalar, setTaramalar] = useState(null)
  const [islemdeId, setIslemdeId] = useState(null)
  const [mesaj, setMesaj] = useState('')
  const [mesajHata, setMesajHata] = useState(false)
  const [yenile, setYenile] = useState(0)

  const zRaporMu = tip === 'zrapor'
  const baslik = zRaporMu ? 'Z Raporu Yükle' : 'Gider Fişi Yükle'
  const telefonLinki = `${window.location.origin}/giris?tarama=${zRaporMu ? 'z' : 'gider'}`
  const telefonLinkiUygun = window.location.protocol === 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
  const aciklama = zRaporMu
    ? 'Müşteri seçin — telefondan gelen Z raporlarını işleyin veya bilgisayardan kamera/resim/PDF/Excel ile yükleyin (OCR ile okunup muhasebe fişlerine işlenir)'
    : 'Müşteri seçin — telefondan gelen fişleri işleyin veya bilgisayardan kamera/resim/PDF/Excel ile yükleyin (OCR ile okunup gider kayıtlarına işlenir)'

  const taramalarGetir = async () => {
    if (!secili) { setTaramalar(null); return }
    setTaramalar(null)
    try {
      const liste = await taramaListesi({})
      setTaramalar(liste.filter(t =>
        String(t.client_id) === String(secili.id) && t.belge_tipi === (zRaporMu ? 'z' : 'fis')
      ))
    } catch { setTaramalar([]) }
  }

  useEffect(() => { taramalarGetir() }, [secili?.id, zRaporMu, yenile])

  const isle = async (t) => {
    setIslemdeId(t.id)
    setMesaj('')
    try {
      const sonuc = await taramaIsle(t)
      if (sonuc.hedef === 'z_reports') {
        setMesaj(`Z raporu olarak işlendi (#${sonuc.kayitId}) — aşağıdaki listede görünüyor.`)
      } else {
        const a = sonuc.ayrim
        const detay = a && a.giderHesabi
          ? ` Hesaplar: ${a.giderHesabi}${a.kdvHesabi ? ' + ' + a.kdvHesabi : ''} / ${a.cariHesabi}${a.cariYeni ? ' (yeni cari açıldı)' : ''}`
          : ''
        setMesaj(`Gider fişi kaydı oluşturuldu (#${sonuc.kayitId}).${detay}`)
      }
      setMesajHata(false)
      setYenile(x => x + 1)
    } catch (e) {
      setMesaj('İşlenemedi: ' + (e?.message || 'bilinmeyen hata'))
      setMesajHata(true)
    } finally {
      setIslemdeId(null)
    }
  }

  const silTarama = async (t) => {
    if (!window.confirm('Bu tarama silinsin mi?')) return
    try {
      await taramaSil(t.id, t.storage_path)
      setYenile(x => x + 1)
    } catch (e) {
      setMesaj('Silinemedi: ' + (e?.message || 'bilinmeyen hata'))
      setMesajHata(true)
    }
  }

  const fotoAc = async (t) => {
    const u = await taramaFotoUrl(t.storage_path)
    if (u) window.open(u, '_blank')
  }

  const onOzet = (t) => {
    const o = t.on_okuma || {}
    if (t.belge_tipi === 'z') {
      const parcalar = []
      if (o.zNo) parcalar.push(`Z No ${o.zNo}`)
      if (o.brutSatis != null) parcalar.push(`Brüt ${Number(o.brutSatis).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`)
      if (o.tutar != null && o.brutSatis == null) parcalar.push(`${Number(o.tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`)
      return parcalar.join(' · ') || 'Ön-okuma yok'
    }
    const parcalar = []
    if (o.tutar != null) parcalar.push(`${Number(o.tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`)
    if (o.vkn) parcalar.push(`VKN ${o.vkn}`)
    if (o.tarih) parcalar.push(o.tarih)
    return parcalar.join(' · ') || 'Ön-okuma yok'
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">{baslik}</h1>
        <p className="text-gray-400 mt-1">{aciklama}</p>
      </div>

      <div className="bg-blue-800/20 rounded-xl p-4 border border-cyan-700/40 mb-6 flex flex-col sm:flex-row gap-4 items-start">
        {telefonLinkiUygun && <div className="bg-white p-2 rounded-lg shrink-0"><QRCodeSVG value={telefonLinki} size={160} marginSize={4} title="Telefonla tarama bağlantısı" /></div>}
        <div className="text-sm text-gray-300">
          <h2 className="text-white font-semibold flex items-center gap-2 mb-2"><Smartphone className="w-4 h-4 text-cyan-300" /> Telefonla fotoğraf çek</h2>
          {telefonLinkiUygun ? <>
            <p>Telefonunuzun kamerasıyla QR kodu okutun ve bağlantıyı açın. Yönetici veya personel hesabınızla giriş yapın.</p>
            <p className="mt-2">Telefonda müşteriyi seçin, kamera veya seri çekimle belgeleri ekleyin; okunan bilgileri kontrol edip kaydedin. Kayıtlar bilgisayarda sayfa yenilendiğinde görünür.</p>
            <p className="mt-2 text-gray-400">QR kod şifre veya oturum bilgisi içermez. Bu bağlantı müşteriye özel değildir; telefonda müşteriyi yeniden seçin.</p>
          </> : <p>QR kod için MUBİS'i telefondan erişilebilen HTTPS adresinden açın.</p>}
        </div>
      </div>

      <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 mb-6">
        <label className="text-gray-400 text-xs block mb-1">Müşteri</label>
        {loading ? (
          <div className="flex items-center text-gray-400 text-sm py-2">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Müşteriler yükleniyor...
          </div>
        ) : (
          <select
            value={seciliId}
            onChange={(e) => setSeciliId(e.target.value)}
            className="w-full md:w-96 bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400 transition-colors"
          >
            <option value="">Müşteri seçin</option>
            {sortClients(clients).map(c => (
              <option key={c.id} value={c.id}>{clientDisplayName(c)}</option>
            ))}
          </select>
        )}
      </div>

      {secili && (
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-white font-semibold">
              <Smartphone className="w-4 h-4 text-cyan-300" />
              Telefondan Gelen Taramalar
              {taramalar && (
                <span className="text-xs font-normal text-gray-400">
                  ({taramalar.filter(t => t.durum === 'yeni').length} bekliyor)
                </span>
              )}
            </div>
            <button onClick={() => setYenile(x => x + 1)}
              className="flex items-center gap-1.5 bg-blue-900/40 hover:bg-blue-800 text-blue-200 rounded-lg px-3 py-1.5 text-xs font-medium transition">
              <RefreshCw className="w-3.5 h-3.5" /> Yenile
            </button>
          </div>

          {mesaj && (
            <div className={`mb-3 text-sm rounded-lg px-4 py-2 border ${mesajHata
              ? 'bg-red-500/10 border-red-500/30 text-red-300'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'}`}>
              {mesaj}
            </div>
          )}

          {taramalar === null ? (
            <div className="flex items-center text-gray-400 text-sm py-3">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Taramalar yükleniyor...
            </div>
          ) : taramalar.length === 0 ? (
            <div className="text-gray-400 text-sm py-3">
              Bu müşteri için telefondan gelen {zRaporMu ? 'Z raporu' : 'fiş'} taraması yok. Bilgisayardan yükleme için aşağıdaki bölümü kullanın.
            </div>
          ) : (
            <div className="space-y-2">
              {taramalar.map(t => (
                <div key={t.id} className="flex items-center gap-3 bg-blue-900/30 border border-blue-800/40 rounded-lg p-2.5">
                  <button onClick={() => fotoAc(t)} title="Fotoğrafı aç"
                    className="w-10 h-10 rounded-lg bg-blue-900/60 border border-blue-700/40 flex items-center justify-center shrink-0 hover:bg-blue-800 transition">
                    {t.belge_tipi === 'z' ? <ScanLine className="w-4 h-4 text-cyan-300" /> : <Receipt className="w-4 h-4 text-amber-300" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-medium">
                      {t.belge_tipi === 'z' ? 'Z Raporu' : 'Fiş'} · {t.donem_yil}/{String(t.donem_ay).padStart(2, '0')}
                    </div>
                    <div className="text-gray-400 text-xs truncate">{onOzet(t)}</div>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${t.durum === 'islendi' ? 'text-emerald-400 bg-emerald-500/10' : 'text-amber-400 bg-amber-500/10'}`}>
                    {t.durum === 'islendi' ? 'İşlendi' : 'Yeni'}
                  </span>
                  {t.durum !== 'islendi' && (
                    <button onClick={() => isle(t)} disabled={islemdeId === t.id}
                      className="flex items-center gap-1.5 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-blue-950 rounded-lg px-3 py-1.5 text-xs font-bold transition shrink-0">
                      {islemdeId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      İşle
                    </button>
                  )}
                  <button onClick={() => fotoAc(t)} title="Fotoğrafı aç"
                    className="p-1.5 rounded-md text-blue-300 hover:bg-blue-800/60 shrink-0">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => silTarama(t)} title="Sil"
                    className="p-1.5 rounded-md text-red-400 hover:bg-red-900/40 shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {secili ? (
        zRaporMu ? (
          <ZReportManager
            key={`zr-${yenile}`}
            clientId={secili.id}
            clientName={secili.shortName || secili.name || secili.company || ''}
            clientType={secili.client_type}
          />
        ) : (
          <ExpenseUploader
            key={`eu-${yenile}`}
            clientId={secili.id}
            clientName={secili.shortName || secili.name || secili.company || ''}
          />
        )
      ) : (
        <div className="text-center py-12 text-gray-400">
          Yukarıdan müşteri seçin
        </div>
      )}
    </div>
  )
}
