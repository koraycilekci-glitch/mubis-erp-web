import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { AuthProvider } from './context/AuthContext'  // ✅ Bu satır var mı?

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>  {/* ✅ App burada sarmalanmış mı? */}
      <App />
    </AuthProvider>
  </React.StrictMode>,
)