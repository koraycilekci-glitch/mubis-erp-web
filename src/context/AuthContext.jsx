import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import * as clientService from '../services/clientService'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

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
    // Mevcut oturumu kontrol et
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        fetchProfile(session.user).then(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    // Oturum degisikliklerini dinle
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser(session.user)
          await fetchProfile(session.user)
        } else {
          setUser(null)
          setProfile(null)
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // Giris yap
  const login = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return { success: false, error: error.message }
      
      const prof = await fetchProfile(data.user)
      return { 
        success: true, 
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
  }

  // Musteri islemleri (Supabase uzerinden)
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

  const changePassword = async (username, newPassword) => {
    // Client password degistirme (clients tablosunda)
    try {
      const clients = await clientService.getClients()
      const client = clients.find(c => c.username === username)
      if (client) {
        await clientService.updateClient(client.id, { password: newPassword, temp_password: false })
        return { success: true }
      }
      return { success: false, error: 'Kullanici bulunamadi' }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  // Kullanici bilgileri (profil + auth)
  const currentUser = user ? {
    id: user.id,
    email: user.email,
    name: profile?.name || user.email,
    role: profile?.role || 'personel',
    permissions: profile?.permissions || {},
    username: user.email,
  } : null

  return (
    <AuthContext.Provider value={{ 
      user: currentUser, 
      loading, 
      login, 
      logout, 
      getClients, 
      addClient, 
      deleteClient, 
      updateClient, 
      changePassword,
      profile
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
