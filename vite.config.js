import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Google Analytics olcum kimligi hem VITE_GA_ID hem NEXT_PUBLIC_GA_ID
  // ortam degiskeninden okunabilsin (istek: NEXT_PUBLIC_GA_ID).
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) return 'react-vendor'
            if (id.includes('@supabase')) return 'supabase'
            if (id.includes('recharts')) return 'charts'
            if (id.includes('jspdf') || id.includes('pdfjs')) return 'pdf'
            if (id.includes('xlsx') || id.includes('jszip') || id.includes('papaparse')) return 'xlsx'
            if (id.includes('@mui')) return 'mui'
            if (id.includes('framer-motion')) return 'motion'
            if (id.includes('tesseract')) return 'ocr'
            return 'vendor'
          }
        }
      }
    }
  },
  server: {
    port: 3000,
    open: true,
    watch: {
      ignored: ['**/.wrangler/**', '**/.git/**', '**/node_modules/**']
    }
  }
})
