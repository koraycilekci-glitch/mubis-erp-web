import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { 
  ArrowLeft, Building2, User, Phone, Mail, MapPin, 
  FileText, Calendar, AlertTriangle, CheckCircle, 
  Clock, Edit3, Save, X, Plus, Trash2, Download,
  Globe, Shield, CreditCard, Hash, Key, BookOpen
} from 'lucide-react'

const clientsDB = [
  {
    id: 1, name: 'ABC Ltd. Sti.', vkn: '1234567890', taxOffice: 'Beyoglu Vergi Dairesi',
    mersis: '1234-5678-9012-3456', tradeRegistry: 'Istanbul Ticaret Sicil - 123456',
    capital: '500.000 ₺', establishedDate: '2015-03-15', phone: '+90 212 555 01 01',
    email: 'info@abcltd.com', website: 'www.abcltd.com', address: 'Beyoglu, Istanbul',
    officials: [
      { name: 'Ali Yilmaz', title: 'Genel Mudur', phone: '+90 532 111 22 33', email: 'ali@abcltd.com' },
      { name: 'Ayse Demir', title: 'Mali Isler Muduru', phone: '+90 533 444 55 66', email: 'ayse@abcltd.com' },
    ],
    banks: [
      { bank: 'Is Bankasi', iban: 'TR12 3456 7890 1234 5678 9012 34', branch: 'Beyoglu Subesi' },
      { bank: 'Garanti BBVA', iban: 'TR98 7654 3210 9876 5432 1098 76', branch: 'Taksim Subesi' },
    ],
    notes: 'Aylik KDV ve Muhtasar beyannameleri duzenli verilir.',
    status: 'active',
    tasks: [
      { id: 1, task: 'Temmuz KDV Beyannamesi', deadline: '2026-07-25', status: 'pending' },
      { id: 2, task: 'Muhtasar Beyanname', deadline: '2026-07-25', status: 'pending' },
      { id: 3, task: 'Haziran SGK Bildirgesi', deadline: '2026-07-20', status: 'completed' },
    ]
  },
  {
    id: 2, name: 'XYZ Ticaret A.S.', vkn: '9876543210', taxOffice: 'Kadikoy Vergi Dairesi',
    mersis: '9876-5432-1098-7654', tradeRegistry: 'Istanbul Ticaret Sicil - 789012',
    capital: '1.250.000 ₺', establishedDate: '2018-07-20', phone: '+90 216 555 02 02',
    email: 'info@xyztcaret.com', website: 'www.xyztcaret.com', address: 'Kadikoy, Istanbul',
    officials: [
      { name: 'Mehmet Kaya', title: 'Yonetim Kurulu Baskani', phone: '+90 532 777 88 99', email: 'mehmet@xyztcaret.com' },
    ],
    banks: [
      { bank: 'Yapi Kredi', iban: 'TR11 2233 4455 6677 8899 0011 22', branch: 'Kadikoy Subesi' },
    ],
    notes: 'Uc aylik e-defter kullanicisi. Gecici vergi mukellefi.',
    status: 'active',
    tasks: [
      { id: 1, task: 'Gecici Vergi Beyannamesi', deadline: '2026-08-15', status: 'pending' },
      { id: 2, task: 'e-Defter Yukleme', deadline: '2026-08-20', status: 'pending' },
    ]
  },
  {
    id: 3, name: '123 Danismanlik', vkn: '4567890123', taxOffice: 'Cankaya Vergi Dairesi',
    mersis: '4567-8901-2345-6789', tradeRegistry: 'Ankara Ticaret Sicil - 456789',
    capital: '250.000 ₺', establishedDate: '2020-01-10', phone: '+90 312 555 03 03',
    email: 'info@123danismanlik.com', website: 'www.123danismanlik.com', address: 'Cankaya, Ankara',
    officials: [
      { name: 'Zeynep Demir', title: 'Genel Mudur', phone: '+90 532 333 44 55', email: 'zeynep@123danismanlik.com' },
    ],
    banks: [
      { bank: 'Ziraat Bankasi', iban: 'TR22 3333 4444 5555 6666 7777 88', branch: 'Cankaya Subesi' },
    ],
    notes: 'Aylik KDV mukellefi.',
    status: 'active',
    tasks: [
      { id: 1, task: 'Temmuz KDV Beyannamesi', deadline: '2026-07-25', status: 'pending' },
      { id: 2, task: 'Muhtasar Beyanname', deadline: '2026-07-25', status: 'pending' },
    ]
  },
  {
    id: 4, name: 'Demo Insaat Ltd.', vkn: '7890123456', taxOffice: 'Konak Vergi Dairesi',
    mersis: '7890-1234-5678-9012', tradeRegistry: 'Izmir Ticaret Sicil - 789012',
    capital: '1.000.000 ₺', establishedDate: '2016-05-20', phone: '+90 232 555 04 04',
    email: 'info@demoinsaat.com', website: 'www.demoinsaat.com', address: 'Konak, Izmir',
    officials: [
      { name: 'Can Ozdemir', title: 'Sirket Muduru', phone: '+90 532 666 77 88', email: 'can@demoinsaat.com' },
    ],
    banks: [
      { bank: 'Halkbank', iban: 'TR33 4444 5555 6666 7777 8888 99', branch: 'Konak Subesi' },
    ],
    notes: 'Gecici vergi mukellefi. 3 aylik KDV.',
    status: 'passive',
    tasks: [
      { id: 1, task: 'Gecici Vergi Beyannamesi', deadline: '2026-08-15', status: 'pending' },
    ]
  },
  {
    id: 5, name: 'Mavi Teknoloji A.S.', vkn: '2345678901', taxOffice: 'Sisli Vergi Dairesi',
    mersis: '2345-6789-0123-4567', tradeRegistry: 'Istanbul Ticaret Sicil - 234567',
    capital: '750.000 ₺', establishedDate: '2019-09-01', phone: '+90 212 555 05 05',
    email: 'info@maviteknoloji.com', website: 'www.maviteknoloji.com', address: 'Sisli, Istanbul',
    officials: [
      { name: 'Ebru Celik', title: 'CEO', phone: '+90 532 999 00 11', email: 'ebru@maviteknoloji.com' },
    ],
    banks: [
      { bank: 'Akbank', iban: 'TR44 5555 6666 7777 8888 9999 00', branch: 'Sisli Subesi' },
    ],
    notes: 'Aylik KDV ve Muhtasar.',
    status: 'active',
    tasks: [
      { id: 1, task: 'Temmuz KDV Beyannamesi', deadline: '2026-07-25', status: 'pending' },
      { id: 2, task: 'Muhtasar Beyanname', deadline: '2026-07-25', status: 'completed' },
    ]
  },
  {
    id: 6, name: 'Yesil Enerji A.S.', vkn: '8901234567', taxOffice: 'Ostim Vergi Dairesi',
    mersis: '8901-2345-6789-0123', tradeRegistry: 'Ankara Ticaret Sicil - 890123',
    capital: '2.500.000 ₺', establishedDate: '2017-03-10', phone: '+90 312 555 06 06',
    email: 'info@yesilenerji.com', website: 'www.yesilenerji.com', address: 'Ostim, Ankara',
    officials: [
      { name: 'Deniz Arslan', title: 'Genel Mudur', phone: '+90 532 111 22 44', email: 'deniz@yesilenerji.com' },
    ],
    banks: [
      { bank: 'Vakifbank', iban: 'TR55 6666 7777 8888 9999 0000 11', branch: 'Ostim Subesi' },
    ],
    notes: 'Buyuk olcekli mukellef. Aylik KDV, Muhtasar, Gecici Vergi.',
    status: 'active',
    tasks: [
      { id: 1, task: 'Temmuz KDV Beyannamesi', deadline: '2026-07-25', status: 'pending' },
      { id: 2, task: 'Muhtasar Beyanname', deadline: '2026-07-25', status: 'pending' },
      { id: 3, task: 'Gecici Vergi Beyannamesi', deadline: '2026-08-15', status: 'pending' },
    ]
  },
]

