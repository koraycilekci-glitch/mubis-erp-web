// MUBiS ERP ofis/iletisim bilgileri.
// Footer, Iletisim ve Hakkimizda sayfalari bu tek kaynagi kullanir.

export const OFIS = {
  unvan: 'SMMM Aziz Koray Çilekci',
  adres: 'Mecidiye Mah. Büyükkuyu Sokak No: 8/A Beşiktaş / İstanbul',
  telefon: '0 551 084 90 29',
  telefonHref: 'tel:+905510849029',
  email: 'info@mubiserp.com.tr',
  emailHref: 'mailto:info@mubiserp.com.tr'
}

// Google Haritalar arama baglantisi
export const HARITA_URL =
  'https://www.google.com/maps/search/?api=1&query=' +
  encodeURIComponent('Mecidiye Mah. Büyükkuyu Sokak No:8/A Beşiktaş İstanbul')

// Sayfa icine gomulu harita (API anahtari gerektirmez)
export const HARITA_EMBED_URL =
  'https://www.google.com/maps?output=embed&hl=tr&q=' +
  encodeURIComponent('Mecidiye Mah. Büyükkuyu Sokak No:8/A Beşiktaş İstanbul')
