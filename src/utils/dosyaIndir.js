import { fetchDocument } from './storageUrl'

// Dosyayi blob olarak indirir — cross-origin linklerde tarayici <a download>
// niteligini yok sayip dosyayi yeni sekmede actigi icin (bos/koyu ekran)
// once blob'a cevirip sonra kaydeder. Fetch basarisizsa yeni sekmede acar.
export async function dosyaIndir(url, ad) {
  try {
    const r = await fetchDocument(url)
    const b = await r.blob()
    const u = URL.createObjectURL(b)
    const a = document.createElement('a')
    a.href = u
    a.download = ad || 'dosya'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(u), 10000)
  } catch { window.open(url, '_blank', 'noreferrer') }
}
