import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Cookie } from 'lucide-react'
import { onayVerildi, analitikDurdur, GA_OLCUM_KIMLIGI } from '../utils/analytics'

// 2.7.523: KVKK uyumlu cerez onay banner'i.
// Zorunlu olmayan cerezler (analitik) YALNIZCA onay verilirse yuklenir.
// Tercih localStorage'da tutulur ve analitik istemcisine iletilir.
const ANAHTAR = 'mubis_cerez_onayi'

// Onay degistiginde dinleyiciler haberdar olsun.
export const CEREZ_ONAY_OLAYI = 'mubis:cerez-onayi'

export function cerezOnayiAl() {
  try { return localStorage.getItem(ANAHTAR) } catch { return null }
}

export function cerezOnayiniSifirla() {
  try { localStorage.removeItem(ANAHTAR) } catch { /* ozel mod */ }
  analitikDurdur()
  try { window.dispatchEvent(new CustomEvent(CEREZ_ONAY_OLAYI, { detail: null })) } catch { /* yoksay */ }
}

export default function CerezBanneri() {
  const [gorunur, setGorunur] = useState(false)

  useEffect(() => {
    if (!cerezOnayiAl()) {
      const t = setTimeout(() => setGorunur(true), 1200)
      return () => clearTimeout(t)
    }
  }, [])

  const kaydet = (deger) => {
    try { localStorage.setItem(ANAHTAR, deger) } catch { /* ozel mod */ }
    if (deger === 'kabul') onayVerildi()
    else analitikDurdur()
    try { window.dispatchEvent(new CustomEvent(CEREZ_ONAY_OLAYI, { detail: deger })) } catch { /* yoksay */ }
    setGorunur(false)
  }

  if (!gorunur) return null

  return (
    <div className="fixed bottom-0 inset-x-0 z-[100] p-3 sm:p-4" role="dialog" aria-label="Çerez onayı">
      <div className="max-w-3xl mx-auto bg-blue-950/95 backdrop-blur border border-blue-700/50 rounded-2xl shadow-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <Cookie className="w-6 h-6 text-yellow-400 shrink-0 hidden sm:block" />
        <p className="text-gray-300 text-xs sm:text-sm flex-1">
          Sitede oturum güvenliği için zorunlu çerezler kullanılır. Onay verirseniz, siteyi nasıl kullandığınızı
          anlamak için <strong className="text-white">anonim istatistik</strong> (Google Analytics 4) çerezleri de
          kullanılır; kimlik, T.C. kimlik numarası, vergi numarası veya müşteri bilgisi gönderilmez. Ayrıntılar için{' '}
          <Link to="/cerez-politikasi" className="text-yellow-400 hover:underline">Çerez Politikası</Link> ve{' '}
          <Link to="/kvkk-aydinlatma" className="text-yellow-400 hover:underline">KVKK Aydınlatma Metni</Link>'ne bakabilirsiniz.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => kaydet('red')}
            className="px-4 py-2 rounded-xl border border-blue-600/50 text-gray-300 text-sm hover:bg-blue-800/40"
          >
            Yalnızca zorunlu
          </button>
          <button
            onClick={() => kaydet('kabul')}
            className="px-4 py-2 rounded-xl bg-yellow-400 text-blue-950 text-sm font-semibold hover:bg-yellow-300"
            title={GA_OLCUM_KIMLIGI ? '' : 'Analitik henüz yapılandırılmadı; tercihiniz yine de kaydedilir'}
          >
            Kabul Et
          </button>
        </div>
      </div>
    </div>
  )
}
