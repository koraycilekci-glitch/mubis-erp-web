import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import * as clientService from '../services/clientService'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [needsPasswordChange, setNeedsPasswordChange] = useState(false)

  // Profil bilgisini cek
  const fetchProfile = async (authUser) => {
    if (!authUser) { setProfile(null); return null }
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single()
      setProfile(data)
      return data
    } catch {
      return null
    }
  }

  // Oturum takibi
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        fetchProfile(session.user).then((prof) => {
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
  const login = async (identifier, password) => {
    try {
      // TC/VKN ise @mubis.app ekle, email ise direkt kullan
      let email = identifier
      if (!identifier.includes('@')) {
        email = `${identifier}@mubis.app`
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return { success: false, error: error.message }
      
      const prof = await fetchProfile(data.user)
      
      // Gecici sifre kontrolu
      if (prof?.temp_password) {
        setNeedsPasswordChange(true)
      }

      return { 
        success: true, 
        tempPassword: prof?.temp_password || false,
        user: { 
          ...data.user, 
          name: prof?.name || email,
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
    setUser(null)
    setProfile(null)
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
      return { success: false, error: err.message }
    }
  }

  // Musteri icin Supabase Auth hesabi olustur (admin tarafindan)
  const createClientAuth = async (identifier, tempPassword, name, clientEmail) => {
    try {
      const authEmail = `${identifier}@mubis.app`
      
      const { data, error } = await supabase.auth.signUp({
        email: authEmail,
        password: tempPassword || '123456',
        options: {
          data: { name: name, role: 'client' }
        }
      })
      
      if (error) return { success: false, error: error.message }
      
      // Profili guncelle - temp_password ve gercek email
      if (data.user) {
        await supabase
          .from('profiles')
          .update({ 
            role: 'client', 
            name: name,
            temp_password: true,
            email: clientEmail || authEmail
          })
          .eq('id', data.user.id)
      }

      return { success: true, authUser: data.user }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  const currentUser = user ? {
    id: user.id,
    email: user.email,
    name: profile?.name || user.email,
    role: profile?.role || 'personel',
    permissions: profile?.permissions || {},
    username: user.email,
    tempPassword: profile?.temp_password || false,
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
      profile
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
