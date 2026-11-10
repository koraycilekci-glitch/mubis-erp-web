// MUBiS - Z Raporu / Mali Hafiza Karti
// Gunluk Z raporu veya aylik Mali Hafiza PDF'i yuklenir -> metni okunur ->
// hesaplara ayrilir -> onizleme -> kaydet (z_raporlar tablosu).
import { useState, useRef } from 'react'
import { Printer, Loader2, Trash2, Save, FileText } from 'lucide-react'
import { zRaporPdfOku, zRaporMetindenAyrisat, zRaporKaydet, zRaporlariGetir, zRaporSil } from '../services/zRaporService'

const fmt = (n) => (n === null || n === undefined || n === '') ? '-' : Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2 })

export default function ZRaporKarti({ client, id }) {
  const [okunuyor, setOkunuyor] = useState(false)
  const [mesaj, setMesaj] = useState('')
  const [rapor, setRapor] = useState(null)
  const [kayitliRaporlar, setKayitliRaporlar] = useState([])
  const inputRef = useRef(null)

  const yukle = async (e) => {
    const dosya = e.target.files?.[0]
    if (!dosya) return
    if (!/\.pdf$/i.test(dosya.name)) { alert('PDF yukleyin.'); return }
    setOkunuyor(true); setMesaj('PDF okunuyor...'); setRapor(null)
    try {
      const metin = await zRaporPdfOku(dosya)
      const ayrisat = zRaporMetindenAyrisat(metin)
      if (!ayrisat.hesapSatirlari.length) {
        throw new Error('PDF icinde taninabilir Z raporu toplamlari bulunamadi. Yazici markanizin Z rapor ciktisini yukleyin (OPOS, Akut, Ingentic...).')
      }
      setRapor(ayrisat)
      setMesaj(`${ayrisat.raporTipi === 'mali_hafiza' ? 'Aylık Mali Hafıza' : 'Günlük Z'} raporu okundu: ${ayrisat.hesapSatirlari.length} hesap satiri uretildi. Kontrol edip kaydedin.`)
    } catch (err) {
      setMesaj('Okuma hatasi: ' + (err.message || err))
    } finally {
      setOkunuyor(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const kaydet = async () => {
    if (!rapor) return
    try {
      await zRaporKaydet(parseInt(id), {
        rapor_tipi: rapor.raporTipi,
        tarih: rapor.tarih || new Date().toISOString().split('T')[0],
        z_no: rapor.zNo || null,
        kasa_no: rapor.kasaNo || null,
        brut_satis: rapor.brutSatis,
        net_satis: rapor.netSatis,
        toplam_kdv: rapor.toplamKdv,
        odemeler: rapor.odemeler,
        kdv_satirlari: rapor.kdvSatirlari,
        gunler: rapor.gunler,
        hesap_satirlari: rapor.hesapSatirlari,
        pdf_adi: rapor.pdfAdi || ''
      })
      setRapor(null); setMesaj('Z raporu kaydedildi.')
      setKayitliRaporlar(await zRaporlariGetir(parseInt(id)))
    } catch (err) {
      setMesaj('Kaydetme hatasi: ' + (err.message || err))
    }
  }

  const listeYukle = async () => { setKayitliRaporlar(await zRaporlariGetir(parseInt(id))) }
  const sil = async (rid) => {
    if (!confirm('Bu rapor kaydi silinsin mi?')) return
    try { await zRaporSil(rid); setKayitliRaporlar(await zRaporlariGetir(parseInt(id))) } catch (err) { alert(err.message) }
  }

  return (
    <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold flex items-center gap-2"><Printer className="w-5 h-5 text-yellow-400" /> Z Raporu / Mali Hafıza Okuyucu</h3>
        <div className="flex gap-2">
          <button onClick={listeYukle} className="text-xs text-gray-300 bg-blue-900/40 px-3 py-1.5 rounded-lg hover:bg-blue-800/50">Kayıtlı Raporlar</button>
          <button onClick={() => inputRef.current?.click()} disabled={okunuyor} className="text-xs bg-yellow-500 text-blue-950 font-bold px-3 py-1.5 rounded-lg hover:bg-yellow-400 flex items-center gap-1 disabled:opacity-50">
            {okunuyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {okunuyor ? 'Okunuyor...' : 'PDF Yükle'}
          </button>
        </div>
      </div>
      <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={yukle} />
      <p className="text-xs text-gray-400 mb-3">Günlük Z raporunu veya aylık Mali Hafıza raporunu yükleyin — sistem kalemleri hesap planına ayırır: 600.01 Satış, 391.xx KDV, 100.01 Kasa (nakit), 102.01 Banka (kredi kartı), 213.02 Yemek kartı.</p>

      {mesaj && <div className="bg-blue-900/30 border border-blue-700/30 rounded-lg p-2 mb-3 text-xs text-gray-300">{mesaj}</div>}

      {rapor && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <div className="bg-blue-900/30 rounded-lg p-2"><span className="text-gray-400">Tip</span><div className="text-white font-semibold">{rapor.raporTipi === 'mali_hafiza' ? 'Mali Hafıza (Aylık)' : 'Z Raporu (Günlük)'}</div></div>
            <div className="bg-blue-900/30 rounded-lg p-2"><span className="text-gray-400">Tarih</span><div className="text-white font-semibold">{rapor.tarih || '-'}</div></div>
            <div className="bg-blue-900/30 rounded-lg p-2"><span className="text-gray-400">Z No</span><div className="text-white font-semibold">{rapor.zNo || '-'}</div></div>
            <div className="bg-blue-900/30 rounded-lg p-2"><span className="text-gray-400">Net Satış</span><div className="text-green-400 font-semibold">{fmt(rapor.netSatis)}</div></div>
            <div className="bg-blue-900/30 rounded-lg p-2"><span className="text-gray-400">Toplam KDV</span><div className="text-yellow-400 font-semibold">{fmt(rapor.toplamKdv)}</div></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-gray-400 border-b border-blue-700/30"><th className="text-left py-1.5 px-2">Hesap Kodu</th><th className="text-left py-1.5 px-2">Hesap Adı</th><th className="text-right py-1.5 px-2">Borç</th><th className="text-right py-1.5 px-2">Alacak</th></tr></thead>
              <tbody>
                {rapor.hesapSatirlari.map((s, i) => (
                  <tr key={i} className="border-b border-blue-800/20 text-white">
                    <td className="py-1.5 px-2 font-mono text-yellow-400">{s.kod}</td>
                    <td className="py-1.5 px-2">{s.ad}</td>
                    <td className="py-1.5 px-2 text-right">{s.borc ? fmt(s.borc) : ''}</td>
                    <td className="py-1.5 px-2 text-right">{s.alacak ? fmt(s.alacak) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <button onClick={kaydet} className="bg-green-500 text-white font-bold px-4 py-2 rounded-lg text-sm hover:bg-green-400 flex items-center gap-1"><Save className="w-4 h-4" /> Hesaplara Kaydet</button>
          </div>
        </div>
      )}

      {kayitliRaporlar.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-gray-400 mb-1.5">Kayıtlı raporlar ({kayitliRaporlar.length}):</p>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {kayitliRaporlar.map(r => (
              <div key={r.id} className="flex items-center justify-between bg-blue-900/30 rounded-lg px-2.5 py-1.5 text-xs">
                <span className="text-white">{r.rapor_tipi === 'mali_hafiza' ? 'Mali Hafıza' : 'Z'} · {r.tarih} · {r.z_no ? `Z${r.z_no}` : ''} · Net: {fmt(r.net_satis)} TL · {r.hesap_satirlari?.length || 0} satır</span>
                <button onClick={() => sil(r.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
