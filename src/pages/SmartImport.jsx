import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import { aiService } from '../services/aiService'
import { getAutoAddedAccounts } from '../services/clientService'
import { 
  Upload, FileText, Loader2, 
  CheckCircle, AlertTriangle, X, Download, 
  Eye, Save, Zap, Brain, 
  TrendingUp, Clock, Trash2,
  FileSpreadsheet, Edit3, Hash
} from 'lucide-react'

export default function SmartImport() {
  const { user: _user } = useAuth()
  const { clients } = useClients()
  const [files, setFiles] = useState([])
  const [processing, setProcessing] = useState(false)
  const [documents, setDocuments] = useState([])
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewDoc, setPreviewDoc] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [selectedClient, setSelectedClient] = useState('')
  const fileInputRef = useRef(null)
  const [autoAddedAccounts, setAutoAddedAccounts] = useState([])

  const [globalInvoiceType, setGlobalInvoiceType] = useState('gelen')

  // AI tarafindan eklenen hesaplari yukle
  useEffect(() => {
    if (selectedClient) {
      getAutoAddedAccounts(parseInt(selectedClient)).then(setAutoAddedAccounts).catch(() => setAutoAddedAccounts([]))
    } else {
      setAutoAddedAccounts([])
    }
  }, [selectedClient, documents])

  const [learnedMatches, setLearnedMatches] = useState(() => {
    const stored = localStorage.getItem('mubis_learned_matches')
    return stored ? JSON.parse(stored) : []
  })

  const handleFileUpload = (e) => {
    const uploadedFiles = Array.from(e.target.files)
    const newFiles = uploadedFiles.map(file => ({
      id: Date.now() + Math.random(),
      file,
      name: file.name,
      type: file.type,
      size: file.size,
      status: 'uploaded',
      invoiceType: globalInvoiceType
    }))
    setFiles([...files, ...newFiles])
  }

  const processFiles = async () => {
    if (files.length === 0) {
      alert('Lütfen önce dosya yükleyin!')
      return
    }
    
    setProcessing(true)
    setOcrProgress(0)
    
    try {
      const results = []
      
      for (const fileItem of files) {
        const file = fileItem.file
        const invoiceType = globalInvoiceType
        
        try {
          let result = null
          
          if (file.name.endsWith('.xml')) {
            const data = await aiService.readXML(file, invoiceType)
            if (data.success) {
              let checkResult = { status: 'not_found', vendor: null, accountCode: null, accountName: null }
              
              if (data.vkn) {
                const vendorList = aiService.loadVendorList()
                const found = vendorList.find(v => v.vkn === data.vkn)
                if (found) {
                  checkResult = {
                    status: 'found',
                    vendor: found,
                    accountCode: found.accountCode,
                    accountName: found.accountName,
                    message: `Firma VKN ile bulundu: ${found.name}`
                  }
                }
              }
              
              if (checkResult.status === 'not_found') {
                checkResult = aiService.checkVendorAndSuggest(data.vendor)
              }
              
              const suggestion = aiService.suggestAccountCode(data.vendor, invoiceType, data.invoiceTypeCode)
              
              result = {
                file: file.name,
                type: 'xml',
                invoiceType: invoiceType,
                invoiceTypeCode: data.invoiceTypeCode || '',
                vendor: data.vendor,
                vkn: data.vkn,
                supplier: data.supplier || '',
                supplierVkn: data.supplierVkn || '',
                customer: data.customer || '',
                customerVkn: data.customerVkn || '',
                date: data.date,
                invoiceNo: data.invoiceNo,
                description: data.description || '',
                amount: data.amount,
                tax: data.tax,
                total: data.total,
                taxDetails: data.taxDetails || [],
                suggestedAccount: checkResult.accountCode || suggestion.code,
                accountName: checkResult.accountName || suggestion.name,
                confidence: checkResult.status === 'found' ? 95 : 70,
                status: 'pending',
                vendorCheck: checkResult,
                rawText: '',
                rawXML: data.rawXML
              }
            } else {
              result = {
                file: file.name,
                type: 'xml',
                invoiceType: invoiceType,
                invoiceTypeCode: '',
                vendor: 'Bilinmeyen',
                vkn: '',
                supplier: '',
                supplierVkn: '',
                customer: '',
                customerVkn: '',
                date: '',
                invoiceNo: '',
                description: '',
                amount: 0,
                tax: 0,
                total: 0,
                taxDetails: [],
                suggestedAccount: invoiceType === 'giden' ? '649' : '789',
                accountName: invoiceType === 'giden' ? 'Diğer Gelirler' : 'Çeşitli Giderler',
                confidence: 10,
                status: 'pending',
                vendorCheck: { status: 'not_found', message: data.error || 'XML okunamadı' },
                rawText: '',
                rawXML: data.rawXML || null,
                error: data.error
              }
            }
          } else {
            result = {
              file: file.name,
              type: file.type?.includes('pdf') ? 'pdf' : 'image',
              invoiceType: invoiceType,
              invoiceTypeCode: '',
              vendor: 'Bilinmeyen',
              vkn: '',
              supplier: '',
              supplierVkn: '',
              customer: '',
              customerVkn: '',
              date: new Date().toISOString().split('T')[0],
              invoiceNo: `INV${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
              description: '',
              amount: 0,
              tax: 0,
              total: 0,
              taxDetails: [],
              suggestedAccount: invoiceType === 'giden' ? '649' : '789',
              accountName: invoiceType === 'giden' ? 'Diğer Gelirler' : 'Çeşitli Giderler',
              confidence: 20,
              status: 'pending',
              vendorCheck: { status: 'not_found', message: 'Firma okunamadı' },
              rawText: '',
              rawXML: null
            }
          }
          
          results.push(result)
        } catch (error) {
          console.error('Dosya işleme hatası:', error)
          results.push({
            file: file.name,
            type: 'error',
            invoiceType: invoiceType,
            invoiceTypeCode: '',
            vendor: 'Hata',
            vkn: '',
            supplier: '',
            supplierVkn: '',
            customer: '',
            customerVkn: '',
            date: '',
            invoiceNo: '',
            description: '',
            amount: 0,
            tax: 0,
            total: 0,
            taxDetails: [],
            suggestedAccount: '---',
            accountName: 'Hata',
            confidence: 0,
            status: 'pending',
            vendorCheck: { status: 'not_found', message: error.message },
            rawText: '',
            rawXML: null,
            error: error.message
          })
        }
      }
      
      console.log('🤖 AI Sonuçları:', results)
      
      if (results && results.length > 0) {
        const processedDocs = results.map((r, index) => ({
          id: Date.now() + index,
          fileName: r.file || 'Bilinmiyor',
          type: r.type || 'unknown',
          invoiceType: r.invoiceType || 'gelen',
          invoiceTypeCode: r.invoiceTypeCode || '',
          vendor: r.vendor || 'Bilinmeyen',
          vkn: r.vkn || '',
          supplier: r.supplier || '',
          supplierVkn: r.supplierVkn || '',
          customer: r.customer || '',
          customerVkn: r.customerVkn || '',
          date: r.date || new Date().toISOString().split('T')[0],
          invoiceNo: r.invoiceNo || `INV${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
          description: r.description || '',
          amount: r.amount || 0,
          tax: r.tax || 0,
          total: r.total || 0,
          taxDetails: r.taxDetails || [],
          suggestedAccount: r.suggestedAccount || '789',
          accountName: r.accountName || 'Çeşitli Giderler',
          confidence: r.confidence || 60,
          status: 'pending',
          processed: true,
          error: r.error || null,
          rawText: r.rawText || '',
          rawXML: r.rawXML || null,
          vendorCheck: r.vendorCheck || { status: 'not_found', message: 'Kontrol edilmedi' },
          editable: true
        }))
        
        setDocuments([...processedDocs, ...documents])
        setFiles([])
        alert(`✅ ${processedDocs.length} belge işlendi!`)
      } else {
        alert('⚠️ Hiçbir belge işlenemedi!')
      }
    } catch (error) {
      console.error('❌ İşleme hatası:', error)
      alert('❌ Hata: ' + error.message)
    }
    
    setProcessing(false)
    setOcrProgress(100)
  }

  const openPreview = (doc) => {
    console.log('🔍 Önizleme açılıyor:', doc)
    console.log('📋 taxDetails:', doc.taxDetails)
    
    if (doc.rawXML) {
      console.log('✅ rawXML var, direkt gösteriliyor, uzunluk:', doc.rawXML.length)
      setPreviewDoc(doc)
      setShowPreview(true)
      setEditMode(false)
      return
    }
    
    console.log('⚠️ rawXML yok, dosya okunuyor...')
    
    let fileItem = files.find(f => f.name === doc.fileName)
    
    if (!fileItem) {
      alert('⚠️ Dosya içeriği bulunamadı! Lütfen dosyayı tekrar yükleyin.')
      return
    }
    
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const xmlContent = e.target.result
        console.log('✅ Dosya okundu, uzunluk:', xmlContent.length)
        const updatedDoc = { ...doc, rawXML: xmlContent }
        console.log('📋 Güncellenmiş Doc taxDetails:', updatedDoc.taxDetails)
        setPreviewDoc(updatedDoc)
        setShowPreview(true)
        setEditMode(false)
      } catch (err) {
        console.error('❌ Dosya okuma hatası:', err)
        alert('Dosya okunamadı!')
      }
    }
    reader.onerror = (err) => {
      console.error('❌ Dosya okuma hatası:', err)
      alert('Dosya okunamadı!')
    }
    reader.readAsText(fileItem.file)
  }

  // ============ XML'den Fatura HTML - DÜZELTİLDİ ============
