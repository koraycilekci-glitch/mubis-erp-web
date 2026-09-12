import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useClients } from '../hooks/useClients'
import { useAuth } from '../context/AuthContext'
import {
  MessageSquareText, Send, Search, RefreshCw, CheckCircle, AlertTriangle,
  Paperclip, Calendar, User, Bot, MessageCircle, Mail, Eye, Bell, Clock
} from 'lucide-react'
import {
  ONCELIKLER, AKSIYONLAR, asistanMetniOlustur, sendMessageToClient,
  getMessages, getMessageSummaryByClient, markAllAsRead
} from '../services/messageService'
import { openWhatsAppWeb } from '../services/whatsappService'

const HAZIR_SABLONLAR = [
  {
    id: 'kdv_belge',
    baslik: 'KDV belge talebi',
    metin: 'KDV beyannamesi için alış ve satış faturalarınızı göndermenizi rica ederim.',
    aksiyon: 'belge_talebi',
    oncelik: 'onemli'
  },
  {
    id: 'muhtasar',
    baslik: 'Muhtasar hatırlatma',
    metin: 'Muhtasar beyannamenizin son günü yaklaşmaktadır. Gerekli belgeleri bugün göndermenizi rica ederim.',
    aksiyon: 'belge_talebi',
    oncelik: 'acil'
  },
  {
    id: 'sgk',
    baslik: 'SGK bildirimi',
    metin: 'SGK bildirgeniz hazırlanmıştır. Prim ödemenizi son ödeme tarihine kadar yapmanızı rica ederiz.',
    aksiyon: 'odeme',
    oncelik: 'onemli'
  },
  {
    id: 'beyanname_onay',
    baslik: 'Beyanname onayı',
    metin: 'Beyannameniz hazırlanmıştır. Portal üzerinden kontrol edip onaylamanızı rica ederiz.',
    aksiyon: 'beyanname_onay',
    oncelik: 'normal'
  },
  {
    id: 'ucret',
    baslik: 'Muhasebe ücreti',
    metin: 'Muhasebe ücreti ödemeniz ile ilgili bilgi almak isteriz. Detayları portal üzerinden görebilirsiniz.',
    aksiyon: 'odeme',
    oncelik: 'normal'
  },
  {
    id: 'evrak_eksik',
    baslik: 'Eksik evrak',
    metin: 'Bu döneme ait bazı evraklarınız tarafımıza ulaşmamıştır. Eksik belgeleri yüklemenizi rica ederiz.',
    aksiyon: 'belge_talebi',
    oncelik: 'onemli'
  }
]

const ONCELIK_STIL = {
  normal: 'bg-green-500/15 text-green-300 border-green-500/30',
  onemli: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  acil: 'bg-red-500/15 text-red-300 border-red-500/30'
}

