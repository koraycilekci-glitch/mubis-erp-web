import { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import * as clientService from '../services/clientService'
import { getMyOffice, clearOfficeCache, buildClientLoginEmail } from '../services/officeService'
import { perfBaslat, perfBitir } from '../utils/perf'
import { recordClientLogin } from '../services/statsService'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [office, setOffice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [needsPasswordChange, setNeedsPasswordChange] = useState(false)
  const [dbHatasi, setDbHatasi] = useState(false)
  // Sifre guncellemesi sirasinda USER_UPDATED olayi profili yeniden okur;
  // profiles.temp_password=false DB'ye yazilana kadar BAYAT true okuyabilir
  // ve flag geri true'ya donup kullaniciyi /sifre-degistir'e geri seker
  // (sonsuz dongu). Bu ref acikken bayat okuma yok sayilir.
  const sifreGuncelleniyorRef = useRef(false)

  // Profil bilgisini cek. Baglanti havuzu tukendiyse (PGRST003) tek
  // seferde basarisiz olmaz; kisa gecikmelerle yeniden dener. Basarisiz
  // olursa onceki profil korunur (menu kaybolmaz), hata raporlanir.
  const fetchProfile = useCallback(async (authUser, deneme = 0) => {
    if (!authUser) { setProfile(null); setOffice(null); return null }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()
      if (error) throw error
      setDbHatasi(false)

      // Şifre değiştirilmiş ama DB henüz güncellenmemişse bayat true okumayı yok say
      try {
        const bayrak = localStorage.getItem('mubis_sifre_degistirildi')
        if (bayrak && bayrak === String(authUser.id) && data) data.temp_password = false
      } catch {}

      // Ofis bilgisini paralel yukle (onbellekli; force degil)
      getMyOffice().then(o => { if (o) setOffice(o) }).catch(() => {})

      // Musteri ise client kaydini bul
      if (data?.role === 'musteri' || data?.role === 'client') {
        try {
          const emailPrefix = authUser.email?.split('@')[0]
          const { data: clientData } = await supabase
            .from('clients')
            .select('id, name, company, phone, email, city, office_id, phonenumbers, short_name, tax_office')
            .or(`auth_user_id.eq.${authUser.id},username.eq.${emailPrefix},email.eq.${authUser.email}`)
            .limit(1)
            .maybeSingle()
          if (clientData) {
            const merged = {
              ...data,
              clientId: clientData.id,
              officeId: clientData.office_id,
              name: clientData.name || clientData.company || data.name,
              shortName: clientData.short_name || clientData.name || clientData.company || data.name,
              short_name: clientData.short_name,
              phone: clientData.phone,
              phoneNumbers: clientData.phonenumbers || [],
              email: clientData.email,
              city: clientData.city,
              tax_office: clientData.tax_office,
              role: 'musteri'
            }
            setProfile(merged)
            return merged
          }
        } catch { /* client kaydi bulunamazsa profil yine de kullanilir */ }
      }

      setProfile(data)
      return { ...data, officeId: data?.office_id || null }
    } catch (e) {
      // Tekrar dene (en fazla 2 kez) — baglanti havuzu gecici olarak bosalir
      if (deneme < 2) {
        await new Promise(r => setTimeout(r, 800 * (deneme + 1)))
        return fetchProfile(authUser, deneme + 1)
      }
      console.warn('Profil yuklenemedi:', e?.message || e)
      setDbHatasi(true)
      // Onceki profil varsa koru (menu kaybolmaz)
      return null
    }
  }, [])

  // Oturum takibi
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        fetchProfile(session.user).then((prof) => {
          setUser(prev => ({
            ...session.user,
            ...(prev || {}),
            role: prof?.role || prev?.role,
            name: prof?.name || prev?.name || session.user.email,
            shortName: prof?.shortName || prof?.short_name || prev?.shortName || prev?.short_name,
            short_name: prof?.short_name || prev?.short_name,
            tax_office: prof?.tax_office || prev?.tax_office,
            clientId: prof?.clientId || prev?.clientId || null,
            officeId: prof?.officeId || prev?.officeId || null
          }))
          if (prof?.clientId) {
            setUser(prev => ({
              ...prev,
              clientId: prof.clientId,
              role: prof.role,
              name: prof.name,
              shortName: prof.shortName || prof.short_name,
              short_name: prof.short_name,
              tax_office: prof.tax_office
            }))
          }
          if (!sifreGuncelleniyorRef.current && prof?.temp_password) setNeedsPasswordChange(true)
          setLoading(false)
        })
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // DIKKAT: Bu callback supabase-js auth kilidi tutulurken cagirilir.
        // Icinde bekleyen bir supabase sorgusu (fetchProfile -> profiles
        // select'i auth lock'unu bekler) kilitlenir ve uygulama sonsuza
        // kadar "loading" kalir (bembeyaz sayfa, hata da yok). Bu yuzden
        // async isleri setTimeout(0) ile kilidin disina planliyoruz.
        if (session?.user) {
          setUser(session.user)
          setTimeout(() => {
            (async () => {
              try {
                const prof = await fetchProfile(session.user)
                setUser(prev => ({
                  ...session.user,
                  ...(prev || {}),
                  role: prof?.role || prev?.role,
                  name: prof?.name || prev?.name || session.user.email,
                  shortName: prof?.shortName || prof?.short_name || prev?.shortName || prev?.short_name,
                  short_name: prof?.short_name || prev?.short_name,
                  tax_office: prof?.tax_office || prev?.tax_office,
                  clientId: prof?.clientId || prev?.clientId || null,
                  officeId: prof?.officeId || prev?.officeId || null
                }))
                if (prof?.clientId) {
                  setUser(prev => ({
                    ...prev,
                    clientId: prof.clientId,
                    role: prof.role,
                    name: prof.name,
                    shortName: prof.shortName || prof.short_name,
                    short_name: prof.short_name,
                    tax_office: prof.tax_office
                  }))
                }
                if (!sifreGuncelleniyorRef.current && prof?.temp_password) setNeedsPasswordChange(true)
              } finally {
                setLoading(false)
              }
            })()
          }, 0)
        } else {
          setUser(null)
          setProfile(null)
          setNeedsPasswordChange(false)
          setLoading(false)
        }
      }
    )

    // Guvenlik agi: herhangi bir sebeple loading takilirsan 10 sn sonra ac
    const guvenlik = setTimeout(() => {
      setLoading(l => {
        if (l) console.warn('Auth yukleme guvenlik agiyla acildi')
        return false
      })
    }, 10000)

    return () => { subscription.unsubscribe(); clearTimeout(guvenlik) }
  }, [])

  // Giris yap (email veya TC/VKN destekli)
  const login = useCallback(async (identifier, password, rememberMe = true) => {
    const _t = perfBaslat('Login')
    try {
      // TC/VKN ise @mubis.app ekle, email ise direkt kullan
      let email = identifier
      if (!identifier.includes('@')) {
        email = `${identifier}@mubis.app`
      }

      // Beni hatirla secenegi
      if (!rememberMe) {
        // Session sadece tab acikken gecerli
        sessionStorage.setItem('mubis_no_remember', '1')
      } else {
        sessionStorage.removeItem('mubis_no_remember')
        // Eski surumden kalan bayrak varsa temizle (yenilemede oturum dusmesin)
        localStorage.removeItem('mubis_no_persist')
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return { success: false, error: error.message }
      
      const prof = await fetchProfile(data.user)

      // Musteri sifre ile giris yaptiysa giris kaydini tut (giris takibi)
      if (prof?.clientId) {
        recordClientLogin(prof.clientId)
      }

      // Gecici sifre kontrolu
      if (prof?.temp_password) {
        setNeedsPasswordChange(true)
      }

      return { 
        success: true, 
        tempPassword: prof?.temp_password || false,
        user: { 
          ...data.user, 
          clientId: prof?.clientId || null,
          name: prof?.name || email,
          shortName: prof?.shortName || prof?.short_name,
          short_name: prof?.short_name,
          tax_office: prof?.tax_office,
          role: prof?.role || 'personel',
          permissions: prof?.permissions || {}
        }
      }
    } catch (err) {
      return { success: false, error: err.message }
    } finally {
      perfBitir('Login', _t)
    }
  }, [fetchProfile])

  // Cikis yap
  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    clearOfficeCache()
    setUser(null)
    setProfile(null)
    setOffice(null)
    setNeedsPasswordChange(false)
  // Ortak musteri onbellegini temizle
  try { const { musteriListesiSifirla } = await import('../services/clientStore'); musteriListesiSifirla(user?.id || null) } catch {}
  }, [])

  // Sifre sifirlama emaili gonder
  const resetPassword = useCallback(async (identifier) => {    try {
      let email = identifier
      if (!identifier.includes('@')) {
        // TC/VKN ile giris yapan musteri - onun gercek emailini bul
        const { data: clients } = await supabase
          .from('clients')
          .select('email')
          .or(`tc.eq.${identifier},vkn.eq.${identifier}`)
          .limit(1)
        
        if (clients && clients.length > 0 && clients[0].email) {
          email = clients[0].email
        } else {
          return { success: false, error: 'Bu TC/VKN ile kayitli musteri bulunamadi veya email adresi yok' }
        }
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/sifre-degistir`
      })
      if (error) return { success: false, error: error.message }
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [])

  // Sifre guncelle (gecici sifre degistirme veya normal degistirme)
  const updatePassword = useCallback(async (newPassword) => {
    try {
      sifreGuncelleniyorRef.current = true
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) return { success: false, error: error.message }

      // Gecici sifre flagini kaldir
      if (profile?.id) {
        let profErr = null
        for (let i = 0; i < 2; i++) {
          const r = await supabase
            .from('profiles')
            .update({ temp_password: false })
            .eq('id', profile.id)
          profErr = r.error
          if (!profErr) break
          await new Promise(res => setTimeout(res, 600))
        }
        if (profErr) {
          console.error('temp_password kaldirilamadi:', profErr.message)
          try { localStorage.setItem('mubis_sifre_degistirildi', profile.id) } catch {}
        } else {
          try { localStorage.removeItem('mubis_sifre_degistirildi') } catch {}
        }
      }

      setNeedsPasswordChange(false)
      setProfile(prev => prev ? { ...prev, temp_password: false } : null)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    } finally {
      // USER_UPDATED ile tetiklenen profil okumasi DB guncellemesinden sonra
      // bitene kadar guard acik kalsin; bayat true okuma yok sayilir.
      setTimeout(() => { sifreGuncelleniyorRef.current = false }, 5000)
    }
  }, [profile?.id])

  // Musteri islemleri
  const getClients = useCallback(async () => {
    try {
      const data = await clientService.getClients()
      return clientService.dbToFrontendList(data)
    } catch (e) {
      console.error('getClients hatasi:', e?.message || e)
      return []
    }
  }, [])

  const addClient = useCallback(async (clientData) => {    try {
      const data = await clientService.addClient(clientData)
      const { onbellekSil } = await import('../lib/veriOrtak')
      onbellekSil('clients:raw')
      const { musteriListesiGecersizKil } = await import('../services/clientStore')
      musteriListesiGecersizKil(user?.id || null)
      window.dispatchEvent(new Event('mubis-clients-refresh'))
      return { success: true, client: clientService.dbToFrontend(data) }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [])

  const deleteClient = useCallback(async (id) => {    try {
      await clientService.deleteClient(id)
      const { onbellekSil } = await import('../lib/veriOrtak')
      onbellekSil('clients:raw')
      const { musteriListesiGecersizKil } = await import('../services/clientStore')
      musteriListesiGecersizKil(user?.id || null)
      window.dispatchEvent(new Event('mubis-clients-refresh'))
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [])

  const updateClient = useCallback(async (id, data) => {    try {
      const result = await clientService.updateClient(id, data)
      const { onbellekSil } = await import('../lib/veriOrtak')
      onbellekSil('clients:raw')
      const { musteriListesiGecersizKil } = await import('../services/clientStore')
      musteriListesiGecersizKil(user?.id || null)
      window.dispatchEvent(new Event('mubis-clients-refresh'))
      return { success: true, client: clientService.dbToFrontend(result) }
    } catch (err) {
      console.error('updateClient hatasi:', err)
      const detail = err?.message || err?.error_description || err?.details || err?.hint || JSON.stringify(err)
      return { success: false, error: detail }
    }
  }, [])

  // Musteri icin Supabase Auth hesabi olustur (admin tarafindan)
  // Giris adi ofise gore uretilir: ana ofis 'vkn@mubis.app',
  // diger ofisler 'ofiskodu-vkn@mubis.app'
  const createClientAuth = useCallback(async (identifier, tempPassword, name, clientEmail) => {    try {
      const ofis = office || await getMyOffice()
      const authEmail = buildClientLoginEmail(identifier, ofis)

      const { data, error } = await supabase.auth.signUp({
        email: authEmail,
        password: tempPassword || '123456',
        options: {
          data: { name: name, role: 'client', office_id: String(ofis?.id || 1) }
        }
      })

      if (error) return { success: false, error: error.message }

      // Profili guncelle - temp_password, gercek email ve ofis
      if (data.user) {
        await supabase
          .from('profiles')
          .update({
            role: 'client',
            name: name,
            temp_password: true,
            email: clientEmail || authEmail,
            office_id: ofis?.id || 1
          })
          .eq('id', data.user.id)
      }

      return { success: true, authUser: data.user, loginEmail: authEmail }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [office])

  const currentUser = user ? {
    id: user.clientId || user.id,
    authUserId: user.id,
    email: user.email,
    name: profile?.name || user.email,
    role: profile?.role || 'personel',
    permissions: profile?.permissions || {},
    username: user.email,
    tempPassword: profile?.temp_password || false,
    officeId: office?.id || profile?.office_id || null,
    officeCode: office?.code || null,
    officeName: office?.name || null,
    isSuperAdmin: profile?.role === 'super_admin',
  } : null

  const dbYenidenDene = useCallback(async () => {
    const s = await supabase.auth.getSession()
    if (s?.data?.session?.user) {
      await fetchProfile(s.data.session.user)
    }
  }, [fetchProfile])

  const deger = useMemo(() => ({
    user: currentUser,
    loading,
    needsPasswordChange,
    dbHatasi,
    dbYenidenDene,
    login,
    logout,
    resetPassword,
    updatePassword,
    getClients,
    addClient,
    deleteClient,
    updateClient,
    createClientAuth,
    profile,
    office
  }), [currentUser, loading, needsPasswordChange, dbHatasi, dbYenidenDene, login, logout,
       resetPassword, updatePassword, getClients, addClient, deleteClient, updateClient,
       createClientAuth, profile, office])

  return (
    <AuthContext.Provider value={deger}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