export default function ClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const client = clientsDB.find(c => c.id === parseInt(id))
  const [isEditing, setIsEditing] = useState(false)
  const [activeTab, setActiveTab] = useState('info')

  if (!client) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl text-white">Musteri bulunamadi</h2>
        <button onClick={() => navigate('/admin')} className="btn-gold mt-4">Geri Don</button>
      </div>
    )
  }

  const tabs = [
    { id: 'info', label: 'Bilgiler', icon: Building2 },
    { id: 'officials', label: 'Yetkililer', icon: User },
    { id: 'banks', label: 'Bankalar', icon: CreditCard },
    { id: 'tasks', label: 'Gorevler', icon: CheckCircle },
    { id: 'documents', label: 'Evraklar', icon: FileText },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate('/admin')} className="text-gray-400 hover:text-white">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-yellow-500 rounded-xl flex items-center justify-center text-white font-bold text-xl">
              {client.name.charAt(0)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{client.name}</h1>
              <p className="text-gray-400 text-sm">VKN: {client.vkn}</p>
            </div>
          </div>
        </div>
        <button onClick={() => setIsEditing(!isEditing)} className="btn-gold text-sm px-4 py-2 flex items-center">
          <Edit3 className="w-4 h-4 mr-2" />Duzenle
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { icon: CheckCircle, label: 'Tamamlanan', value: client.tasks.filter(t => t.status === 'completed').length, color: 'text-green-400', bg: 'bg-green-500/10' },
          { icon: Clock, label: 'Bekleyen', value: client.tasks.filter(t => t.status === 'pending').length, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
          { icon: AlertTriangle, label: 'Acil', value: '1', color: 'text-red-400', bg: 'bg-red-500/10' },
          { icon: FileText, label: 'Evrak', value: '12', color: 'text-blue-400', bg: 'bg-blue-500/10' },
        ].map((card, i) => (
          <div key={i} className="bg-blue-950/40 rounded-2xl p-4 border border-blue-800/30 text-center">
            <div className={`${card.bg} p-2 rounded-xl inline-block mb-2`}><card.icon className={`w-5 h-5 ${card.color}`} /></div>
            <div className="text-2xl font-bold text-white">{card.value}</div>
            <div className="text-gray-400 text-xs">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="flex space-x-1 bg-blue-950/40 rounded-xl p-1 mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            <tab.icon className="w-4 h-4" /><span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'info' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4">Sirket Bilgileri</h3>
            <div className="space-y-3">
              {[{ icon: Hash, label: 'VKN', value: client.vkn }, { icon: Building2, label: 'Vergi Dairesi', value: client.taxOffice }, { icon: Globe, label: 'MERSIS', value: client.mersis }, { icon: FileText, label: 'Ticaret Sicil', value: client.tradeRegistry }, { icon: CreditCard, label: 'Sermaye', value: client.capital }, { icon: Calendar, label: 'Kurulus Tarihi', value: client.establishedDate }].map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl"><div className="flex items-center space-x-3"><item.icon className="w-4 h-4 text-gray-500" /><span className="text-gray-400 text-sm">{item.label}</span></div><span className="text-white text-sm font-medium">{item.value}</span></div>
              ))}
            </div>
          </div>
          <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4">Iletisim Bilgileri</h3>
            <div className="space-y-3">
              {[{ icon: Phone, label: 'Telefon', value: client.phone }, { icon: Mail, label: 'E-Posta', value: client.email }, { icon: Globe, label: 'Web Sitesi', value: client.website }, { icon: MapPin, label: 'Adres', value: client.address }].map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-blue-900/20 rounded-xl"><div className="flex items-center space-x-3"><item.icon className="w-4 h-4 text-gray-500" /><span className="text-gray-400 text-sm">{item.label}</span></div><span className="text-white text-sm font-medium">{item.value}</span></div>
              ))}
            </div>
          </div>
          <div className="md:col-span-2 bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
            <h3 className="text-lg font-semibold text-white mb-4">📝 Notlar</h3>
            <p className="text-gray-300 bg-blue-900/20 rounded-xl p-4">{client.notes}</p>
          </div>
        </div>
      )}

      {activeTab === 'officials' && (
        <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
          <div className="flex items-center justify-between mb-6"><h3 className="text-lg font-semibold text-white">👤 Yetkililer</h3><button className="btn-gold text-sm px-3 py-1.5 flex items-center"><Plus className="w-4 h-4 mr-1" />Ekle</button></div>
          <div className="space-y-4">
            {client.officials.map((official, i) => (
              <div key={i} className="bg-blue-900/20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div><div className="text-white font-medium">{official.name}</div><div className="text-yellow-500 text-sm">{official.title}</div></div>
                <div className="flex flex-col sm:flex-row gap-3 text-sm text-gray-400"><span className="flex items-center"><Phone className="w-3 h-3 mr-1" />{official.phone}</span><span className="flex items-center"><Mail className="w-3 h-3 mr-1" />{official.email}</span></div>
                <div className="flex space-x-2"><button className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400"><Edit3 className="w-4 h-4" /></button><button className="p-1.5 bg-red-500/20 rounded-lg text-red-400"><Trash2 className="w-4 h-4" /></button></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'banks' && (
        <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
          <div className="flex items-center justify-between mb-6"><h3 className="text-lg font-semibold text-white">🏦 Banka Hesaplari</h3><button className="btn-gold text-sm px-3 py-1.5 flex items-center"><Plus className="w-4 h-4 mr-1" />Ekle</button></div>
          <div className="space-y-4">
            {client.banks.map((bank, i) => (
              <div key={i} className="bg-blue-900/20 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2"><span className="text-white font-medium">{bank.bank}</span><span className="text-gray-400 text-sm">{bank.branch}</span></div>
                <div className="text-gray-300 text-sm font-mono bg-blue-950/50 rounded-lg p-2">IBAN: {bank.iban}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
          <h3 className="text-lg font-semibold text-white mb-4">📋 Gorevler</h3>
          <div className="space-y-3">
            {client.tasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between p-4 bg-blue-900/20 rounded-xl">
                <div className="flex items-center space-x-3"><div className={`w-2 h-2 rounded-full ${task.status === 'completed' ? 'bg-green-400' : 'bg-yellow-400'}`} /><div><div className="text-white">{task.task}</div><div className="text-gray-400 text-sm flex items-center"><Calendar className="w-3 h-3 mr-1" />{task.deadline}</div></div></div>
                <span className={`px-3 py-1 rounded-full text-xs ${task.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{task.status === 'completed' ? '✅ Tamamlandi' : '⏳ Bekliyor'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
          <div className="flex items-center justify-between mb-6"><h3 className="text-lg font-semibold text-white">📄 Evraklar</h3><button className="btn-gold text-sm px-3 py-1.5 flex items-center"><Plus className="w-4 h-4 mr-1" />Yukle</button></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[{ name: 'Temmuz 2026 Tahakkuk', type: 'PDF', date: '2026-07-12', size: '245 KB' }, { name: 'Haziran KDV Beyannamesi', type: 'PDF', date: '2026-06-25', size: '180 KB' }, { name: 'Imza Sirkuleri', type: 'PDF', date: '2026-05-10', size: '1.2 MB' }, { name: 'Vergi Levhasi', type: 'JPG', date: '2026-04-15', size: '890 KB' }, { name: 'Ticaret Sicil Gazetesi', type: 'PDF', date: '2026-03-20', size: '2.1 MB' }, { name: 'Faaliyet Belgesi', type: 'PDF', date: '2026-02-10', size: '450 KB' }].map((doc, i) => (
              <div key={i} className="bg-blue-900/20 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center space-x-3"><FileText className="w-8 h-8 text-yellow-500" /><div><div className="text-white text-sm font-medium truncate max-w-[150px]">{doc.name}</div><div className="text-gray-500 text-xs">{doc.date} • {doc.size}</div></div></div>
                <button className="text-gray-400 hover:text-white"><Download className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}