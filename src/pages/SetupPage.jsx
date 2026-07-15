import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Upload, CheckCircle, AlertCircle, UserPlus, Database, Loader2 } from 'lucide-react'

export default function SetupPage() {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  
  // Admin olusturma
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminName, setAdminName] = useState('')
  
  // Veri tasima
  const [migrateStatus, setMigrateStatus] = useState('')
  const [migrateCount, setMigrateCount] = useState(0)

  const createAdmin = async () => {
    if (!adminEmail || !adminPassword || !adminName) {
      setError('Tum alanlari doldurun')
      return
    }
    setLoading(true)
    setError('')
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: adminEmail,
        password: adminPassword,
        options: {
          data: { name: adminName, role: 'admin' }
        }
      })
      
      if (signUpError) throw signUpError

      // Profil tablosunda role'u admin yap
      if (data.user) {
        await supabase
          .from('profiles')
          .update({ role: 'admin', name: adminName })
          .eq('id', data.user.id)
      }

      setMessage(`Admin hesabi olusturuldu: ${adminEmail}`)
      setStep(2)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const migrateData = async () => {
    setLoading(true)
    setError('')
    setMigrateStatus('Veriler okunuyor...')
    
    try {
      // localStorage'dan mevcut verileri oku
      const stored = localStorage.getItem('mubis_clients')
      if (!stored) {
        setError('localStorage\'da veri bulunamadi')
        setLoading(false)
        return
      }

      const clients = JSON.parse(stored)
      setMigrateStatus(`${clients.length} musteri bulundu, tasinyor...`)

      let count = 0
      for (const client of clients) {
        const insertData = {
          type: client.type || 'personal',
          name: client.name || '',
          company: client.company || '',
          vkn: client.vkn || '',
          tc: client.tc || '',
          email: client.email || '',
          phone: client.phone || '',
          whatsapp: client.whatsapp || client.phone || '',
          tax_office: client.taxOffice || '',
          address: client.address || '',
          city: client.city || '',
          company_type: client.companyType || 'ltd',
          tax_type: client.taxType || 'Kurumlar Vergisi',
          capital: client.capital || '',
          open_date: client.openDate || '',
          close_date: client.closeDate || '',
          musteri_sinifi: client.musteriSinifi || '',
          nace_code: client.naceCode || '',
          nace_desc: client.naceDesc || '',
          efatura: client.efatura || false,
          earsiv: client.earsiv || false,
          esmm: client.esmm || false,
          edefter: client.edefter || false,
          edefter_period: client.edefterPeriod || 'aylik',
          serbest_meslek: client.serbestMeslek || false,
          eimza_start: client.eimzaStart || '',
          eimza_end: client.eimzaEnd || '',
          kart_tipi: client.kartTipi || '',
          kart_sifre: client.kartSifre || '',
          kira_bilgisi: client.kiraBilgisi || '',
          kira_kontrat_bitis: client.kiraKontratBitis || '',
          dvs_username: client.dvdUsername || client.dvsUsername || '',
          dvs_password: client.dvdPassword || client.dvsPassword || '',
          sgk_user: client.sgkUsername || client.sgkUser || '',
          sgk_isyeri_kodu: client.sgkWorkplaceCode || client.sgkIsyeriKodu || '',
          sgk_sistem_sifre: client.sgkSystemPassword || client.sgkSistemSifre || '',
          sgk_isyeri_sifre: client.sgkWorkplacePassword || client.sgkIsyeriSifre || '',
          earsiv_user: client.earsivUser || '',
          earsiv_pass: client.earsivPass || '',
          edevlet_user: client.edevletUser || '',
          edevlet_pass: client.edevletPass || '',
          ticaret_sicil_no: client.tsgUsername || client.ticaretSicilNo || '',
          beyan_profile: client.beyanProfile || {},
          status: client.status || 'active',
          username: client.username || '',
          password: client.password || '123456',
          temp_password: client.tempPassword !== false,
        }

        const { error: insertError } = await supabase
          .from('clients')
          .insert(insertData)
        
        if (insertError) {
          console.error(`Musteri tasinamadi: ${client.name}`, insertError)
        } else {
          count++
        }
        
        setMigrateCount(count)
        setMigrateStatus(`${count}/${clients.length} musteri tasinyor...`)
      }

      setMigrateStatus(`Tamamlandi! ${count}/${clients.length} musteri tasinidi.`)
      setMessage(`${count} musteri basariyla Supabase'e tasindi!`)
      setStep(3)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-blue-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-yellow-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">M</span>
          </div>
          <h2 className="text-2xl font-bold text-white">MUBiS ERP Kurulum</h2>
          <p className="text-gray-400 mt-2">Supabase entegrasyonu</p>
        </div>

        {/* Adim gostergesi */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map(s => (
            <div key={s} className={`flex items-center gap-2 ${s <= step ? 'text-yellow-400' : 'text-gray-600'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${s < step ? 'bg-green-500 border-green-500 text-white' : s === step ? 'border-yellow-400 text-yellow-400' : 'border-gray-600'}`}>
                {s < step ? '✓' : s}
              </div>
              {s < 3 && <div className={`w-8 h-0.5 ${s < step ? 'bg-green-500' : 'bg-gray-700'}`} />}
            </div>
          ))}
        </div>

        <div className="bg-blue-950/50 rounded-2xl p-8 border border-blue-800/30">
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span className="text-red-300 text-sm">{error}</span>
            </div>
          )}
          {message && (
            <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-3 mb-4 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-green-300 text-sm">{message}</span>
            </div>
          )}

          {/* Adim 1: Admin Hesap Olustur */}
          {step === 1 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <UserPlus className="w-5 h-5 text-yellow-400" />
                <h3 className="text-lg font-semibold text-white">Admin Hesabi Olustur</h3>
              </div>
              <div className="space-y-4">
                <input type="text" placeholder="Ad Soyad" value={adminName} onChange={e => setAdminName(e.target.value)} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500" />
                <input type="email" placeholder="Email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500" />
                <input type="password" placeholder="Sifre (min 6 karakter)" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} className="w-full bg-blue-900/30 border border-blue-700/50 rounded-xl py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500" />
                <button onClick={createAdmin} disabled={loading} className="btn-gold w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
                  Admin Hesabi Olustur
                </button>
              </div>
            </div>
          )}

          {/* Adim 2: Verileri Tasi */}
          {step === 2 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Database className="w-5 h-5 text-yellow-400" />
                <h3 className="text-lg font-semibold text-white">Verileri Tasi</h3>
              </div>
              <p className="text-gray-400 text-sm mb-4">
                Mevcut localStorage verilerinizi Supabase veritabanina tasiyin.
              </p>
              {migrateStatus && (
                <div className="bg-blue-900/30 rounded-lg p-3 mb-4">
                  <p className="text-blue-300 text-sm">{migrateStatus}</p>
                  {migrateCount > 0 && (
                    <div className="mt-2 bg-blue-800/50 rounded-full h-2">
                      <div className="bg-yellow-400 h-2 rounded-full transition-all" style={{ width: `${Math.min(100, migrateCount * 10)}%` }} />
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={migrateData} disabled={loading} className="btn-gold flex-1 py-3 flex items-center justify-center gap-2 disabled:opacity-50">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                  Verileri Tasi
                </button>
                <button onClick={() => setStep(3)} className="bg-gray-700 text-white px-6 py-3 rounded-xl hover:bg-gray-600">
                  Atla
                </button>
              </div>
            </div>
          )}

          {/* Adim 3: Tamamlandi */}
          {step === 3 && (
            <div className="text-center">
              <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">Kurulum Tamamlandi!</h3>
              <p className="text-gray-400 mb-6">Artik MUBiS ERP'yi Supabase ile kullanabilirsiniz.</p>
              <a href="/giris" className="btn-gold inline-flex items-center gap-2 px-8 py-3">
                Giris Sayfasina Git
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
