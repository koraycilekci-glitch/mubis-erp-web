// MUBiS - Rota bazli GA4 sayfa goruntuleme koprusu
//
// Router'in icinde calisir; her rota degisiminde TEK bir page_view gonderir.
// Cift sayimi onlemek icin:
//  - GA config'inde send_page_view:false (bkz. utils/analytics.js)
//  - ayni path+search icin tekrar gonderim engellenir (ref guard)
//  - React StrictMode'un cift effect calistirmasi ref ile yutulur
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { sayfaGoruntule, analitikBaslat } from '../utils/analytics'

export default function Analytics() {
  const location = useLocation()
  const sonGonderilen = useRef('')

  useEffect(() => {
    // Onay yoksa hicbir sey yuklenmez/gonderilmez (KVKK).
    if (!analitikBaslat()) return
    const anahtar = location.pathname + '|' + (location.search || '')
    if (sonGonderilen.current === anahtar) return
    sonGonderilen.current = anahtar
    sayfaGoruntule({
      pathname: location.pathname,
      search: location.search,
      title: document.title
    })
  }, [location.pathname, location.search])

  return null
}
