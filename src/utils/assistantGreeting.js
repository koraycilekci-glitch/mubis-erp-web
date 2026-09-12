const temizleAd = (value) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()

const ilkAd = (value) => {
  const temiz = temizleAd(value)
  if (!temiz) return ''
  return temiz.split(' ')[0]
}

const ilkDoluDeger = (...values) => values.find((value) => temizleAd(value)) || ''

const kisiAdi = (kisi) => (
  kisi?.adSoyad
  || kisi?.ad_soyad
  || kisi?.name
  || kisi?.fullName
  || kisi?.isim
  || kisi?.contactName
  || kisi?.contact_name
  || ''
)

const parseArray = (value) => {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const ilkIletisimAdi = (client) => {
  const numaralar = client?.phoneNumbers
    || client?.phonenumbers
    || client?.phone_numbers
    || []

  const liste = parseArray(numaralar)

  const ilk = liste.find((item) => typeof item === 'object' && kisiAdi(item))
  return ilkAd(kisiAdi(ilk))
}

export function asistanHitapAdi(client, user) {
  // Kisa ad onecelikli olsun
  const kisaAd = ilkAd(ilkDoluDeger(
    client?.shortName,
    client?.short_name
  ))
  if (kisaAd) return kisaAd

  const ilkKayitliIletisimAdi = ilkDoluDeger(
    ilkIletisimAdi(client),
    ilkIletisimAdi(user)
  )
  if (ilkKayitliIletisimAdi) return ilkKayitliIletisimAdi

  const dogrudanAd = ilkAd(ilkDoluDeger(
    client?.name,
    client?.adSoyad,
    client?.ad_soyad,
    user?.shortName,
    user?.short_name,
    user?.name,
    user?.fullName
  ))
  if (dogrudanAd) return dogrudanAd

  const sirket = ilkDoluDeger(
    client?.company,
    client?.companyName,
    user?.company
  )
  return ilkAd(sirket)
}

export function asistanKarsilama(client, user) {
  const ad = asistanHitapAdi(client, user)
  return `Merhaba${ad ? ` ${ad}` : ''}! 👋
Ben MUBİS Yapay Zekâ Asistanı.
Vergi, SGK, muhasebe ve diğer mali konularda sorularınızı yanıtlamaktan memnuniyet duyarım.`
}