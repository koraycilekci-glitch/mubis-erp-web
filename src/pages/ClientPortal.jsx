import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { 
  FileText, Download, Eye, Bell, CheckCircle, 
  AlertTriangle, Upload, FolderOpen, MessageSquare,
  User, Settings, Send, Receipt, CreditCard, Calendar,
  Phone, Mail, MapPin, Building2, Save, DollarSign, Copy, ExternalLink
} from 'lucide-react'
import FileUploader from '../components/FileUploader'
import { getAccountingFee, getPayments, hesaplaBorcOzeti, BANKA_BILGILERI } from '../services/paymentService'

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

  // Muhasebe borcu
  const [accountingFee, setAccountingFee] = useState(null)
  const [myPayments, setMyPayments] = useState([])
  const [showBankaModal, setShowBankaModal] = useState(false)
  const [showKrediKartiModal, setShowKrediKartiModal] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [ibanCopied, setIbanCopied] = useState(false)
  const [cardForm, setCardForm] = useState({ cardOwner: '', cardNumber: '', expiryMonth: '', expiryYear: '', cvv: '' })

  useEffect(() => {
    if (user?.clientId) {
      loadBorcData()
    }
  }, [user])

  const loadBorcData = async () => {
    try {
      const [fee, payments] = await Promise.all([
        getAccountingFee(user.clientId),
        getPayments(user.clientId)
      ])
      setAccountingFee(fee)
      setMyPayments(payments)
    } catch (err) {
      console.error('Borc veri yukleme hatasi:', err)
    }
  }

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
    { id: 'borc', label: 'Muhasebe Borcu', icon: DollarSign },
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

  const handleCopyIban = () => {
    navigator.clipboard.writeText(BANKA_BILGILERI.iban.replace(/\s/g, ''))
    setIbanCopied(true)
    setTimeout(() => setIbanCopied(false), 2000)
  }

  const handleKrediKartiOde = async () => {
    if (!paymentAmount || Number(paymentAmount) <= 0) {
      alert('Gecerli bir tutar girin')
      return
    }
    if (!cardForm.cardNumber || !cardForm.expiryMonth || !cardForm.expiryYear || !cardForm.cvv) {
      alert('Kart bilgilerini eksiksiz girin')
      return
    }
    setPaymentLoading(true)
    try {
      const res = await fetch('/api/paytr-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(paymentAmount),
          clientId: user?.clientId || '',
          customerName: user?.name || user?.company || '',
          customerEmail: user?.email || '',
          cardOwner: cardForm.cardOwner,
          cardNumber: cardForm.cardNumber.replace(/\s/g, ''),
          expiryMonth: cardForm.expiryMonth,
          expiryYear: cardForm.expiryYear,
          cvv: cardForm.cvv,
          installmentCount: '0',
          testMode: false
        })
      })
      const data = await res.json()
      if (data.success) {
        if (data.redirect3d) {
          // 3D Secure yonlendirme - yeni pencerede ac
          const w = window.open('', '_blank')
          if (w) {
            w.document.write(data.redirect3d)
            w.document.close()
          }
          setShowKrediKartiModal(false)
          setCardForm({ cardOwner: '', cardNumber: '', expiryMonth: '', expiryYear: '', cvv: '' })
          alert('3D Secure dogrulama icin yeni pencere acildi. Islem sonrasi bu sayfa otomatik guncellenecek.')
        } else {
          alert('Odeme islemi basariyla gonderildi!')
          setShowKrediKartiModal(false)
          setCardForm({ cardOwner: '', cardNumber: '', expiryMonth: '', expiryYear: '', cvv: '' })
          loadBorcData()
        }
      } else {
        alert(data.error || 'Odeme basarisiz')
      }
    } catch (err) {
      alert('Odeme istegi gonderilemedi: ' + err.message)
    } finally {
      setPaymentLoading(false)
    }
  }

  const borcOzeti = hesaplaBorcOzeti(accountingFee, myPayments)
  const fmt = (n) => Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })

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

      {/* ==================== MUHASEBE BORCU TAB ==================== */}
      {activeTab === 'borc' && (
        <div className="space-y-6">
          {/* Borc Ozeti Karti */}
          <div className="bg-gradient-to-br from-blue-900/50 to-blue-800/30 rounded-2xl p-6 border border-blue-700/30">
            <h3 className="text-xl font-semibold text-white flex items-center space-x-2 mb-6">
              <DollarSign className="w-6 h-6 text-yellow-400" />
              <span>Muhasebe Borc Durumunuz</span>
            </h3>

            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-blue-700/20">
                <span className="text-gray-400">Onceki Donem Borcu:</span>
                <span className="text-orange-400 font-semibold">{fmt(borcOzeti.oncekiDonem)} TL</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-blue-700/20">
                <span className="text-gray-400">Defter Tasdik Ucreti:</span>
                <span className="text-blue-400 font-semibold">{fmt(borcOzeti.defterTasdik)} TL</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-blue-700/20">
                <span className="text-gray-400">Aylik Ucret ({borcOzeti.gecenAy} ay x {fmt(borcOzeti.aylikUcret)}):</span>
                <span className="text-yellow-400 font-semibold">{fmt(borcOzeti.aylikToplam)} TL</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-blue-700/30">
                <span className="text-white font-medium">Toplam Borc:</span>
                <span className="text-white font-bold text-lg">{fmt(borcOzeti.toplamBorc)} TL</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-blue-700/20">
                <span className="text-green-400">Odenen:</span>
                <span className="text-green-400 font-semibold">-{fmt(borcOzeti.toplamOdeme)} TL</span>
              </div>
              <div className="flex justify-between items-center py-3 bg-blue-900/30 rounded-xl px-4 mt-2">
                <span className="text-white font-bold text-lg">KALAN BORC:</span>
                <span className={`font-bold text-2xl ${borcOzeti.kalanBorc > 0 ? 'text-red-400' : 'text-green-400'}`}>{fmt(borcOzeti.kalanBorc)} TL</span>
              </div>
              {borcOzeti.sonOdeme && (
                <p className="text-gray-500 text-sm text-center mt-2">Son Odeme: {new Date(borcOzeti.sonOdeme).toLocaleDateString('tr-TR')}</p>
              )}
            </div>

            {/* Odeme Butonlari */}
            {borcOzeti.kalanBorc > 0 && (
              <div className="flex flex-col sm:flex-row gap-3 mt-6">
                <button onClick={() => setShowBankaModal(true)}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-6 rounded-xl font-semibold flex items-center justify-center space-x-2 hover:from-blue-500 hover:to-blue-600 transition-all">
                  <Building2 className="w-5 h-5" /><span>EFT / Havale ile Ode</span>
                </button>
                <button onClick={() => { setPaymentAmount(String(borcOzeti.kalanBorc)); setShowKrediKartiModal(true) }}
                  className="flex-1 bg-gradient-to-r from-yellow-500 to-yellow-600 text-blue-950 py-3 px-6 rounded-xl font-semibold flex items-center justify-center space-x-2 hover:from-yellow-400 hover:to-yellow-500 transition-all">
                  <CreditCard className="w-5 h-5" /><span>Kredi Karti ile Ode</span>
                </button>
              </div>
            )}
          </div>

          {/* Odeme Gecmisi */}
          {myPayments.length > 0 && (
            <div className="bg-blue-950/40 rounded-2xl p-6 border border-blue-800/30">
              <h3 className="text-lg font-semibold text-white mb-4">Odeme Gecmisi</h3>
              <div className="space-y-2">
                {myPayments.map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-blue-900/20 rounded-xl p-3">
                    <div>
                      <p className="text-white text-sm font-medium">{new Date(p.odeme_tarihi).toLocaleDateString('tr-TR')}</p>
                      <p className="text-gray-500 text-xs">{p.aciklama || (p.odeme_tipi === 'eft' ? 'EFT/Havale' : p.odeme_tipi === 'kredi_karti' ? 'Kredi Karti' : 'Nakit')}</p>
                    </div>
                    <span className="text-green-400 font-bold">{fmt(p.tutar)} TL</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Banka Bilgileri Modal */}
          {showBankaModal && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowBankaModal(false)}>
              <div className="bg-blue-950 rounded-2xl p-8 max-w-md w-full border border-blue-700/30" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-white mb-6 flex items-center space-x-2">
                  <Building2 className="w-6 h-6 text-blue-400" /><span>EFT / Havale Bilgileri</span>
                </h3>
                <div className="space-y-4">
                  <div className="bg-blue-900/30 rounded-xl p-4">
                    <p className="text-gray-400 text-xs mb-1">Banka</p>
                    <p className="text-white font-medium">{BANKA_BILGILERI.banka}</p>
                  </div>
                  <div className="bg-blue-900/30 rounded-xl p-4">
                    <p className="text-gray-400 text-xs mb-1">Hesap Sahibi</p>
                    <p className="text-white font-medium">{BANKA_BILGILERI.hesapSahibi}</p>
                  </div>
                  <div className="bg-blue-900/30 rounded-xl p-4">
                    <p className="text-gray-400 text-xs mb-1">IBAN</p>
                    <div className="flex items-center justify-between">
                      <p className="text-yellow-400 font-mono font-bold text-lg">{BANKA_BILGILERI.iban}</p>
                      <button onClick={handleCopyIban} className={`ml-2 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1 transition-colors ${ibanCopied ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'}`}>
                        <Copy className="w-3.5 h-3.5" /><span>{ibanCopied ? 'Kopyalandi!' : 'Kopyala'}</span>
                      </button>
                    </div>
                  </div>
                  <div className="bg-blue-900/30 rounded-xl p-4">
                    <p className="text-gray-400 text-xs mb-1">Aciklama</p>
                    <p className="text-white font-medium">{user?.name || user?.company || ''} Muhasebe Ucreti</p>
                  </div>
                </div>
                <button onClick={() => setShowBankaModal(false)} className="mt-6 w-full bg-blue-700 text-white py-2.5 rounded-lg font-medium hover:bg-blue-600 transition-colors">Kapat</button>
              </div>
            </div>
          )}

          {/* Kredi Karti Modal - PayTR Direkt API */}
          {showKrediKartiModal && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowKrediKartiModal(false)}>
              <div className="bg-blue-950 rounded-2xl p-8 max-w-md w-full border border-blue-700/30" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-white mb-6 flex items-center space-x-2">
                  <CreditCard className="w-6 h-6 text-yellow-400" /><span>Kredi Karti ile Odeme</span>
                </h3>

                {/* Tutar */}
                <div className="mb-4">
                  <label className="block text-gray-400 text-sm mb-1">Odeme Tutari (TL)</label>
                  <input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-3 px-4 text-white text-xl font-bold text-center focus:outline-none focus:border-yellow-400" />
                </div>

                {/* Kart Bilgileri */}
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="block text-gray-400 text-xs mb-1">Kart Uzerindeki Isim</label>
                    <input type="text" value={cardForm.cardOwner} onChange={(e) => setCardForm({...cardForm, cardOwner: e.target.value.toUpperCase()})}
                      placeholder="AD SOYAD"
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-4 text-white focus:outline-none focus:border-yellow-400 uppercase" />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-xs mb-1">Kart Numarasi</label>
                    <input type="text" value={cardForm.cardNumber} maxLength={19}
                      onChange={(e) => {
                        let v = e.target.value.replace(/\D/g, '').slice(0, 16)
                        v = v.replace(/(.{4})/g, '$1 ').trim()
                        setCardForm({...cardForm, cardNumber: v})
                      }}
                      placeholder="0000 0000 0000 0000"
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-4 text-white font-mono text-lg tracking-wider focus:outline-none focus:border-yellow-400" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-gray-400 text-xs mb-1">Ay</label>
                      <select value={cardForm.expiryMonth} onChange={(e) => setCardForm({...cardForm, expiryMonth: e.target.value})}
                        className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-3 text-white focus:outline-none focus:border-yellow-400">
                        <option value="">AA</option>
                        {Array.from({length: 12}, (_, i) => String(i+1).padStart(2, '0')).map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-gray-400 text-xs mb-1">Yil</label>
                      <select value={cardForm.expiryYear} onChange={(e) => setCardForm({...cardForm, expiryYear: e.target.value})}
                        className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-3 text-white focus:outline-none focus:border-yellow-400">
                        <option value="">YY</option>
                        {Array.from({length: 10}, (_, i) => String(26 + i)).map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-gray-400 text-xs mb-1">CVV</label>
                      <input type="password" value={cardForm.cvv} maxLength={4}
                        onChange={(e) => setCardForm({...cardForm, cvv: e.target.value.replace(/\D/g, '').slice(0, 4)})}
                        placeholder="***"
                        className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2.5 px-3 text-white text-center font-mono focus:outline-none focus:border-yellow-400" />
                    </div>
                  </div>
                </div>

                {/* Gonder */}
                <button onClick={handleKrediKartiOde} disabled={paymentLoading}
                  className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 text-blue-950 py-3 rounded-xl font-bold flex items-center justify-center space-x-2 hover:from-yellow-400 hover:to-yellow-500 transition-all disabled:opacity-50 text-lg">
                  <CreditCard className="w-5 h-5" />
                  <span>{paymentLoading ? 'Odeme Isleniyor...' : `${fmt(Number(paymentAmount) || 0)} TL Ode`}</span>
                </button>

                <p className="text-gray-500 text-xs text-center mt-3">Odemeniz 3D Secure ile guvenli sekilde islenecektir.</p>

                <button onClick={() => { setShowKrediKartiModal(false); setCardForm({ cardOwner: '', cardNumber: '', expiryMonth: '', expiryYear: '', cvv: '' }) }}
                  className="mt-3 w-full bg-gray-700/50 text-gray-400 py-2 rounded-lg text-sm hover:bg-gray-700/70 transition-colors">Iptal</button>
              </div>
            </div>
          )}
        </div>
      )}

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