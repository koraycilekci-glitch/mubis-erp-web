import { useEffect, useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import { netlikPuani } from '../utils/belgeTarama'

export default function BelgeSeriKamera({ kalan, onCek, onKapat }) {
  const video = useRef(null)
  const [hazir, setHazir] = useState(false)
  const [uyari, setUyari] = useState('')
  const [mesgul, setMesgul] = useState(false)
  const [bulanik, setBulanik] = useState(null)
  const aktif = useRef(false)

  useEffect(() => {
    let stream
    aktif.current = true
    let iptal = false
    const kapat = () => {
      iptal = true
      aktif.current = false
      stream?.getTracks().forEach(track => track.stop())
    }
    async function ac() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Kamera kullanılamıyor')
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } })
        if (iptal) return kapat()
        video.current.srcObject = stream
        await video.current.play()
        if (!iptal) setHazir(true)
      } catch {
        stream?.getTracks().forEach(track => track.stop())
        if (!iptal) setUyari('Kamera açılamadı. Kamera iznini kontrol edin veya dosya seçerek devam edin.')
      }
    }
    function tus(event) { if (event.key === 'Escape') onKapat() }
    document.addEventListener('keydown', tus)
    ac()
    return () => { kapat(); document.removeEventListener('keydown', tus) }
  }, [onKapat])

  const kuyrugaEkle = async (file) => {
    if (!aktif.current) return
    setMesgul(true)
    try {
      await onCek(file)
      if (aktif.current) setUyari('Fotoğraf eklendi. Sonraki belgeyi çekebilirsiniz.')
    } catch {
      if (aktif.current) setUyari('Fotoğraf eklenemedi. Yeniden deneyin.')
    } finally {
      if (aktif.current) setMesgul(false)
    }
  }

  const cek = () => {
    if (mesgul || !kalan || !video.current?.videoWidth) return
    setBulanik(null)
    const frame = document.createElement('canvas')
    const kaynak = video.current
    const olcek = Math.min(1, 2500 / Math.max(kaynak.videoWidth, kaynak.videoHeight))
    frame.width = Math.round(kaynak.videoWidth * olcek)
    frame.height = Math.round(kaynak.videoHeight * olcek)
    const kucuk = document.createElement('canvas')
    kucuk.width = Math.max(1, Math.round(frame.width * 480 / Math.max(frame.width, frame.height)))
    kucuk.height = Math.max(1, Math.round(frame.height * 480 / Math.max(frame.width, frame.height)))
    const context = frame.getContext('2d')
    const analiz = kucuk.getContext('2d', { willReadFrequently: true })
    if (!context || !analiz) return setUyari('Görüntü alınamadı; dosya seçerek devam edebilirsiniz.')
    context.drawImage(kaynak, 0, 0, frame.width, frame.height)
    analiz.drawImage(frame, 0, 0, kucuk.width, kucuk.height)
    const puan = netlikPuani(analiz.getImageData(0, 0, kucuk.width, kucuk.height).data, kucuk.width, kucuk.height)
    setMesgul(true)
    frame.toBlob(blob => {
      if (!aktif.current) return
      if (!blob) { setMesgul(false); setUyari('Görüntü kaydedilemedi. Tekrar deneyin.'); return }
      const file = new File([blob], `tarama-${Date.now()}.jpg`, { type: 'image/jpeg' })
      if (puan < 55) {
        setBulanik(file)
        setMesgul(false)
        setUyari('Fotoğraf bulanık olabilir. Telefonu sabitleyip yeniden çekin veya bu fotoğrafı kullanın.')
      } else kuyrugaEkle(file)
    }, 'image/jpeg', 0.92)
  }

  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
    <section role="dialog" aria-modal="true" aria-label="Seri belge çekimi" className="w-full max-w-xl rounded-xl bg-blue-950 p-4 text-white">
      <header className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Seri belge çekimi</h3><button type="button" autoFocus aria-label="Kamerayı kapat" onClick={onKapat}><X /></button></header>
      <video ref={video} playsInline muted className="max-h-[55vh] w-full rounded-lg bg-black object-contain" />
      <p className="my-3 text-sm text-gray-300" aria-live="polite">{!kalan ? '10 belge sınırına ulaşıldı.' : uyari || 'Belgeyi kadraja alın ve Çek düğmesine basın.'} · Kalan: {kalan}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={cek} disabled={!hazir || !kalan || mesgul} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 disabled:opacity-50"><Camera size={16} /> {bulanik ? 'Yeniden Çek' : 'Çek'}</button>
        {bulanik && kalan > 0 && <button type="button" disabled={mesgul} onClick={() => { setBulanik(null); kuyrugaEkle(bulanik) }} className="rounded-lg bg-amber-700 px-4 py-2">Bu Fotoğrafı Kullan</button>}
        <button type="button" onClick={onKapat} className="rounded-lg bg-blue-800 px-4 py-2">Bitir</button>
      </div>
    </section>
  </div>
}
