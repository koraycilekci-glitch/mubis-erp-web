import { 
  LayoutDashboard, Users, UserCheck, FileCheck, BookOpen, 
  Receipt, FolderOpen, CheckSquare, Bell, Shield, 
  PenTool, Building, Search, BarChart3, Globe, 
  Smartphone, Bot, FileUp, Database, Sparkles
} from 'lucide-react'

export default function Features() {
  const modules = [
    { icon: LayoutDashboard, title: '1. Dashboard (Kontrol Merkezi)', description: 'Günlük işler, yaklaşan son tarihler, bekleyen beyannameler, MUBİS AI asistanı ile tam kontrol.' },
    { icon: Users, title: '2. Müşteri Yönetimi', description: 'Müşteri kartları, şirket bilgileri, yetkililer, vergi bilgileri, MERSİS, ticaret sicil kayıtları.' },
    { icon: UserCheck, title: '3. Personel Yönetimi', description: 'Personel oluşturma, rol sistemi, yetkilendirme, müşteri bazlı yetki ve iş takibi.' },
    { icon: FileCheck, title: '4. Beyan Takip Merkezi', description: 'KDV, KDV2, Muhtasar, SGK, Geçici Vergi, Damga Vergisi, e-Defter takibi.' },
    { icon: BookOpen, title: '5. e-Defter Merkezi', description: 'Aylık ve üç aylık e-defter, berat takibi, yükleme durumu ve hatırlatmalar.' },
    { icon: Receipt, title: '6. Tahakkuk Merkezi', description: 'Toplu PDF oluşturma, WhatsApp ve mail gönderimi, gönderim kayıtları.' },
    { icon: FolderOpen, title: '7. Evrak Merkezi', description: 'Gelen/giden faturalar, e-arşiv, tahakkuklar, e-tebligatlar ve diğer belgeler.' },
    { icon: CheckSquare, title: '8. Akıllı Görev Merkezi', description: 'Her müşteri için KDV, Muhtasar, SGK, e-Defter, tahakkuk takibi ve tamamlanma yüzdesi.' },
    { icon: Bell, title: '9. E-Tebligat Merkezi', description: 'Günlük kontrol, indirme, arşivleme ve müşteriye otomatik gönderme.' },
    { icon: Shield, title: '10. Gerçek Faydalanıcı', description: 'Takip, hatırlatma ve bildirim sistemi.' },
    { icon: PenTool, title: '11. E-İmza / Mali Mühür', description: 'Bitiş tarihleri, 30 gün önceden uyarı, WhatsApp ve mail bildirimleri.' },
    { icon: Building, title: '12. Yeni Şirket Kuruluş Sihirbazı', description: 'Kuruluş sonrası vergi, SGK, e-tebligat, mali mühür, e-imza, e-defter ve defter beyan işlemleri.' },
    { icon: Search, title: '13. Kurum Sorgulamaları', description: 'Dijital Vergi Dairesi, İTO, Ticaret Sicili, SGK entegrasyonları ile tek ekrandan erişim.' },
    { icon: BarChart3, title: '14. Raporlama', description: 'Excel, PDF, yazdırma ve toplu rapor seçenekleri.' },
    { icon: Globe, title: '15. Müşteri Portalı', description: 'Müşterilerin tahakkuk, evrak, fatura ve bildirimlerini görüntüleyebildiği özel portal.' },
    { icon: Smartphone, title: '16. Mobil Uygulama', description: 'Tahakkuk, bildirim, evrak yükleme ve mobil portal erişimi.' },
    { icon: Bot, title: '17. MUBİS AI', description: 'Sabah asistanı, öncelikli işler, riskli müşteriler ve süresi yaklaşan işlemler için uyarılar.' },
    { icon: FileUp, title: '18. MUBİS Smart Import AI', description: 'XML okuma, PDF OCR, yapay zeka ile hesap kodu önerme, LUCA entegrasyonu.' },
    { icon: Database, title: '19. Muhasebe Çekirdeği (Gelecek)', description: 'Fiş, mizan, yevmiye, bilanço, gelir tablosu, cari, stok ve demirbaş modülleri.' },
    { icon: Sparkles, title: '20. Yapay Zeka Destekli Otomasyon', description: 'Hesap önerileri, risk analizi, günlük iş planı, tahakkuk önerileri ve beyan kontrolü.' },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="text-center mb-16">
        <h1 className="text-5xl font-black text-white mb-6">
          MUBİS ERP
          <span className="gradient-text block">Modülleri</span>
        </h1>
        <p className="text-xl text-gray-400 max-w-3xl mx-auto">
          20 güçlü modül ile mali müşavirlik süreçlerinizi baştan sona dijitalleştirin.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {modules.map((module, index) => (
          <div key={index} className="bg-blue-950/30 backdrop-blur-sm rounded-2xl p-6 card-hover border border-blue-800/30 group">
            <div className="bg-gradient-to-br from-blue-500/20 to-yellow-500/20 p-3 rounded-xl inline-block mb-4">
              <module.icon className="w-8 h-8 text-yellow-500" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">{module.title}</h3>
            <p className="text-gray-400 text-sm leading-relaxed">{module.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}