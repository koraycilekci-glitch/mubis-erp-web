import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="bg-blue-950/80 border-t border-blue-800/50 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-yellow-400 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">M</span>
              </div>
              <div>
                <span className="text-xl font-bold text-white">MUBİS</span>
                <span className="text-yellow-400 text-sm block -mt-1">ERP</span>
              </div>
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
              <p>Smmm Aziz Koray Cilekci</p>
              <p>koraycilekci@gmail.com</p>
              <p>+90 542 422 22 56</p>
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