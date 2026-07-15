import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { 
  FileText, Download, Eye, Bell, CheckCircle, 
  AlertTriangle, Upload, FolderOpen, MessageSquare,
  User, Settings, Send, Receipt, CreditCard, Calendar,
  Phone, Mail, MapPin, Building2, Save
} from 'lucide-react'
import FileUploader from '../components/FileUploader'

export default function ClientPortal() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('documents')
  const [showProfileEdit, setShowProfileEdit] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  
  const [profile] = useState({
    name: user?.name || 'Kullanici',
    company: user?.company || user?.name || '',
    email: user?.email || user?.username || '',
    phone: user?.phone || '',
    address: user?.city || '',
    vkn: user?.vkn || user?.tc || '',
    taxOffice: user?.taxOffice || '',
  })

  const [messages, setMessages] = useState([
    { id: 1, from: 'Koray Bey (Mali Musavir)', text: 'Temmuz ayi tahakkukunuz hazir.', date: '2026-07-12', time: '10:30', type: 'received' },
    { id: 2, from: 'Siz', text: 'Tamam, kontrol ediyorum.', date: '2026-07-12', time: '11:00', type: 'sent' },
  ])

  const [invoices] = useState([
    { id: 1, number: 'MBS-2026-001', description: 'Temmuz 2026 Mali Musavirlik', amount: '7.500 ₺', date: '2026-07-01', status: 'paid' },
    { id: 2, number: 'MBS-2026-002', description: 'Haziran 2026 Mali Musavirlik', amount: '7.500 ₺', date: '2026-06-01', status: 'paid' },
  ])

  const [clientDocuments, setClientDocuments] = useState([
    { id: 1, name: 'Temmuz 2026 Tahakkuk', type: 'PDF', date: '2026-07-12', size: '245 KB' },
    { id: 2, name: 'Haziran 2026 KDV Beyannamesi', type: 'PDF', date: '2026-06-25', size: '180 KB' },
  ])

  const notifications = [
    { id: 1, message: 'Temmuz ayi tahakkukunuz hazir', date: '2026-07-12', type: 'info' },
    { id: 2, message: 'Gecici vergi beyannameniz onaylandi', date: '2026-06-20', type: 'success' },
  ]

  const tabs = [
    { id: 'documents', label: 'Evraklarim', icon: FolderOpen },
    { id: 'invoices', label: 'Faturalar', icon: Receipt },
    { id: 'messages', label: 'Mesajlar', icon: MessageSquare },
    { id: 'notifications', label: 'Bildirimler', icon: Bell },
    { id: 'upload', label: 'Evrak Yukle', icon: Upload },
    { id: 'profile', label: 'Profilim', icon: User },
  ]

  const handleSendMessage = () => {
    if (!newMessage.trim()) return
    setMessages([{ id: Date.now(), from: 'Siz', text: newMessage, date: new Date().toISOString().split('T')[0], time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }), type: 'sent' }, ...messages])
    setNewMessage('')
  }

  const handleEarsiv = () => window.open('https://earsivportal.efatura.gov.tr/intragiris.html', '_blank')
  const handleEfatura = () => {
    if (window.confirm('e-Fatura icin program indirilsin mi?')) window.open('https://ebelge.gib.gov.tr/EFaturaWebSocket/EFaturaWebSocket.jnlp', '_blank')
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-gradient-to-r from-blue-900/50 to-blue-800/30 rounded-2xl p-8 mb-8 border border-blue-800/30">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Hos Geldin, {user?.name || 'Kullanici'} 👋</h1>
            <p className="text-gray-400 mt-1">{user?.company || user?.name || ''}</p>
          </div>
          <div className="flex items-center space-x-4 mt-4 md:mt-0">
            {user?.earsiv && (
              <button onClick={handleEarsiv} className="bg-gradient-to-r from-orange-600 to-red-600 text-white text-sm px-4 py-2.5 rounded-lg flex items-center hover:from-orange-500 hover:to-red-500 transition-all whitespace-nowrap mr-2">
                📄 e-Arsiv Portal
              </button>
            )}
            {user?.efatura && (
              <button onClick={handleEfatura} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm px-4 py-2.5 rounded-lg flex items-center hover:from-blue-500 hover:to-indigo-500 transition-all whitespace-nowrap mr-2">
                📋 e-Fatura Indir
              </button>
            )}
            <div className="text-center"><div className="text-2xl font-bold text-yellow-500">{clientDocuments.length}</div><div className="text-gray-400 text-sm">Evrak</div></div>
            <div className="text-center"><div className="text-2xl font-bold text-green-400">{invoices.filter(i => i.status === 'paid').length}</div><div className="text-gray-400 text-sm">Odenen</div></div>
            <div className="text-center"><div className="text-2xl font-bold text-yellow-400">{invoices.filter(i => i.status === 'pending').length}</div><div className="text-gray-400 text-sm">Bekleyen</div></div>
          </div>
        </div>
      </div>

      <div className="flex space-x-1 bg-blue-950/40 rounded-xl p-1 mb-8 overflow-x-auto">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>
            <tab.icon className="w-4 h-4" /><span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'documents' && (
        <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30">
          <h3 className="text-xl font-semibold text-white mb-6">📄 Evraklarim</h3>
          <div className="overflow-x-auto"><table className="w-full"><thead><tr className="text-left text-gray-400 text-sm border-b border-blue-800/30"><th className="pb-3">Evrak Adi</th><th className="pb-3">Tur</th><th className="pb-3">Tarih</th><th className="pb-3">Boyut</th><th className="pb-3">Islem</th></tr></thead><tbody>{clientDocuments.map((doc) => (<tr key={doc.id} className="border-b border-blue-800/20 text-gray-300"><td className="py-4"><FileText className="w-5 h-5 text-yellow-500 inline mr-2" />{doc.name}</td><td className="py-4"><span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded text-xs">{doc.type}</span></td><td className="py-4">{doc.date}</td><td className="py-4">{doc.size}</td><td className="py-4"><div className="flex space-x-2"><button className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400"><Eye className="w-4 h-4" /></button><button className="p-1.5 bg-green-500/20 rounded-lg text-green-400"><Download className="w-4 h-4" /></button></div></td></tr>))}</tbody></table></div>
        </div>
      )}

      {activeTab === 'invoices' && (
        <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30">
          <div className="flex items-center justify-between mb-6"><h3 className="text-xl font-semibold text-white">🧾 Faturalarim</h3><div className="flex space-x-2 text-sm"><span className="text-green-400"><CheckCircle className="w-4 h-4 inline mr-1" />Odenen: {invoices.filter(i => i.status === 'paid').length}</span><span className="text-yellow-400 ml-3"><AlertTriangle className="w-4 h-4 inline mr-1" />Bekleyen: {invoices.filter(i => i.status === 'pending').length}</span></div></div>
          <div className="space-y-3">{invoices.map((inv) => (<div key={inv.id} className="bg-blue-900/20 rounded-xl p-5"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div className="flex items-center space-x-4"><div className={`p-3 rounded-xl ${inv.status === 'paid' ? 'bg-green-500/10' : 'bg-yellow-500/10'}`}><Receipt className={`w-6 h-6 ${inv.status === 'paid' ? 'text-green-400' : 'text-yellow-400'}`} /></div><div><div className="text-white font-medium">{inv.number}</div><div className="text-gray-400 text-sm">{inv.description}</div></div></div><div className="flex items-center space-x-6"><div className="text-right"><div className="text-white font-bold text-lg">{inv.amount}</div><div className="text-gray-500 text-xs"><Calendar className="w-3 h-3 inline mr-1" />{inv.date}</div></div><span className={`px-3 py-1 rounded-full text-xs font-medium ${inv.status === 'paid' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{inv.status === 'paid' ? '✅ Odendi' : '⏳ Bekliyor'}</span><button className="p-2 bg-blue-500/20 rounded-lg text-blue-400"><Download className="w-4 h-4" /></button></div></div></div>))}</div>
        </div>
      )}

      {activeTab === 'messages' && (
        <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30">
          <h3 className="text-xl font-semibold text-white mb-6">💬 Mesajlar</h3>
          <div className="flex space-x-3 mb-6"><input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="Mesajinizi yazin..." className="flex-1 bg-blue-900/40 border border-blue-700/50 rounded-xl py-3 px-4 text-white" /><button onClick={handleSendMessage} className="btn-gold px-4 py-2"><Send className="w-5 h-5" /></button></div>
          <div className="space-y-4">{messages.map((msg) => (<div key={msg.id} className={`flex ${msg.type === 'sent' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[80%] rounded-2xl p-4 ${msg.type === 'sent' ? 'bg-yellow-500/20 border border-yellow-500/30 ml-12' : 'bg-blue-900/40 border border-blue-700/30 mr-12'}`}><div className="flex justify-between mb-1"><span className="text-xs text-gray-400">{msg.from}</span><span className="text-xs text-gray-500">{msg.date} {msg.time}</span></div><p className="text-gray-200 text-sm">{msg.text}</p></div></div>))}</div>
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30">
          <h3 className="text-xl font-semibold text-white mb-6">🔔 Bildirimlerim</h3>
          <div className="space-y-4">{notifications.map((n) => (<div key={n.id} className="flex items-start space-x-4 p-4 bg-blue-900/20 rounded-xl"><div className={`p-2 rounded-lg ${n.type === 'warning' ? 'bg-yellow-500/20' : n.type === 'success' ? 'bg-green-500/20' : 'bg-blue-500/20'}`}>{n.type === 'warning' ? <AlertTriangle className="w-5 h-5 text-yellow-400" /> : n.type === 'success' ? <CheckCircle className="w-5 h-5 text-green-400" /> : <Bell className="w-5 h-5 text-blue-400" />}</div><div><p className="text-gray-300">{n.message}</p><span className="text-gray-500 text-sm">{n.date}</span></div></div>))}</div>
        </div>
      )}

      {activeTab === 'upload' && (
        <div className="bg-blue-950/30 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30">
          <h3 className="text-xl font-semibold text-white mb-6">📤 Evrak Yukle</h3>
          <FileUploader documents={clientDocuments} setDocuments={setClientDocuments} />
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="bg-blue-950/40 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/30">
          <div className="flex items-center justify-between mb-6"><h3 className="text-xl font-semibold text-white">👤 Profilim</h3><button onClick={() => setShowProfileEdit(!showProfileEdit)} className={`text-sm px-4 py-2 rounded-lg ${showProfileEdit ? 'btn-primary' : 'btn-gold'}`}>{showProfileEdit ? <><Save className="w-4 h-4 mr-2" />Kaydet</> : <><Settings className="w-4 h-4 mr-2" />Duzenle</>}</button></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { icon: User, label: 'Ad Soyad', value: user?.name || profile.name },
              { icon: Building2, label: 'Sirket', value: user?.company || profile.company },
              { icon: Mail, label: 'E-Posta', value: user?.email || profile.email },
              { icon: Phone, label: 'Telefon', value: user?.phone || profile.phone },
              { icon: MapPin, label: 'Sehir', value: user?.city || profile.address },
              { icon: CreditCard, label: user?.type === 'company' ? 'VKN' : 'TC', value: user?.vkn || user?.tc || profile.vkn },
              { icon: Building2, label: 'Vergi Dairesi', value: user?.taxOffice || profile.taxOffice },
              { icon: CheckCircle, label: 'e-Arsiv', value: user?.earsiv ? '✅ Evet' : '❌ Hayir' },
              { icon: FileText, label: 'e-Fatura', value: user?.efatura ? '✅ Evet' : '❌ Hayir' },
            ].map((item, i) => (
              <div key={i} className="bg-blue-900/20 rounded-xl p-4">
                <div className="flex items-center space-x-3 mb-2"><item.icon className="w-4 h-4 text-gray-500" /><span className="text-gray-400 text-sm">{item.label}</span></div>
                <p className="text-white font-medium">{item.value || '-'}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}