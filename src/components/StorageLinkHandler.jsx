import { useEffect } from 'react'
import { openDocument, downloadDocument, isOwnStorageUrl } from '../utils/storageUrl'

/**
 * client-documents bucket'i private oldugu icin veritabaninda saklanan
 * eski public URL'ler dogrudan acilamaz.
 *
 * Bu bilesen belge baglantilarini tek noktadan yakalar: sayfadaki herhangi
 * bir <a> etiketinin adresi bizim storage adresimizse, tiklama durdurulur
 * ve imzali (gecerli) baglanti ile acilir/indirilir.
 *
 * Boylece onlarca ayri dosyadaki <a href={...}> kullanimi degistirilmeden
 * private bucket'a gecis saglanir.
 */
export default function StorageLinkHandler() {
  useEffect(() => {
    const tiklama = (e) => {
      // Yeni sekme / indirme kisayollarini bozmayalim
      if (e.defaultPrevented || e.button !== 0) return

      const a = e.target?.closest?.('a[href]')
      if (!a) return

      const href = a.getAttribute('href')
      if (!href || !href.startsWith('http')) return
      if (!isOwnStorageUrl(href)) return
      // Zaten imzalanmis baglantiya dokunma
      if (href.includes('/object/sign/')) return

      e.preventDefault()

      const indir = a.hasAttribute('download')
      if (indir) {
        const ad = a.getAttribute('download') || a.getAttribute('title') || ''
        downloadDocument(href, ad || undefined)
      } else {
        openDocument(href)
      }
    }

    document.addEventListener('click', tiklama, true)
    return () => document.removeEventListener('click', tiklama, true)
  }, [])

  return null
}
