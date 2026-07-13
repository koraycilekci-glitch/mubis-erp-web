import { Link } from 'react-router-dom'
import { ArrowRight, Shield, Zap, Users, BarChart3, Clock, Star } from 'lucide-react'

export default function Home() {
  const features = [
    { icon: Shield, title: 'Güvenli', description: 'E-İmza ve Mali Mühür entegrasyonu' },
    { icon: Zap, title: 'Hızlı', description: 'AI destekli otomasyon sistemi' },
    { icon: Users, title: 'Müşteri Odaklı', description: 'Özel müşteri portalı' },
    { icon: BarChart3, title: 'Raporlama', description: 'Detaylı analiz ve raporlar' },
    { icon: Clock, title: 'Zaman Tasarrufu', description: 'Otomatik iş takibi' },
    { icon: Star, title: 'Akıllı Asistan', description: 'MUBİS AI günlük yardımcı' },
  ]

  return (
    <div>
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-yellow-500/10" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32 relative">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center space-x-2 bg-blue-900/50 rounded-full px-4 py-2 mb-8 border border-blue-700/50">
              <span className="text-yellow-500">🚀</span>
              <span className="text-gray-300 text-sm">Yeni Nesil ERP Sistemi</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-black text-white mb-6 leading-tight">
              Mali Müşavirin
              <span className="gradient-text block">Dijital Çalışma Masası</span>
            </h1>
            
            <p className="text-xl text-gray-300 mb-10 max-w-2xl mx-auto leading-relaxed">
              MUBİS ERP ile tüm mali müşavirlik süreçlerinizi tek platformdan yönetin. 
              Beyanlardan tahakkuklara, e-defterden e-tebligata kadar her şey parmaklarınızın ucunda.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/ozellikler" className="btn-gold text-lg px-10 py-4 inline-flex items-center justify-center">
                Özellikleri Keşfet
                <ArrowRight className="w-5 h-5 inline ml-2" />
              </Link>
              <Link to="/giris" className="btn-primary text-lg px-10 py-4 inline-flex items-center justify-center">
                Hemen Başla
              </Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-16">
              {[
                { value: '20+', label: 'Modül' },
                { value: '1.000+', label: 'Aktif Kullanıcı' },
                { value: '%99.9', label: 'Uptime' },
                { value: '24/7', label: 'AI Destek' },
              ].map((stat, index) => (
                <div key={index} className="text-center">
                  <div className="text-3xl font-bold text-yellow-500">{stat.value}</div>
                  <div className="text-gray-400 text-sm mt-1">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Özellikler Grid */}
      <section className="py-20 bg-blue-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Neden MUBİS ERP?</h2>
            <p className="text-gray-400 text-lg">Mali müşavirlik süreçlerinizi dönüştüren özellikler</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="bg-blue-950/30 backdrop-blur-sm rounded-2xl p-8 card-hover border border-blue-800/30">
                <feature.icon className="w-12 h-12 text-yellow-500 mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-gray-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-r from-blue-900 to-blue-950">
        <div className="max-w-4xl mx-auto text-center px-4">
          <h2 className="text-4xl font-bold text-white mb-6">MUBİS ERP ile Tanışmaya Hazır mısınız?</h2>
          <p className="text-gray-300 text-lg mb-10">
            Hemen ücretsiz denemeye başlayın, mali müşavirlik süreçlerinizi dijitale taşıyın.
          </p>
          <Link to="/giris" className="btn-gold text-xl px-12 py-5 inline-flex items-center">
            Hemen Başla - Ücretsiz
            <ArrowRight className="w-6 h-6 inline ml-3" />
          </Link>
        </div>
      </section>
    </div>
  )
}