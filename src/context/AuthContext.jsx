import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const savedUser = localStorage.getItem('mubis_user')
    if (savedUser) {
      setUser(JSON.parse(savedUser))
    }
    setLoading(false)
  }, [])

  const login = (email, password) => {
    if (email === 'admin@mubis.com' && password === 'admin123') {
      const adminUser = { id: 1, name: 'Koray Bey', email: 'admin@mubis.com', role: 'admin', avatar: null }
      setUser(adminUser)
      localStorage.setItem('mubis_user', JSON.stringify(adminUser))
      return { success: true, user: adminUser }
    }
    if (email === 'musteri@firma.com' && password === 'musteri123') {
      const clientUser = { id: 2, name: 'Ahmet Yılmaz', email: 'musteri@firma.com', role: 'client', company: 'Yılmaz Ticaret Ltd. Şti.', avatar: null }
      setUser(clientUser)
      localStorage.setItem('mubis_user', JSON.stringify(clientUser))
      return { success: true, user: clientUser }
    }
    return { success: false, error: 'Geçersiz email veya şifre' }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('mubis_user')
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}