const renderInvoiceHTML = (xmlContent) => {
  console.log('📄 renderInvoiceHTML çağrıldı')
  
  if (!xmlContent) {
    return '<div class="text-gray-400 text-center py-8">XML içeriği bulunamadı</div>'
  }
  
  try {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml')
    
    const parserError = xmlDoc.querySelector('parsererror')
    if (parserError) {
      console.error('XML Parse Hatası:', parserError.textContent)
      return `
        <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <p class="text-yellow-600 font-medium">⚠️ XML Parse Edilemedi</p>
          <p class="text-yellow-500 text-sm">${parserError.textContent}</p>
        </div>
        <pre class="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-gray-100 p-4 rounded-lg max-h-96 overflow-auto">${xmlContent}</pre>
      `
    }
    
    // ============ previewDoc'tan VERİLERİ AL (ÖNCELİKLİ) ============
    const invoiceNo = previewDoc?.invoiceNo || xmlDoc.querySelector('cbc\\:ID')?.textContent || '---'
    const date = previewDoc?.date || xmlDoc.querySelector('cbc\\:IssueDate')?.textContent || '---'
    
    // SATICI - previewDoc'tan al, yoksa XML'den oku
    let supplier = previewDoc?.supplier || '---'
    if (supplier === '---' || supplier === 'Türkiye') {
      const supplierParty = xmlDoc.querySelector('cac\\:AccountingSupplierParty') || xmlDoc.querySelector('AccountingSupplierParty')
      if (supplierParty) {
        let nameEl = supplierParty.querySelector('cac\\:Party cac\\:PartyName cbc\\:Name')
        if (!nameEl) nameEl = supplierParty.querySelector('Party PartyName Name')
        if (!nameEl) nameEl = supplierParty.querySelector('cbc\\:Name')
        if (nameEl) {
          const name = nameEl.textContent.trim()
          if (name && name !== 'Türkiye' && name.length > 3) {
            supplier = name
          }
        }
      }
    }
    
    // ALICI - previewDoc'tan al, yoksa XML'den oku
    let customer = previewDoc?.customer || '---'
    if (customer === '---') {
      const customerParty = xmlDoc.querySelector('cac\\:AccountingCustomerParty') || xmlDoc.querySelector('AccountingCustomerParty')
      if (customerParty) {
        let nameEl = customerParty.querySelector('cac\\:Party cac\\:PartyName cbc\\:Name')
        if (!nameEl) nameEl = customerParty.querySelector('Party PartyName Name')
        if (!nameEl) nameEl = customerParty.querySelector('cbc\\:Name')
        if (nameEl) {
          const name = nameEl.textContent.trim()
          if (name && name !== 'Türkiye' && name.length > 3) {
            customer = name
          }
        }
      }
    }
    
    // Fatura Tipi
    const invoiceTypeCode = previewDoc?.invoiceTypeCode || xmlDoc.querySelector('cbc\\:InvoiceTypeCode')?.textContent || 'SATIS'
    
    // Açıklama
    let description = previewDoc?.description || ''
    if (!description) {
      const noteEl = xmlDoc.querySelector('cbc\\:Note')
      if (noteEl) {
        description = noteEl.textContent.trim()
      }
    }
    
    // ============ KDV DETAYLARI - previewDoc'tan AL ============
    let taxDetails = previewDoc?.taxDetails || []
    let totalAmount = previewDoc?.amount || 0
    let totalTax = previewDoc?.tax || 0
    let totalSum = previewDoc?.total || 0
    
    // Eğer taxDetails boşsa XML'den oku
    if (taxDetails.length === 0) {
      const taxTotal = xmlDoc.querySelector('cac\\:TaxTotal') || xmlDoc.querySelector('TaxTotal')
      if (taxTotal) {
        const subtotals = taxTotal.querySelectorAll('cac\\:TaxSubtotal') || taxTotal.querySelectorAll('TaxSubtotal')
        subtotals.forEach((subtotal) => {
          let rate = 0
          const rateEl = subtotal.querySelector('cbc\\:Percent') || subtotal.querySelector('Percent')
          if (rateEl) {
            rate = parseFloat(rateEl.textContent.trim().replace(',', '.')) || 0
          }
          let taxableAmount = 0
          const taxableEl = subtotal.querySelector('cbc\\:TaxableAmount') || subtotal.querySelector('TaxableAmount')
          if (taxableEl) {
            taxableAmount = parseFloat(taxableEl.textContent.trim().replace(',', '.')) || 0
          }
          let taxAmount = 0
          const taxAmountEl = subtotal.querySelector('cbc\\:TaxAmount') || subtotal.querySelector('TaxAmount')
          if (taxAmountEl) {
            taxAmount = parseFloat(taxAmountEl.textContent.trim().replace(',', '.')) || 0
          }
          if (taxableAmount === 0 && taxAmount > 0 && rate > 0) {
            taxableAmount = taxAmount / (rate / 100)
          }
          if (taxAmount === 0 && taxableAmount > 0 && rate > 0) {
            taxAmount = taxableAmount * (rate / 100)
          }
          const subtotalSum = taxableAmount + taxAmount
          if (taxableAmount > 0 || taxAmount > 0) {
            taxDetails.push({
              rate: rate,
              taxableAmount: taxableAmount,
              taxAmount: taxAmount,
              total: subtotalSum
            })
            totalAmount += taxableAmount
            totalTax += taxAmount
            totalSum += subtotalSum
          }
        })
      }
    }
    
    // KDV detaylarını HTML olarak oluştur
    let taxDetailsHTML = ''
    if (taxDetails.length > 0) {
      taxDetails.forEach((item, index) => {
        taxDetailsHTML += `
          <div class="flex justify-between items-center py-1.5 ${index < taxDetails.length - 1 ? 'border-b border-gray-200' : ''}">
            <span class="text-gray-600 text-sm font-medium w-16">%${item.rate}</span>
            <span class="text-gray-700 text-sm w-24 text-right">${item.taxableAmount.toFixed(2)} ₺</span>
            <span class="text-gray-400 text-sm">+</span>
            <span class="text-gray-700 text-sm w-24 text-right">${item.taxAmount.toFixed(2)} ₺</span>
            <span class="text-gray-400 text-sm">=</span>
            <span class="text-gray-800 font-medium text-sm w-28 text-right">${item.total.toFixed(2)} ₺</span>
          </div>
        `
      })
    } else {
      taxDetailsHTML = `
        <div class="text-center text-gray-400 py-2 text-sm">
          KDV bilgisi bulunamadı
        </div>
      `
    }
    
    // Fatura tipi etiketi
    let typeLabel = '📄 Satış Faturası'
    const typeCode = (invoiceTypeCode || 'SATIS').toUpperCase()
    if (typeCode === 'IADE' || typeCode === 'İADE') {
      typeLabel = '🔄 İade Faturası'
    } else if (typeCode === 'TEVKIFAT') {
      typeLabel = '🏛️ Tevkifatlı Fatura'
    }
    
    console.log('📊 Önizleme Verileri:', {
      invoiceNo, date, supplier, customer, invoiceTypeCode: typeCode,
      totalAmount, totalTax, totalSum, taxDetails
    })
    
    return `
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <!-- Fatura Başlığı -->
        <div class="bg-gradient-to-r from-blue-600 to-blue-800 p-4 text-white">
          <div class="flex justify-between items-center">
            <div>
              <h1 class="text-2xl font-bold">FATURA</h1>
              <p class="text-blue-200 text-sm">No: ${invoiceNo}</p>
            </div>
            <div class="text-right">
              <p class="text-sm text-blue-200">Tarih</p>
              <p class="font-medium">${date}</p>
            </div>
          </div>
          <div class="mt-2 inline-block bg-white/20 px-3 py-1 rounded-full text-sm font-medium">
            ${typeLabel}
          </div>
        </div>
        
        <!-- Firma Bilgileri -->
        <div class="grid grid-cols-2 gap-4 p-4 border-b border-gray-200">
          <div>
            <p class="text-xs text-gray-500 font-semibold uppercase">Satıcı</p>
            <p class="text-gray-800 font-medium">${supplier || '---'}</p>
          </div>
          <div>
            <p class="text-xs text-gray-500 font-semibold uppercase">Alıcı</p>
            <p class="text-gray-800 font-medium">${customer || '---'}</p>
          </div>
        </div>
        
        <!-- Açıklama -->
        ${description ? `
          <div class="p-4 border-b border-gray-200 bg-gray-50">
            <p class="text-xs text-gray-500 font-semibold uppercase">Açıklama</p>
            <p class="text-gray-700 text-sm">${description}</p>
          </div>
        ` : ''}
        
        <!-- Çoklu KDV Detayları -->
        <div class="p-4 bg-gray-50">
          <p class="text-xs text-gray-500 font-semibold uppercase mb-2">KDV Dökümü</p>
          <div class="space-y-1">
            <div class="flex justify-between items-center py-1.5 border-b border-gray-300 font-semibold text-gray-500 text-xs">
              <span class="w-16">Oran</span>
              <span class="w-24 text-right">Matrah</span>
              <span class="w-6 text-center"></span>
              <span class="w-24 text-right">KDV</span>
              <span class="w-6 text-center"></span>
              <span class="w-28 text-right">Toplam</span>
            </div>
            ${taxDetailsHTML}
          </div>
        </div>
        
        <!-- Toplam Tutar -->
        <div class="p-4 bg-gray-100 border-t border-gray-200">
          <div class="flex justify-between items-center">
            <span class="text-gray-800 font-bold">Genel Toplam</span>
            <span class="text-blue-600 font-bold text-xl">${totalSum.toFixed(2)} ₺</span>
          </div>
          <div class="flex justify-between text-sm text-gray-500 mt-1">
            <span>Toplam Matrah: ${totalAmount.toFixed(2)} ₺</span>
            <span>Toplam KDV: ${totalTax.toFixed(2)} ₺</span>
          </div>
        </div>
        
        <!-- Fatura Tipi Bilgisi -->
        <div class="px-4 py-2 bg-gray-100 border-t border-gray-200 text-xs text-gray-500 flex justify-between">
          <span>Fatura Tipi: ${typeCode}</span>
          <span>${previewDoc?.vendorCheck?.status === 'found' ? '✅ Firma bulundu' : '⚠️ Firma bulunamadı'}</span>
        </div>
      </div>
    `
  } catch (error) {
    console.error('❌ HTML oluşturma hatası:', error)
    return `
      <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
        <p class="text-red-600 font-medium">❌ HTML Oluşturma Hatası</p>
        <p class="text-red-500 text-sm">${error.message}</p>
      </div>
      <pre class="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-gray-100 p-4 rounded-lg max-h-96 overflow-auto">${xmlContent}</pre>
    `
  }
}
  const openEdit = (doc) => {
    setSelectedDoc({ ...doc })
    setShowModal(true)
    setEditMode(true)
  }

  const saveEdit = () => {
    if (!selectedDoc) return
    
    setDocuments(documents.map(d => 
      d.id === selectedDoc.id ? { ...selectedDoc, status: 'pending' } : d
    ))
    
    setShowModal(false)
    setSelectedDoc(null)
    setEditMode(false)
    alert('✅ Fatura bilgileri güncellendi!')
  }

  const editFromPreview = () => {
    setShowPreview(false)
    setSelectedDoc({ ...previewDoc })
    setShowModal(true)
    setEditMode(true)
  }

  const confirmDocument = (id) => {
    const doc = documents.find(d => d.id === id)
    if (doc && doc.status === 'pending') {
      aiService.learn(doc.vendor, doc.suggestedAccount, doc.accountName)
      setDocuments(documents.map(d => 
        d.id === id ? { ...d, status: 'confirmed' } : d
      ))
      const updated = aiService.loadLearnedMatches()
      setLearnedMatches(updated)
    }
  }

  const rejectDocument = (id) => {
    setDocuments(documents.map(d => 
      d.id === id ? { ...d, status: 'rejected' } : d
    ))
  }

  const deleteDocument = (id) => {
    setDocuments(documents.filter(d => d.id !== id))
  }

  const exportToExcel = () => {
    const confirmedDocs = documents.filter(d => d.status === 'confirmed')
    if (confirmedDocs.length === 0) {
      alert('Lütfen önce belgeleri onaylayın!')
      return
    }
    
    const excelData = aiService.exportToLuca(confirmedDocs)
    const blob = new Blob([excelData], { type: 'application/octet-stream' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `MUBIS_LUCA_Export_${new Date().toISOString().split('T')[0]}.xlsx`
    link.click()
    
    alert('✅ Excel dosyası oluşturuldu ve indiriliyor!')
  }

  const removeFile = (id) => {
    setFiles(files.filter(f => f.id !== id))
  }

  const clearAll = () => {
    if (window.confirm('Tüm belgeler silinecek. Devam etmek istiyor musunuz?')) {
      setDocuments([])
      setFiles([])
    }
  }

  const stats = {
    total: documents.length,
    confirmed: documents.filter(d => d.status === 'confirmed').length,
    pending: documents.filter(d => d.status === 'pending').length,
    highConfidence: documents.filter(d => d.confidence >= 90).length,
    totalAmount: documents.reduce((sum, d) => sum + d.total, 0),
    foundVendors: documents.filter(d => d.vendorCheck?.status === 'found').length,
    notFoundVendors: documents.filter(d => d.vendorCheck?.status === 'not_found').length,
    giden: documents.filter(d => d.invoiceType === 'giden').length,
    gelen: documents.filter(d => d.invoiceType === 'gelen').length,
  }

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const getVendorStatusIcon = (vendorCheck) => {
    if (!vendorCheck) return <Clock className="w-4 h-4 text-gray-400" title="Kontrol edilmedi" />
    if (vendorCheck.status === 'found') {
      return <CheckCircle className="w-4 h-4 text-green-400" title="✅ Firma bulundu" />
    }
    return <AlertTriangle className="w-4 h-4 text-yellow-400" title="⚠️ Firma bulunamadı!" />
  }

  const getTypeIcon = (type) => {
    if (type === 'giden') return <span className="text-green-400">📤</span>
    return <span className="text-blue-400">📥</span>
  }

  const getTypeLabel = (type) => {
    return type === 'giden' ? 'Giden (Satış)' : 'Gelen (Alış)'
  }

  const getInvoiceTypeCodeLabel = (code) => {
    if (!code) return 'SATIS'
    const upper = code.toUpperCase()
    if (upper === 'IADE' || upper === 'İADE') return 'İADE'
    if (upper === 'TEVKIFAT') return 'TEVKIFAT'
    return 'SATIS'
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center space-x-3">
            <Brain className="w-8 h-8 text-yellow-400" />
            <span>MUBİS Smart Import AI</span>
          </h1>
          <p className="text-gray-400 mt-1">
            Yapay zeka ile belgeleri okuyun, firmaları kontrol edin, hesap kodlarını eşleştirin
          </p>
        </div>
        <div className="flex flex-wrap gap-2 mt-4 md:mt-0">
          <button 
            onClick={clearAll}
            className="bg-red-500/20 text-red-400 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-500/30 transition-all duration-300 flex items-center space-x-2"
          >
            <Trash2 className="w-4 h-4" />
            <span>Temizle</span>
          </button>
          <button 
            onClick={exportToExcel}
            className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 flex items-center space-x-2"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>LUCA Excel</span>
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 px-4 py-2 rounded-lg text-sm font-semibold hover:shadow-lg hover:shadow-yellow-500/30 transition-all duration-300 flex items-center space-x-2"
          >
            <Upload className="w-4 h-4" />
            <span>Belge Yükle</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml,.pdf,.jpg,.jpeg,.png"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* Musteri Secimi + Fatura Tipi */}
      <div className="bg-blue-800/20 rounded-2xl p-4 border border-blue-700/30 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Musteri Secimi */}
          <div>
            <label className="text-gray-400 text-xs block mb-1">Musteri *</label>
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-yellow-400"
            >
              <option value="">Musteri Seciniz</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>{client.name || client.company}</option>
              ))}
            </select>
          </div>

          {/* Fatura Tipi */}
          <div>
            <label className="text-gray-400 text-xs block mb-1">Fatura Tipi</label>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setGlobalInvoiceType('gelen')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  globalInvoiceType === 'gelen' 
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' 
                    : 'bg-gray-700/50 text-gray-400 hover:text-white hover:bg-gray-600/50'
                }`}
              >
                Gelen (Alis)
              </button>
              <button
                onClick={() => setGlobalInvoiceType('giden')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  globalInvoiceType === 'giden' 
                    ? 'bg-green-500 text-white shadow-lg shadow-green-500/30' 
                    : 'bg-gray-700/50 text-gray-400 hover:text-white hover:bg-gray-600/50'
                }`}
              >
                Giden (Satis)
              </button>
            </div>
          </div>

          {/* Dosya Durumu */}
          <div className="flex items-end">
            <div className="text-gray-400 text-sm py-2">
              {selectedClient ? (
                <span className="text-green-400">
                  {clients.find(c => c.id === parseInt(selectedClient))?.name || clients.find(c => c.id === selectedClient)?.name || 'Secili'}
                </span>
              ) : (
                <span className="text-yellow-400">Lutfen musteri seciniz</span>
              )}
              {files.length > 0 && <span className="ml-2">| {files.length} dosya</span>}
            </div>
          </div>
        </div>
      </div>

      {/* İstatistikler */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-blue-800/20 rounded-xl p-4 border border-blue-700/30 text-center">
          <div className="text-2xl font-bold text-white">{stats.total}</div>
          <div className="text-gray-400 text-xs">Toplam Belge</div>
        </div>
        <div className="bg-green-500/10 rounded-xl p-4 border border-green-500/30 text-center">
          <div className="text-2xl font-bold text-green-400">{stats.giden}</div>
          <div className="text-gray-400 text-xs">📤 Giden (Satış)</div>
        </div>
        <div className="bg-blue-500/10 rounded-xl p-4 border border-blue-500/30 text-center">
          <div className="text-2xl font-bold text-blue-400">{stats.gelen}</div>
          <div className="text-gray-400 text-xs">📥 Gelen (Alış)</div>
        </div>
        <div className="bg-yellow-500/10 rounded-xl p-4 border border-yellow-500/30 text-center">
          <div className="text-2xl font-bold text-yellow-400">
            {stats.totalAmount.toFixed(2).replace('.', ',')} ₺
          </div>
          <div className="text-gray-400 text-xs">Toplam Tutar</div>
        </div>
      </div>

      {/* Yüklenen Dosyalar */}
      {files.length > 0 && (
        <div className="bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">
              Yüklenen Belgeler ({files.length})
            </h3>
            <button
              onClick={processFiles}
              disabled={processing}
              className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-300 flex items-center space-x-2 disabled:opacity-50"
            >
              {processing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              <span>{processing ? 'İşleniyor...' : 'AI ile İşle'}</span>
            </button>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {files.map((file) => (
              <div key={file.id} className="flex items-center justify-between p-3 bg-blue-900/30 rounded-lg">
                <div className="flex items-center space-x-3">
                  <FileText className="w-5 h-5 text-yellow-400" />
                  <div>
                    <div className="text-white text-sm">{file.name}</div>
                    <div className="text-gray-500 text-xs">{formatFileSize(file.size)}</div>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(file.id)}
                  className="text-gray-400 hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-500/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* İşlenmiş Belgeler Tablosu */}
      <div className="bg-blue-800/20 rounded-2xl border border-blue-700/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-blue-900/30">
              <tr className="text-left text-gray-400 text-sm">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Belge</th>
                <th className="px-4 py-3">Tip</th>
                <th className="px-4 py-3">Fatura Tipi</th>
                <th className="px-4 py-3">Firma</th>
                <th className="px-4 py-3">VKN</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">Tarih</th>
                <th className="px-4 py-3">Matrah</th>
                <th className="px-4 py-3">KDV</th>
                <th className="px-4 py-3">Toplam</th>
                <th className="px-4 py-3">Hesap</th>
                <th className="px-4 py-3">Güven</th>
                <th className="px-4 py-3">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 ? (
                <tr>
                  <td colSpan="14" className="text-center py-8 text-gray-400">
                    Henüz belge işlenmemiş. Belgelerinizi yükleyin ve AI ile işleyin.
                  </td>
                </tr>
              ) : (
                documents.map((doc, index) => (
                  <tr key={doc.id} className="border-t border-blue-700/30 hover:bg-blue-800/20 transition-colors">
                    <td className="px-4 py-3 text-gray-400">{index + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        <FileText className="w-4 h-4 text-yellow-400" />
                        <span className="text-white text-sm truncate max-w-[100px]">{doc.fileName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-1">
                        {getTypeIcon(doc.invoiceType)}
                        <span className={`text-xs font-medium ${doc.invoiceType === 'giden' ? 'text-green-400' : 'text-blue-400'}`}>
                          {getTypeLabel(doc.invoiceType)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        doc.invoiceTypeCode?.toUpperCase() === 'IADE' || doc.invoiceTypeCode?.toUpperCase() === 'İADE' 
                          ? 'bg-yellow-500/20 text-yellow-400' 
                          : doc.invoiceTypeCode?.toUpperCase() === 'TEVKIFAT'
                          ? 'bg-purple-500/20 text-purple-400'
                          : 'bg-green-500/20 text-green-400'
                      }`}>
                        {getInvoiceTypeCodeLabel(doc.invoiceTypeCode)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{doc.vendor}</td>
                    <td className="px-4 py-3 text-gray-400 text-sm">{doc.vkn || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-1">
                        {getVendorStatusIcon(doc.vendorCheck)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">{doc.date}</td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{doc.amount.toFixed(2)} ₺</td>
                    <td className="px-4 py-3 text-gray-300 text-sm">{doc.tax.toFixed(2)} ₺</td>
                    <td className="px-4 py-3 text-gray-300 font-medium text-sm">{doc.total.toFixed(2)} ₺</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-yellow-400 text-sm font-medium">{doc.suggestedAccount}</span>
                        <span className="text-gray-400 text-xs">{doc.accountName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        <span className={`text-sm font-bold ${doc.confidence >= 90 ? 'text-green-400' : doc.confidence >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                          %{doc.confidence}
                        </span>
                        <div className="w-12 h-1.5 bg-blue-900/50 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${doc.confidence >= 90 ? 'bg-green-400' : doc.confidence >= 70 ? 'bg-yellow-400' : 'bg-red-400'}`}
                            style={{ width: `${doc.confidence}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex space-x-1">
                        <button 
                          onClick={() => openPreview(doc)}
                          className="text-gray-400 hover:text-blue-400 transition-colors p-1"
                          title="Önizle"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => openEdit(doc)}
                          className="text-gray-400 hover:text-yellow-400 transition-colors p-1"
                          title="Düzenle"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        {doc.status === 'pending' && (
                          <button 
                            onClick={() => confirmDocument(doc.id)}
                            className="text-gray-400 hover:text-green-400 transition-colors p-1"
                            title="Onayla"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                        {doc.status === 'pending' && (
                          <button 
                            onClick={() => rejectDocument(doc.id)}
                            className="text-gray-400 hover:text-red-400 transition-colors p-1"
                            title="Reddet"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                        <button 
                          onClick={() => deleteDocument(doc.id)}
                          className="text-gray-400 hover:text-red-400 transition-colors p-1"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Öğrenen Sistem */}
      {learnedMatches.length > 0 && (
        <div className="mt-6 bg-blue-800/20 rounded-2xl p-6 border border-blue-700/30">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-yellow-400" />
            <span>Öğrenen Sistem - Hesap Eşleştirme Önerileri</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {learnedMatches.map((item, index) => (
              <div key={index} className="bg-blue-900/30 rounded-xl p-4 border border-blue-700/30">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-medium">{item.vendor}</div>
                    <div className="text-yellow-400 text-sm">{item.accountCode}</div>
                    <div className="text-gray-400 text-xs">{item.accountName}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-gray-400 text-xs">{item.usage} kez</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============ FATURA ÖNİZLEME MODAL ============ */}
      {showPreview && previewDoc && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[95vh] overflow-y-auto shadow-2xl">
            
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-xl font-bold text-gray-800 flex items-center space-x-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <span>Fatura Önizleme</span>
                </h2>
                <p className="text-gray-500 text-sm">{previewDoc.fileName}</p>
              </div>
              <div className="flex items-center space-x-2">
                <button 
                  onClick={() => {
                    if (previewDoc.rawXML) {
                      const blob = new Blob([previewDoc.rawXML], { type: 'application/xml' })
                      const link = document.createElement('a')
                      link.href = URL.createObjectURL(blob)
                      link.download = previewDoc.fileName
                      link.click()
                    }
                  }}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-1"
                >
                  <Download className="w-4 h-4" />
                  <span>İndir</span>
                </button>
                <button 
                  onClick={editFromPreview}
                  className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center space-x-1"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Düzenle</span>
                </button>
                <button 
                  onClick={() => setShowPreview(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-2 rounded-lg hover:bg-gray-100"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6">
              {previewDoc.rawXML ? (
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 overflow-auto max-h-[70vh]">
                  <div dangerouslySetInnerHTML={{ __html: renderInvoiceHTML(previewDoc.rawXML) }} />
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p>XML içeriği bulunamadı</p>
                </div>
              )}
            </div>

            <div className="border-t border-gray-200 p-4 bg-gray-50 rounded-b-2xl">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-gray-500 text-xs block">Firma</label>
                  <div className="text-gray-800 font-medium">{previewDoc.vendor}</div>
                </div>
                <div>
                  <label className="text-gray-500 text-xs block">VKN</label>
                  <div className="text-gray-800 font-medium">{previewDoc.vkn || '-'}</div>
                </div>
                <div>
                  <label className="text-gray-500 text-xs block">Tarih</label>
                  <div className="text-gray-800 font-medium">{previewDoc.date}</div>
                </div>
                <div>
                  <label className="text-gray-500 text-xs block">Toplam</label>
                  <div className="text-gray-800 font-bold text-lg">{previewDoc.total.toFixed(2)} ₺</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Tarafindan Eklenen Hesaplar */}
      {selectedClient && autoAddedAccounts.length > 0 && (
        <div className="bg-yellow-500/5 rounded-2xl p-6 border border-yellow-500/20 mt-6">
          <h3 className="text-yellow-400 font-semibold flex items-center space-x-2 mb-3">
            <Hash className="w-5 h-5" />
            <span>AI Tarafindan Eklenen Hesap Kodlari ({autoAddedAccounts.length})</span>
          </h3>
          <p className="text-gray-400 text-sm mb-3">Bu hesap kodlarini LUCA'ya manuel olarak eklemeniz gerekir.</p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-blue-900/30">
                <tr className="text-left text-gray-400 text-sm">
                  <th className="px-4 py-2">Hesap Kodu</th>
                  <th className="px-4 py-2">Hesap Adi</th>
                </tr>
              </thead>
              <tbody>
                {autoAddedAccounts.map((acc) => (
                  <tr key={acc.id} className="border-t border-blue-700/20">
                    <td className="px-4 py-2 text-yellow-400 text-sm font-mono font-medium">{acc.code}</td>
                    <td className="px-4 py-2 text-white text-sm">{acc.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============ DÜZENLEME MODAL ============ */}
      {showModal && selectedDoc && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-blue-950 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-blue-700/50 shadow-2xl">
            <div className="sticky top-0 bg-blue-950 border-b border-blue-700/50 p-5 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white flex items-center space-x-2">
                <Edit3 className="w-5 h-5 text-yellow-400" />
                <span>Fatura Düzenle</span>
              </h2>
              <button 
                onClick={() => { setShowModal(false); setSelectedDoc(null); }}
                className="text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-blue-800/30"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="text-gray-400 text-sm block mb-1">Firma</label>
                  <input
                    type="text"
                    value={selectedDoc.vendor}
                    onChange={(e) => setSelectedDoc({...selectedDoc, vendor: e.target.value})}
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Tip</label>
                    <select
                      value={selectedDoc.invoiceType || 'gelen'}
                      onChange={(e) => setSelectedDoc({...selectedDoc, invoiceType: e.target.value})}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                    >
                      <option value="giden">📤 Giden (Satış)</option>
                      <option value="gelen">📥 Gelen (Alış)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Tarih</label>
                    <input
                      type="date"
                      value={selectedDoc.date}
                      onChange={(e) => setSelectedDoc({...selectedDoc, date: e.target.value})}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Matrah</label>
                    <input
                      type="number"
                      step="0.01"
                      value={selectedDoc.amount}
                      onChange={(e) => setSelectedDoc({...selectedDoc, amount: parseFloat(e.target.value) || 0})}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">KDV</label>
                    <input
                      type="number"
                      step="0.01"
                      value={selectedDoc.tax}
                      onChange={(e) => setSelectedDoc({...selectedDoc, tax: parseFloat(e.target.value) || 0})}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm block mb-1">Toplam</label>
                    <input
                      type="number"
                      step="0.01"
                      value={selectedDoc.total}
                      onChange={(e) => setSelectedDoc({...selectedDoc, total: parseFloat(e.target.value) || 0})}
                      className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-gray-400 text-sm block mb-1">Hesap Kodu</label>
                  <input
                    type="text"
                    value={selectedDoc.suggestedAccount}
                    onChange={(e) => setSelectedDoc({...selectedDoc, suggestedAccount: e.target.value})}
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-gray-400 text-sm block mb-1">Hesap Adı</label>
                  <input
                    type="text"
                    value={selectedDoc.accountName}
                    onChange={(e) => setSelectedDoc({...selectedDoc, accountName: e.target.value})}
                    className="w-full bg-blue-900/30 border border-blue-700/50 rounded-lg py-2 px-4 text-white focus:outline-none focus:border-yellow-400 transition-colors"
                  />
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => { setShowModal(false); setSelectedDoc(null); }}
                  className="flex-1 bg-blue-800/50 text-gray-300 py-2.5 rounded-lg hover:bg-blue-700/50 transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={saveEdit}
                  className="flex-1 bg-gradient-to-r from-yellow-400 to-yellow-600 text-blue-950 py-2.5 rounded-lg font-semibold hover:shadow-lg hover:shadow-yellow-500/30 transition-all duration-300 flex items-center justify-center space-x-2"
                >
                  <Save className="w-5 h-5" />
                  <span>Kaydet</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}