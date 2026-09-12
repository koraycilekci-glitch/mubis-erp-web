import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import * as clientService from '../services/clientService'
import { getMyOffice, clearOfficeCache, buildClientLoginEmail } from '../services/officeService'
import { recordClientLogin } from '../services/statsService'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [office, setOffice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [needsPasswordChange, setNeedsPasswordChange] = useState(false)

  // Profil bilgisini cek
  const fetchProfile = async (authUser) => {
    if (!authUser) { setProfile(null); setOffice(null); return null }
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()

      // Ofis bilgisini yukle (hata olursa akis bozulmasin)
      getMyOffice(true).then(o => setOffice(o)).catch(() => {})

      // Eger musteri ise, client_id'yi clients tablosundan bul
      if (data?.role === 'musteri' || data?.role === 'client') {
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
            // Uygulama genelinde musteri rolu 'musteri' olarak beklenir
            role: 'musteri'
          }
          setProfile(merged)
          return merged
        }
      }

      setProfile(data)
      return { ...data, officeId: data?.office_id || null }
    } catch {
      return null
    }
  }

  // Oturum takibi
  useEffect(() => {
    // Beni hatirla secili degilse ve yeni session ise cikis yap
    const noRemember = sessionStorage.getItem('mubis_no_remember')
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        // Eger daha once "hatirla" secilmemisse ve bu yeni bir tab/pencere ise
        if (noRemember === null && localStorage.getItem('mubis_no_persist') === '1') {
          supabase.auth.signOut()
          localStorage.removeItem('mubis_no_persist')
          setLoading(false)
          return
        }
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
          if (prof?.temp_password) setNeedsPasswordChange(true)
          setLoading(false)
        })
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser(session.user)
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
          if (prof?.temp_password) setNeedsPasswordChange(true)
        } else {
          setUser(null)
          setProfile(null)
          setNeedsPasswordChange(false)
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // Giris yap (email veya TC/VKN destekli)
  const login = async (identifier, password, rememberMe = true) => {
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
    }
  }

  // Cikis yap
  const logout = async () => {
    await supabase.auth.signOut()
    clearOfficeCache()
    setUser(null)
    setProfile(null)
    setOffice(null)
    setNeedsPasswordChange(false)
  }

  // Sifre sifirlama emaili gonder
  const resetPassword = async (identifier) => {
    try {
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
  }

  // Sifre guncelle (gecici sifre degistirme veya normal degistirme)
  const updatePassword = async (newPassword) => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) return { success: false, error: error.message }
      
      // Gecici sifre flagini kaldir
      if (profile?.id) {
        await supabase
          .from('profiles')
          .update({ temp_password: false })
          .eq('id', profile.id)
      }

      setNeedsPasswordChange(false)
      setProfile(prev => prev ? { ...prev, temp_password: false } : null)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  // Musteri islemleri
  const getClients = async () => {
    try {
      const data = await clientService.getClients()
      return clientService.dbToFrontendList(data)
    } catch {
      return []
    }
  }

  const addClient = async (clientData) => {
    try {
      const data = await clientService.addClient(clientData)
      return { success: true, client: clientService.dbToFrontend(data) }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  const deleteClient = async (id) => {
    try {
      await clientService.deleteClient(id)
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  const updateClient = async (id, data) => {
    try {
      const result = await clientService.updateClient(id, data)
      return { success: true, client: clientService.dbToFrontend(result) }
    } catch (err) {
      console.error('updateClient hatasi:', err)
      const detail = err?.message || err?.error_description || err?.details || err?.hint || JSON.stringify(err)
      return { success: false, error: detail }
    }
  }

  // Musteri icin Supabase Auth hesabi olustur (admin tarafindan)
  // Giris adi ofise gore uretilir: ana ofis 'vkn@mubis.app',
  // diger ofisler 'ofiskodu-vkn@mubis.app'
  const createClientAuth = async (identifier, tempPassword, name, clientEmail) => {
    try {
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
  }

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

  return (
    <AuthContext.Provider value={{ 
      user: currentUser, 
      loading, 
      needsPasswordChange,
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
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
