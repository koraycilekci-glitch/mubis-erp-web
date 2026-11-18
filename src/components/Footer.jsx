import { useState } from 'react'
import { Link } from 'react-router-dom'
import { OFIS, HARITA_URL } from '../data/ofisBilgi'

export default function Footer() {
  // Görsel henüz yüklenmemiş/bozuksa yazı linkine düşer (kırık resim ikonu görünmez).
  const [bannerVar, setBannerVar] = useState(true)
  return (
    <footer className="bg-blue-950/80 border-t border-blue-800/50 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center mb-4">
              <img src="/logo-text.png" alt="MUBiS ERP" className="h-11 w-auto object-contain" />
            </div>
            <p className="text-muted text-sm max-w-md">
              Mali Müşavirin Dijital Çalışma Masası. Beyanlardan tahakkuklara,
              e-defterden e-tebligata kadar tüm süreçlerinizi tek platformdan yönetin.
            </p>
            {bannerVar ? (
              <a
                href="/pwa-kurulum"
                target="_blank"
                rel="noopener noreferrer"
                className="group mt-4 inline-block w-full max-w-[200px] sm:max-w-[300px] rounded-lg overflow-hidden ring-1 ring-blue-700/50 hover:ring-cyan-400/70 transition-shadow hover:shadow-lg hover:shadow-cyan-500/10"
                title="Mobil Kurulum Kılavuzu"
              >
                <img
                  src="/mobil-kurulum-banner.jpg"
                  alt="MUBİS ERP'yi telefonunuza ekleyin — Android ve iPhone kurulum kılavuzu"
                  width="840"
                  height="420"
                  className="block w-full h-auto object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                  loading="lazy"
                  decoding="async"
                  onError={() => setBannerVar(false)}
                />
              </a>
            ) : (
              <a
                href="/pwa-kurulum"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 text-cyan-300 hover:text-cyan-200 text-sm font-medium underline"
              >
                📱 Mobil Kurulum Kılavuzu
              </a>
            )}
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Hızlı Linkler</h4>
            <div className="space-y-2">
              <Link to="/" className="text-muted hover:text-white text-sm block transition-colors">Ana Sayfa</Link>
              <Link to="/ozellikler" className="text-muted hover:text-white text-sm block transition-colors">Özellikler</Link>
              <Link to="/hakkimizda" className="text-muted hover:text-white text-sm block transition-colors">Hakkımızda</Link>
              <Link to="/iletisim" className="text-muted hover:text-white text-sm block transition-colors">İletişim</Link>
              <Link to="/giris" className="text-muted hover:text-white text-sm block transition-colors">Giriş Yap</Link>
            </div>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Yasal</h4>
            <div className="space-y-2">
              <Link to="/kvkk-aydinlatma" className="text-muted hover:text-white text-sm block transition-colors">KVKK Aydınlatma Metni</Link>
              <Link to="/gizlilik-politikasi" className="text-muted hover:text-white text-sm block transition-colors">Gizlilik Politikası</Link>
              <Link to="/cerez-politikasi" className="text-muted hover:text-white text-sm block transition-colors">Çerez Politikası</Link>
              <Link to="/kullanim-kosullari" className="text-muted hover:text-white text-sm block transition-colors">Kullanım Koşulları</Link>
            </div>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">İletişim</h4>
            <div className="space-y-2 text-sm text-muted">
              <p className="text-gray-300">{OFIS.unvan}</p>
              <a
                href={HARITA_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="block hover:text-white transition-colors"
              >
                {OFIS.adres}
              </a>
              <a href={OFIS.telefonHref} className="block hover:text-white transition-colors">
                {OFIS.telefon}
              </a>
              <a href={OFIS.emailHref} className="block hover:text-white transition-colors">
                {OFIS.email}
              </a>
            </div>
          </div>
        </div>

        <div className="border-t border-blue-800/50 mt-6 pt-5 text-center">
          <p className="text-muted text-sm">
            © 2026 MUBİS ERP. Tüm hakları saklıdır. 
            <span className="text-yellow-400 ml-1">💙</span>
          </p>
        </div>
      </div>
    </footer>
  )
}