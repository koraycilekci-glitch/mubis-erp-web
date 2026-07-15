import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const savedUser = localStorage.getItem('mubis_user')
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser))
      } catch(_e) {
        localStorage.removeItem('mubis_user')
      }
    }
    setLoading(false)
  }, [])

  const getClients = () => {
    const stored = localStorage.getItem('mubis_clients')
    return stored ? JSON.parse(stored) : []
  }

  const saveClients = (clients) => {
    localStorage.setItem('mubis_clients', JSON.stringify(clients))
  }

  const addClient = (clientData) => {
    const clients = getClients()
    const username = clientData.type === 'company' ? clientData.vkn : clientData.tc
    
    if (clients.find(c => c.username === username)) {
      return { success: false, error: 'Bu kullanici zaten kayitli!' }
    }

    const newClient = {
      id: Date.now(),
      username: username,
      password: '123456',
      tempPassword: true,
      type: clientData.type,
      name: clientData.name,
      company: clientData.company || '',
      vkn: clientData.vkn || '',
      tc: clientData.tc || '',
      email: clientData.email || '',
      phone: clientData.phone || '',
      taxOffice: clientData.taxOffice || '',
      city: clientData.city || '',
      address: clientData.address || '',
      openDate: clientData.openDate || '',
      closeDate: clientData.closeDate || '',
      earsiv: clientData.earsiv || false,
      efatura: clientData.efatura || false,
      esmm: clientData.esmm || false,
      edefter: clientData.edefter || false,
      edefterPeriod: clientData.edefterPeriod || 'aylik',  // ✅ e-Defter Periyot
      serbestMeslek: clientData.serbestMeslek || false,
      eimzaStart: clientData.eimzaStart || '',
      eimzaEnd: clientData.eimzaEnd || '',
      capital: clientData.capital || '',
      companyType: clientData.companyType || 'ltd',
      taxType: clientData.taxType || 'Kurumlar Vergisi',
      // PORTAL HESAPLARI - SGK 4 ALANLI
      portalSgk: clientData.portalSgk || false,
      sgkUsername: clientData.sgkUsername || '',
      sgkWorkplaceCode: clientData.sgkWorkplaceCode || '',
      sgkWorkplacePassword: clientData.sgkWorkplacePassword || '',
      sgkSystemPassword: clientData.sgkSystemPassword || '',
      portalDvd: clientData.portalDvd || false,
      dvdUsername: clientData.dvdUsername || '',
      dvdPassword: clientData.dvdPassword || '',
      portalTicariSicil: clientData.portalTicariSicil || false,
      tsgUsername: clientData.tsgUsername || '',
      tsgPassword: clientData.tsgPassword || '',
      status: 'active',
      createdAt: new Date().toISOString()
    }

    clients.push(newClient)
    saveClients(clients)
    return { success: true, client: newClient }
  }

  const deleteClient = (id) => {
    const clients = getClients().filter(c => c.id !== id)
    saveClients(clients)
  }

  const updateClient = (id, data) => {
    const clients = getClients()
    const index = clients.findIndex(c => c.id === id)
    if (index !== -1) {
      clients[index] = { ...clients[index], ...data }
      saveClients(clients)
      return { success: true }
    }
    return { success: false }
  }

  const changePassword = (username, newPassword) => {
    const clients = getClients()
    const index = clients.findIndex(c => c.username === username)
    if (index !== -1) {
      clients[index].password = newPassword
      clients[index].tempPassword = false
      saveClients(clients)
      return { success: true }
    }
    return { success: false, error: 'Kullanici bulunamadi' }
  }

  const login = (username, password) => {
    if (username === 'admin' && password === 'admin123') {
      const adminUser = { 
        id: 1, 
        name: 'Koray Bey', 
        username: 'admin', 
        role: 'admin',
        taxType: null
      }
      setUser(adminUser)
      localStorage.setItem('mubis_user', JSON.stringify(adminUser))
      return { success: true, user: adminUser }
    }

    if (username === 'musteri@firma.com' && password === 'musteri123') {
      const clientUser = { 
        id: 2, 
        name: 'Ahmet Yılmaz', 
        username: 'musteri@firma.com', 
        role: 'client', 
        company: 'Yılmaz Ticaret Ltd. Şti.', 
        earsiv: true, 
        efatura: false, 
        esmm: false,
        edefter: true,
        edefterPeriod: 'aylik',
        serbestMeslek: false, 
        companyType: 'ltd',
        taxType: 'Kurumlar Vergisi',
        portalSgk: true,
        sgkUsername: '12345678901',
        sgkWorkplaceCode: '001',
        sgkWorkplacePassword: 'isyeri123',
        sgkSystemPassword: 'sistem123',
        portalDvd: true,
        dvdUsername: 'demo_dvd',
        dvdPassword: 'demo123',
        portalTicariSicil: true,
        tsgUsername: 'demo_tsg',
        tsgPassword: 'demo123'
      }
      setUser(clientUser)
      localStorage.setItem('mubis_user', JSON.stringify(clientUser))
      return { success: true, user: clientUser }
    }

    const clients = getClients()
    const client = clients.find(c => c.username === username && c.password === password)
    
    if (client) {
      const clientUser = {
        id: client.id,
        name: client.name,
        username: client.username,
        role: 'client',
        company: client.company || client.name,
        type: client.type,
        vkn: client.vkn,
        tc: client.tc,
        email: client.email,
        phone: client.phone,
        city: client.city,
        taxOffice: client.taxOffice,
        address: client.address,
        openDate: client.openDate,
        closeDate: client.closeDate,
        earsiv: client.earsiv || false,
        efatura: client.efatura || false,
        esmm: client.esmm || false,
        edefter: client.edefter || false,
        edefterPeriod: client.edefterPeriod || 'aylik',  // ✅ e-Defter Periyot
        serbestMeslek: client.serbestMeslek || false,
        eimzaStart: client.eimzaStart,
        eimzaEnd: client.eimzaEnd,
        capital: client.capital,
        companyType: client.companyType || 'ltd',
        taxType: client.taxType || 'Kurumlar Vergisi',
        portalSgk: client.portalSgk || false,
        sgkUsername: client.sgkUsername || '',
        sgkWorkplaceCode: client.sgkWorkplaceCode || '',
        sgkWorkplacePassword: client.sgkWorkplacePassword || '',
        sgkSystemPassword: client.sgkSystemPassword || '',
        portalDvd: client.portalDvd || false,
        dvdUsername: client.dvdUsername || '',
        dvdPassword: client.dvdPassword || '',
        portalTicariSicil: client.portalTicariSicil || false,
        tsgUsername: client.tsgUsername || '',
        tsgPassword: client.tsgPassword || '',
        tempPassword: client.tempPassword
      }
      setUser(clientUser)
      localStorage.setItem('mubis_user', JSON.stringify(clientUser))
      return { success: true, user: clientUser, tempPassword: client.tempPassword }
    }

    return { success: false, error: 'Geçersiz kullanıcı adı veya şifre' }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('mubis_user')
  }

  return (
    <AuthContext.Provider value={{ 
      user, loading, login, logout, 
      getClients, addClient, deleteClient, updateClient, changePassword 
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}