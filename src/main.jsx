import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { AuthProvider } from './context/AuthContext'
import { Trash2 } from 'lucide-react'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    // Eski cache'li service worker'lar eski chunk adlarini servis edip
    // "Failed to load module script: MIME type text/html" beyaz ekranina
    // yol aciyordu. Oncekileri kaldir, sonra yenisini kaydet.
    try {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map(r => r.unregister()))
      if (window.caches) {
        const keys = await caches.keys()
        await Promise.all(keys.map(k => caches.delete(k)))
      }
    } catch { /* yoksay */ }
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
)