export default function MesajMerkezi() {
  const { clients, loading: clientsLoading } = useClients()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [arama, setArama] = useState('')
  const [seciliId, setSeciliId] = useState(null)
  const [ozet, setOzet] = useState({})
  const [mesajlar, setMesajlar] = useState([])
  const [mesajYukleniyor, setMesajYukleniyor] = useState(false)

  // Form
  const [metin, setMetin] = useState('')
  const [oncelik, setOncelik] = useState('normal')
  const [aksiyon, setAksiyon] = useState('none')
  const [sonTarih, setSonTarih] = useState('')
  const [kanallar, setKanallar] = useState(['portal'])
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [sonuc, setSonuc] = useState(null)

  const listeSonu = useRef(null)

  const seciliMusteri = useMemo(
    () => clients.find(c => String(c.id) === String(seciliId)) || null,
    [clients, seciliId]
  )

  const kisaAd = (user?.name || user?.username || 'Yönetici').split(' ')[0]

  useEffect(() => { loadOzet() }, [])
  useEffect(() => { if (seciliId) loadMesajlar(seciliId) }, [seciliId])
  useEffect(() => { listeSonu.current?.scrollIntoView({ behavior: 'smooth' }) }, [mesajlar])

  // Bildirimden gelindiyse (?clientId=...) ilgili musteriyi otomatik sec
  useEffect(() => {
    const cid = searchParams.get('clientId')
    if (cid) {
      setSeciliId(cid)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams])

  const loadOzet = async () => {
    setOzet(await getMessageSummaryByClient())
  }

  const loadMesajlar = async (id) => {
    setMesajYukleniyor(true)
    const data = await getMessages(id)
    setMesajlar(data)
    setMesajYukleniyor(false)
    markAllAsRead(id, 'client').then(loadOzet)
  }

  const filtreliMusteriler = useMemo(() => {
    const q = arama.trim().toLowerCase()
    const liste = q
      ? clients.filter(c =>
          (c.name || '').toLowerCase().includes(q) ||
          (c.company || '').toLowerCase().includes(q) ||
          String(c.vkn || '').includes(q) ||
          String(c.tc || '').includes(q))
      : clients
    return [...liste].sort((a, b) => {
      const ao = ozet[a.id]?.okunmamis || 0
      const bo = ozet[b.id]?.okunmamis || 0
      if (ao !== bo) return bo - ao
      const at = ozet[a.id]?.sonMesaj?.created_at || ''
      const bt = ozet[b.id]?.sonMesaj?.created_at || ''
      return bt.localeCompare(at)
    })
  }, [clients, arama, ozet])

  const onizleme = useMemo(() => {
    if (!metin.trim()) return ''
    return asistanMetniOlustur({
      message: metin,
      priority: oncelik,
      actionType: aksiyon,
      dueDate: sonTarih || null,
      clientName: seciliMusteri?.name || '',
      senderName: `${kisaAd} (SMMM)`
    })
  }, [metin, oncelik, aksiyon, sonTarih, seciliMusteri, kisaAd])

  const kanalDegistir = (k) => {
    setKanallar(prev => {
      if (k === 'portal') return prev
      return prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]
    })
  }

  const sablonUygula = (s) => {
    setMetin(s.metin)
    setAksiyon(s.aksiyon)
    setOncelik(s.oncelik)
  }

  const gonder = async () => {
    if (!seciliMusteri) { setSonuc({ tip: 'hata', mesaj: 'Önce bir müşteri seçin' }); return }
    if (!metin.trim()) { setSonuc({ tip: 'hata', mesaj: 'Mesaj boş olamaz' }); return }

    setGonderiliyor(true)
    setSonuc(null)
    try {
      const r = await sendMessageToClient({
        clientId: seciliMusteri.id,
        clientName: seciliMusteri.name,
        message: metin,
        priority: oncelik,
        actionType: aksiyon,
        dueDate: sonTarih || null,
        channels: kanallar,
        senderName: kisaAd
      })

      // WhatsApp secildiyse hazir metinle WhatsApp Web acilir
      if (kanallar.includes('whatsapp')) {
        const tel = seciliMusteri.phone || seciliMusteri.phonenumbers?.[0]?.phone
        if (tel) {
          openWhatsAppWeb({ phone: tel, message: r.message.assistant_message })
        }
      }

      let bilgi = 'Mesaj asistan üzerinden müşteriye iletildi.'
      if (r.email?.gonderildi) bilgi += ` E-posta: ${r.email.adres}`
      if (r.email && !r.email.gonderildi) bilgi += ` (E-posta gönderilemedi: ${r.email.hata})`
      setSonuc({ tip: 'ok', mesaj: bilgi })
      setMetin('')
      setSonTarih('')
      setAksiyon('none')
      setOncelik('normal')
      loadMesajlar(seciliMusteri.id)
      loadOzet()
    } catch (e) {
      setSonuc({ tip: 'hata', mesaj: e.message })
    }
    setGonderiliyor(false)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Baslik */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
          <MessageSquareText className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Mesaj Merkezi</h1>
          <p className="text-blue-200/60 text-sm">Mesajlarınız MUBİS Asistan üzerinden müşteriye iletilir</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ══ MUSTERI LISTESI ══ */}
        <div className="lg:col-span-4 xl:col-span-3">
          <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden">
            <div className="p-3 border-b border-blue-700/30">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={arama}
                  onChange={e => setArama(e.target.value)}
                  placeholder="Müşteri ara..."
                  className="w-full bg-blue-950/50 border border-blue-800/40 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>
            <div className="max-h-[640px] overflow-y-auto">
              {clientsLoading && (
                <div className="p-6 text-center text-gray-400 text-sm">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                  Müşteriler yükleniyor...
                </div>
              )}
              {!clientsLoading && filtreliMusteriler.length === 0 && (
                <div className="p-6 text-center text-gray-500 text-sm">Müşteri bulunamadı</div>
              )}
              {filtreliMusteriler.map(c => {
                const o = ozet[c.id]
                const aktif = String(c.id) === String(seciliId)
                return (
                  <button
                    key={c.id}
                    onClick={() => setSeciliId(c.id)}
                    className={`w-full text-left px-4 py-3 border-b border-blue-800/20 transition-colors ${
                      aktif ? 'bg-blue-600/25' : 'hover:bg-blue-800/25'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-700/40 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {(c.name || '?').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-sm font-medium truncate">{c.name}</div>
                        <div className="text-gray-400 text-xs truncate">
                          {o?.sonMesaj ? (o.sonMesaj.sender === 'admin' ? 'Siz: ' : '') + o.sonMesaj.message : (c.company || 'Henüz mesaj yok')}
                        </div>
                      </div>
                      {o?.okunmamis > 0 && (
                        <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1.5 flex items-center justify-center">
                          {o.okunmamis}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* ══ SOHBET + FORM ══ */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-6">
          {!seciliMusteri && (
            <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 p-12 text-center">
              <Bot className="w-12 h-12 text-blue-400/60 mx-auto mb-4" />
              <h2 className="text-white font-semibold mb-1">Mesaj göndermek için müşteri seçin</h2>
              <p className="text-gray-400 text-sm">
                Yazdığınız mesaj MUBİS Asistan tarafından müşteriye iletilir.
              </p>
            </div>
          )}

          {seciliMusteri && (
            <>
              {/* Sohbet gecmisi */}
              <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-blue-700/30 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                      {(seciliMusteri.name || '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-white text-sm font-semibold">{seciliMusteri.name}</div>
                      <div className="text-gray-400 text-xs">{seciliMusteri.company || seciliMusteri.vkn || ''}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => loadMesajlar(seciliMusteri.id)}
                    className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-blue-800/40"
                    title="Yenile"
                  >
                    <RefreshCw className={`w-4 h-4 ${mesajYukleniyor ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <div className="p-4 space-y-3 max-h-[340px] overflow-y-auto">
                  {mesajlar.length === 0 && !mesajYukleniyor && (
                    <div className="text-center text-gray-500 text-sm py-8">Bu müşteriyle henüz mesajlaşma yok</div>
                  )}
                  {mesajlar.map(m => {
                    const bizden = m.sender === 'admin'
                    return (
                      <div key={m.id} className={`flex ${bizden ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                          bizden
                            ? 'bg-blue-600 text-white rounded-br-md'
                            : 'bg-blue-950/60 text-gray-100 border border-blue-800/40 rounded-bl-md'
                        }`}>
                          {bizden && m.priority !== 'normal' && (
                            <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border mb-1.5 ${ONCELIK_STIL[m.priority]}`}>
                              {m.priority === 'acil' ? 'ACİL' : 'ÖNEMLİ'}
                            </span>
                          )}
                          <div className="text-sm whitespace-pre-wrap leading-relaxed">{m.message}</div>
                          {m.due_date && (
                            <div className="mt-2 text-[11px] flex items-center gap-1 opacity-80">
                              <Calendar className="w-3 h-3" />
                              Son tarih: {new Date(m.due_date).toLocaleDateString('tr-TR')}
                            </div>
                          )}
                          <div className="mt-1.5 text-[10px] opacity-60 flex items-center gap-2">
                            {bizden && m.sender_name && <span>{m.sender_name}</span>}
                            <span>{new Date(m.created_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                            {bizden && m.is_read && <span className="text-green-300">okundu</span>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={listeSonu} />
                </div>
              </div>

              {/* Yeni mesaj formu */}
              <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 p-5">
                <h2 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
                  <Send className="w-4 h-4 text-yellow-400" />
                  Yeni Mesaj
                </h2>

                {/* Hazir sablonlar */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {HAZIR_SABLONLAR.map(s => (
                    <button
                      key={s.id}
                      onClick={() => sablonUygula(s)}
                      className="px-3 py-1.5 rounded-lg bg-blue-950/50 border border-blue-800/40 text-blue-200 text-xs hover:border-blue-600/60 hover:text-white transition-colors"
                    >
                      {s.baslik}
                    </button>
                  ))}
                </div>

                <textarea
                  value={metin}
                  onChange={e => setMetin(e.target.value)}
                  rows={4}
                  placeholder="Müşteriye iletmek istediğiniz mesajı yazın..."
                  className="w-full bg-blue-950/50 border border-blue-800/40 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-600 resize-none mb-4"
                />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-gray-400 text-xs mb-1.5">Aciliyet</label>
                    <div className="flex gap-1.5">
                      {ONCELIKLER.map(o => (
                        <button
                          key={o.id}
                          onClick={() => setOncelik(o.id)}
                          className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium border transition-all ${
                            oncelik === o.id ? ONCELIK_STIL[o.id] : 'bg-blue-950/40 text-gray-400 border-blue-800/40'
                          }`}
                        >
                          {o.ikon} {o.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-gray-400 text-xs mb-1.5">Aksiyon Butonu</label>
                    <select
                      value={aksiyon}
                      onChange={e => setAksiyon(e.target.value)}
                      className="w-full bg-blue-950/50 border border-blue-800/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-600"
                    >
                      {AKSIYONLAR.map(a => (
                        <option key={a.id} value={a.id}>{a.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-400 text-xs mb-1.5">Son Tarih</label>
                    <input
                      type="date"
                      value={sonTarih}
                      onChange={e => setSonTarih(e.target.value)}
                      className="w-full bg-blue-950/50 border border-blue-800/40 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                {/* Kanallar */}
                <div className="mb-4">
                  <label className="block text-gray-400 text-xs mb-1.5">Gönderim Kanalları</label>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-2 rounded-lg bg-blue-600/25 border border-blue-500/40 text-blue-200 text-xs font-medium flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5" /> MUBİS Asistan (her zaman)
                    </span>
                    <button
                      onClick={() => kanalDegistir('whatsapp')}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all ${
                        kanallar.includes('whatsapp')
                          ? 'bg-green-500/20 text-green-300 border-green-500/40'
                          : 'bg-blue-950/40 text-gray-400 border-blue-800/40'
                      }`}
                    >
                      <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                    </button>
                    <button
                      onClick={() => kanalDegistir('email')}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all ${
                        kanallar.includes('email')
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                          : 'bg-blue-950/40 text-gray-400 border-blue-800/40'
                      }`}
                    >
                      <Mail className="w-3.5 h-3.5" /> E-posta
                    </button>
                  </div>
                </div>

                {/* Onizleme */}
                {onizleme && (
                  <div className="bg-blue-950/50 border border-blue-800/40 rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Eye className="w-3.5 h-3.5 text-yellow-400" />
                      <span className="text-yellow-400 text-xs font-semibold">Müşteri bu şekilde görecek</span>
                    </div>
                    <pre className="text-gray-200 text-xs whitespace-pre-wrap font-sans leading-relaxed">{onizleme}</pre>
                    {aksiyon !== 'none' && (
                      <div className="mt-3 inline-flex items-center gap-1.5 bg-blue-600 text-white text-xs font-medium px-3 py-2 rounded-lg">
                        <Paperclip className="w-3.5 h-3.5" />
                        {AKSIYONLAR.find(a => a.id === aksiyon)?.buton}
                      </div>
                    )}
                  </div>
                )}

                {sonuc && (
                  <div className={`rounded-xl p-3 mb-4 flex items-start gap-2 text-sm ${
                    sonuc.tip === 'ok'
                      ? 'bg-green-500/15 border border-green-500/40 text-green-300'
                      : 'bg-red-500/15 border border-red-500/40 text-red-300'
                  }`}>
                    {sonuc.tip === 'ok' ? <CheckCircle className="w-4 h-4 mt-0.5" /> : <AlertTriangle className="w-4 h-4 mt-0.5" />}
                    <span>{sonuc.mesaj}</span>
                  </div>
                )}

                <button
                  onClick={gonder}
                  disabled={gonderiliyor || !metin.trim()}
                  className="btn-gold px-6 py-3 flex items-center gap-2 disabled:opacity-50"
                >
                  {gonderiliyor ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Asistan ile Gönder
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
