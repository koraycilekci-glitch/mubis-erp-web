import { Link } from 'react-router-dom'
import { OFIS, HARITA_URL } from '../data/ofisBilgi'

export default function Footer() {
  return (
    <footer className="bg-blue-950/80 border-t border-blue-800/50 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center mb-4">
              <img src="/logo-text.png" alt="MUBiS ERP" className="h-11 w-auto object-contain" />
            </div>
            <p className="text-gray-400 text-sm max-w-md">
              Mali Müşavirin Dijital Çalışma Masası. Beyanlardan tahakkuklara, 
              e-defterden e-tebligata kadar tüm süreçlerinizi tek platformdan yönetin.
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">Hızlı Linkler</h4>
            <div className="space-y-2">
              <Link to="/" className="text-gray-400 hover:text-white text-sm block">Ana Sayfa</Link>
              <Link to="/ozellikler" className="text-gray-400 hover:text-white text-sm block">Özellikler</Link>
              <Link to="/iletisim" className="text-gray-400 hover:text-white text-sm block">İletişim</Link>
              <Link to="/giris" className="text-gray-400 hover:text-white text-sm block">Giriş Yap</Link>
            </div>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">İletişim</h4>
            <div className="space-y-2 text-sm text-gray-400">
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

        <div className="border-t border-blue-800/50 mt-8 pt-8 text-center">
          <p className="text-gray-500 text-sm">
            © 2026 MUBİS ERP. Tüm hakları saklıdır. 
            <span className="text-yellow-400 ml-1">💙</span>
          </p>
        </div>
      </div>
    </footer>
  )
}