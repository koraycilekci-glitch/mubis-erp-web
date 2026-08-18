// MUBIS sesli asistan yardimcilari - tarayici Speech Synthesis ses secimi

export const SES_TERCIHLERI = [
  { id: 'kadin', label: 'Kadın sesi' },
  { id: 'erkek', label: 'Erkek sesi' },
  { id: 'otomatik', label: 'Otomatik (tarayıcı varsayılanı)' }
]

const KADIN_IPUCU = [
  'female', 'woman', 'kadin', 'kadın',
  'emel', 'filiz', 'seda', 'yelda', 'aylin', 'zeynep', 'elif', 'defne',
  'zira', 'hazel', 'susan', 'catherine', 'linda', 'heera', 'aria', 'jenny',
  'michelle', 'sonia', 'natasha', 'clara', 'google türkçe', 'google turkce'
]

const ERKEK_IPUCU = [
  'male', 'man', 'erkek',
  'tolga', 'ahmet', 'mehmet', 'burak', 'emre', 'kerem', 'yusuf',
  'david', 'mark', 'george', 'ryan', 'guy', 'james', 'william', 'christopher',
  'eric', 'roger', 'steffan', 'brandon'
]

export const VARSAYILAN_SES_AYARI = {
  tercih: 'kadin',
  sesAdi: '',
  hiz: 1.02,
  ton: 1
}

export function sesDestekleniyor() {
  return typeof window !== 'undefined' && !!window.speechSynthesis
}

function tumSesler() {
  if (!sesDestekleniyor()) return []
  return window.speechSynthesis.getVoices() || []
}

function turkceMi(v) {
  return (v?.lang || '').toLowerCase().startsWith('tr')
}

/** Sadece Turkce sesler */
export function getTurkceSesler() {
  return tumSesler().filter(turkceMi)
}

/** Tum sesler; Turkce olanlar listenin basinda */
export function getSesler() {
  const hepsi = tumSesler()
  const tr = hepsi.filter(turkceMi)
  const diger = hepsi.filter(v => !turkceMi(v))
  return [...tr, ...diger]
}

/** Bir sesin tahmini cinsiyeti: kadin | erkek | bilinmiyor */
export function sesCinsiyeti(ses) {
  const ad = (ses?.name || '').toLowerCase()
  if (!ad) return 'bilinmiyor'
  if (KADIN_IPUCU.some(k => ad.includes(k))) return 'kadin'
  if (ERKEK_IPUCU.some(k => ad.includes(k))) return 'erkek'
  return 'bilinmiyor'
}

// Sesler tarayicida asenkron yuklenir; hazir olunca callback tetiklenir
export function seslerHazirOlunca(callback) {
  if (!sesDestekleniyor()) return () => {}
  const mevcut = window.speechSynthesis.getVoices()
  if (mevcut && mevcut.length > 0) callback(getSesler())
  const handler = () => callback(getSesler())
  window.speechSynthesis.addEventListener('voiceschanged', handler)
  return () => window.speechSynthesis.removeEventListener('voiceschanged', handler)
}

export function sesSec(ayar = {}) {
  const { tercih = 'kadin', sesAdi = '' } = ayar
  const hepsi = getSesler()
  if (hepsi.length === 0) return null

  // Ad ile secim her seyin onunde
  if (sesAdi) {
    const tam = hepsi.find(v => v.name === sesAdi)
    if (tam) return tam
  }

  const turkceler = hepsi.filter(turkceMi)
  const oncelikli = turkceler.length > 0 ? turkceler : hepsi

  if (tercih === 'otomatik') return oncelikli[0]

  // 1) Turkce sesler icinde istenen cinsiyet
  const trEslesen = oncelikli.find(v => sesCinsiyeti(v) === tercih)
  if (trEslesen) return trEslesen

  // 2) Turkce'de yoksa karsit cinsiyet ipucu icermeyen Turkce ses
  const notr = oncelikli.find(v => sesCinsiyeti(v) === 'bilinmiyor')
  if (notr) return notr

  // 3) Hicbiri yoksa mevcut Turkce sesi kullan (ton ile telafi edilir)
  return oncelikli[0]
}

/**
 * Secilen ses istenen cinsiyette degilse tonu otomatik ayarlar.
 * Ornegin sistemde yalnizca erkek Turkce ses varsa kadin tercihi icin ton yukseltilir.
 */
export function efektifTon(ayar = {}) {
  const { tercih = 'kadin', ton = 1, sesAdi = '' } = { ...VARSAYILAN_SES_AYARI, ...ayar }
  const ses = sesSec(ayar)
  let sonuc = Number(ton) || 1

  // Kullanici belirli bir ses sectiyse tona dokunma
  if (sesAdi || tercih === 'otomatik' || !ses) return sonuc

  const cinsiyet = sesCinsiyeti(ses)
  if (tercih === 'kadin' && cinsiyet !== 'kadin') sonuc = Math.min(2, sonuc + 0.55)
  if (tercih === 'erkek' && cinsiyet === 'kadin') sonuc = Math.max(0.1, sonuc - 0.4)
  return sonuc
}

/** Istenen cinsiyette gercek bir ses var mi? */
export function cinsiyetSesiVar(tercih = 'kadin') {
  return getSesler().some(v => sesCinsiyeti(v) === tercih)
}

export function konus(metin, ayar = {}) {
  if (!sesDestekleniyor() || !metin) return
  const { hiz } = { ...VARSAYILAN_SES_AYARI, ...ayar }
  try {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(String(metin).replace(/[*_#`]/g, ''))
    u.lang = 'tr-TR'
    u.rate = Number(hiz) || 1
    u.pitch = efektifTon(ayar)
    const ses = sesSec(ayar)
    if (ses) {
      u.voice = ses
      if (ses.lang) u.lang = ses.lang
    }
    window.speechSynthesis.speak(u)
  } catch (e) {
    console.warn('Seslendirme desteklenmiyor', e)
  }
}

// app_settings satirlarini ses ayari nesnesine cevirir
export function sesAyariCoz(settings) {
  return {
    tercih: settings?.ai_voice_gender || VARSAYILAN_SES_AYARI.tercih,
    sesAdi: settings?.ai_voice_name || '',
    hiz: parseFloat(settings?.ai_voice_rate || VARSAYILAN_SES_AYARI.hiz) || VARSAYILAN_SES_AYARI.hiz,
    ton: parseFloat(settings?.ai_voice_pitch || VARSAYILAN_SES_AYARI.ton) || VARSAYILAN_SES_AYARI.ton
  }
}
