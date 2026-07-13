import { useState } from 'react'
import { Mail, Phone, MapPin, Send } from 'lucide-react'

export default function Contact() {
  const [formData, setFormData] = useState({ name: '', email: '', message: '' })
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
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
          <div className="space-y-6">
            {[
              { icon: Mail, label: 'Email', value: 'info@mubiserp.com' },
              { icon: Phone, label: 'Telefon', value: '+90 (212) 555 66 77' },
              { icon: MapPin, label: 'Adres', value: 'İstanbul, Türkiye' },
            ].map((item, index) => (
              <div key={index} className="flex items-center space-x-4 bg-blue-950/30 rounded-xl p-4 border border-blue-800/30">
                <div className="bg-gradient-to-br from-blue-500/20 to-yellow-500/20 p-3 rounded-xl">
                  <item.icon className="w-6 h-6 text-yellow-500" />
                </div>
                <div>
                  <div className="text-gray-400 text-sm">{item.label}</div>
                  <div className="text-white">{item.value}</div>
                </div>
              </div>
            ))}
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
              <button type="submit" className="btn-gold w-full py-3 text-lg flex items-center justify-center space-x-2">
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