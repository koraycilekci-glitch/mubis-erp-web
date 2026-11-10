import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Phone, MapPin, Send, Building, ExternalLink } from 'lucide-react'
import { OFIS, HARITA_URL, HARITA_EMBED_URL } from '../data/ofisBilgi'

export default function Contact() {
  const [formData, setFormData] = useState({ name: '', email: '', message: '' })
  const [kvkkOnay, setKvkkOnay] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!kvkkOnay) return
    setSubmitted(true)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="text-center mb-16">
        <h1 className="text-5xl font-black text-white mb-6">İletişim</h1>
        <p className="text-xl text-gray-400">MUBİS ERP hakkında sorularınız için bize ulaşın</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div>
          <div className="space-y-4">
            <div className="flex items-start space-x-4 bg-blue-950/30 rounded-xl p-4 border border-blue-800/30">
              <div className="bg-gradient-to-br from-blue-500/20 to-yellow-500/20 p-3 rounded-xl flex-shrink-0">
                <Building className="w-6 h-6 text-yellow-500" />
              </div>
              <div>
                <div className="text-gray-400 text-sm">Yetkili</div>
                <div className="text-white">{OFIS.unvan}</div>
              </div>
            </div>

            <a
              href={HARITA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start space-x-4 bg-blue-950/30 rounded-xl p-4 border border-blue-800/30 hover:border-yellow-500/40 transition-colors group"
            >
              <div className="bg-gradient-to-br from-blue-500/20 to-yellow-500/20 p-3 rounded-xl flex-shrink-0">
                <MapPin className="w-6 h-6 text-yellow-500" />
              </div>
              <div>
                <div className="text-gray-400 text-sm">Adres</div>
                <div className="text-white group-hover:text-yellow-400 transition-colors">{OFIS.adres}</div>
                <span className="inline-flex items-center gap-1 text-yellow-500 text-xs mt-1">
                  Haritada aç <ExternalLink className="w-3 h-3" />
                </span>
              </div>
            </a>

            <a
              href={OFIS.telefonHref}
              className="flex items-start space-x-4 bg-blue-950/30 rounded-xl p-4 border border-blue-800/30 hover:border-yellow-500/40 transition-colors group"
            >
              <div className="bg-gradient-to-br from-blue-500/20 to-yellow-500/20 p-3 rounded-xl flex-shrink-0">
                <Phone className="w-6 h-6 text-yellow-500" />
              </div>
              <div>
                <div className="text-gray-400 text-sm">Telefon</div>
                <div className="text-white group-hover:text-yellow-400 transition-colors">{OFIS.telefon}</div>
              </div>
            </a>

            <a
              href={OFIS.emailHref}
              className="flex items-start space-x-4 bg-blue-950/30 rounded-xl p-4 border border-blue-800/30 hover:border-yellow-500/40 transition-colors group"
            >
              <div className="bg-gradient-to-br from-blue-500/20 to-yellow-500/20 p-3 rounded-xl flex-shrink-0">
                <Mail className="w-6 h-6 text-yellow-500" />
              </div>
              <div>
                <div className="text-gray-400 text-sm">E-posta</div>
                <div className="text-white group-hover:text-yellow-400 transition-colors">{OFIS.email}</div>
              </div>
            </a>

            <div className="bg-blue-950/30 rounded-xl border border-blue-800/30 overflow-hidden">
              <iframe
                title="Ofis konumu"
                src={HARITA_EMBED_URL}
                className="w-full h-64 border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
          </div>
        </div>

        <div className="bg-blue-950/30 backdrop-blur-sm rounded-2xl p-8 border border-blue-800/30">
          {submitted ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">✅</div>
              <h3 className="text-2xl font-bold text-white mb-2">Mesajınız Alındı!</h3>
              <p className="text-gray-400">En kısa sürede size dönüş yapacağız.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="text-gray-400 text-sm block mb-2">Ad Soyad</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 transition-colors"
                  placeholder="Adınız Soyadınız" required />
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-2">Email</label>
                <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 transition-colors"
                  placeholder="ornek@email.com" required />
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-2">Mesaj</label>
                <textarea value={formData.message} onChange={(e) => setFormData({ ...formData, message: e.target.value })} rows={5}
                  className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 transition-colors resize-none"
                  placeholder="Mesajınızı yazın..." required />
              </div>
              <label className="flex items-start gap-2.5 text-xs text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={kvkkOnay}
                  onChange={(e) => setKvkkOnay(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-yellow-500 shrink-0"
                  required
                />
                <span>
                  <Link to="/kvkk-aydinlatma" target="_blank" className="text-yellow-400 hover:underline">KVKK Aydınlatma Metni</Link>'ni okudum;
                  iletişim talebime yanıt verilmesi amacıyla kişisel verilerimin işlenmesine{' '}
                  <strong className="text-gray-300">açık rıza</strong> veriyorum.
                </span>
              </label>
              <button type="submit" disabled={!kvkkOnay} className="btn-gold w-full py-3 text-lg flex items-center justify-center space-x-2 disabled:opacity-40 disabled:cursor-not-allowed">
                <Send className="w-5 h-5" />
                <span>Gönder</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}