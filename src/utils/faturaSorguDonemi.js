const iki = sayi => String(sayi).padStart(2, '0')

function tarihOku(deger) {
  const eslesme = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(deger || ''))
  if (!eslesme) return null
  const [, gun, ay, yil] = eslesme.map(Number)
  const tarih = new Date(Date.UTC(yil, ay - 1, gun))
  if (tarih.getUTCFullYear() !== yil || tarih.getUTCMonth() !== ay - 1 || tarih.getUTCDate() !== gun) return null
  return tarih
}

function parcaOlustur(bas, bit) {
  const bicimle = tarih => `${iki(tarih.getUTCDate())}/${iki(tarih.getUTCMonth() + 1)}/${tarih.getUTCFullYear()}`
  return { bas: bicimle(bas), bit: bicimle(bit), etiket: `${iki(bas.getUTCDate())}.${iki(bas.getUTCMonth() + 1)} - ${iki(bit.getUTCDate())}.${iki(bit.getUTCMonth() + 1)}` }
}

export function sorguParcasiniBol(parca, gun = 7) {
  const bas = tarihOku(parca?.bas)
  const bit = tarihOku(parca?.bit)
  if (!bas || !bit || bas > bit || !Number.isInteger(gun) || gun < 1 || bas.getUTCMonth() !== bit.getUTCMonth() || bas.getUTCFullYear() !== bit.getUTCFullYear()) return []
  const sonuc = []
  for (let basMs = bas.getTime(); basMs <= bit.getTime(); basMs += gun * 86400000) {
    sonuc.push(parcaOlustur(new Date(basMs), new Date(Math.min(bit.getTime(), basMs + (gun - 1) * 86400000))))
  }
  return sonuc
}

export function donemParcalari(yil, ay, gun = 30, bugun = new Date()) {
  const y = Number(yil), a = Number(ay)
  if (!Number.isInteger(y) || y < 2000 || !Number.isInteger(a) || a < 1 || a > 12 || !Number.isInteger(gun) || gun < 1) return null
  let son = new Date(y, a, 0).getDate()
  if (y === bugun.getFullYear() && a === bugun.getMonth() + 1) son = Math.min(son, bugun.getDate())
  return sorguParcasiniBol({ bas: `01/${iki(a)}/${y}`, bit: `${iki(son)}/${iki(a)}/${y}` }, gun)
}

export function yedekParcalari(hata, parca) {
  if (hata?.code !== 'LUCA_ARALIK_REDDEDILDI' || hata?.isBitti !== true) return []
  const parcalar = sorguParcasiniBol(parca, 7)
  return parcalar.length > 1 ? parcalar : []
}
