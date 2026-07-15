// 📄 AI Servisi - Firma Ünvanı Okuma ve Hesap Eşleştirme
import * as XLSX from 'xlsx'

export class AIService {
  constructor() {
    this.learnedMatches = this.loadLearnedMatches()
    this.accountPlan = this.loadAccountPlan()
    this.clientAccountPlan = this.loadClientAccountPlan()
    this.vendorList = this.loadVendorList()
  }

  loadVendorList() {
    const stored = localStorage.getItem('mubis_vendor_list')
    return stored ? JSON.parse(stored) : []
  }

  addVendor(vendorData) {
    const list = this.loadVendorList()
    const existing = list.find(v => 
      v.name.toLowerCase() === vendorData.name.toLowerCase() ||
      v.vkn === vendorData.vkn
    )
    if (existing) {
      return { success: false, error: 'Bu firma zaten listede!', vendor: existing }
    }
    const newVendor = {
      id: Date.now(),
      name: vendorData.name,
      vkn: vendorData.vkn || '',
      accountCode: vendorData.accountCode || '',
      accountName: vendorData.accountName || '',
      taxOffice: vendorData.taxOffice || '',
      address: vendorData.address || '',
      phone: vendorData.phone || '',
      email: vendorData.email || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    list.push(newVendor)
    localStorage.setItem('mubis_vendor_list', JSON.stringify(list))
    this.vendorList = list
    return { success: true, vendor: newVendor }
  }

  findVendor(searchTerm) {
    const list = this.loadVendorList()
    const term = searchTerm.toLowerCase()
    return list.filter(v => 
      v.name.toLowerCase().includes(term) ||
      v.vkn.includes(term) ||
      v.accountCode.includes(term)
    )
  }

  getAccountCodeByVendor(vendorName) {
    const list = this.loadVendorList()
    const found = list.find(v => 
      v.name.toLowerCase() === vendorName.toLowerCase() ||
      vendorName.toLowerCase().includes(v.name.toLowerCase()) ||
      v.name.toLowerCase().includes(vendorName.toLowerCase())
    )
    if (found) {
      return {
        found: true,
        vendor: found,
        accountCode: found.accountCode,
        accountName: found.accountName
      }
    }
    const similar = list.filter(v => 
      v.name.toLowerCase().includes(vendorName.toLowerCase().substring(0, 5)) ||
      vendorName.toLowerCase().includes(v.name.toLowerCase().substring(0, 5))
    )
    if (similar.length > 0) {
      return {
        found: true,
        vendor: similar[0],
        accountCode: similar[0].accountCode,
        accountName: similar[0].accountName,
        isSimilar: true
      }
    }
    return {
      found: false,
      vendor: null,
      accountCode: null,
      accountName: null,
      isSimilar: false
    }
  }

  getVendorsByAccountCode(accountCode) {
    const list = this.loadVendorList()
    return list.filter(v => v.accountCode === accountCode)
  }

  loadVendorListFromExcel(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result)
          const workbook = XLSX.read(data, { type: 'array' })
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
          const jsonData = XLSX.utils.sheet_to_json(firstSheet)
          const vendors = jsonData.map(row => ({
            id: Date.now() + Math.random() * 1000,
            name: String(row['Firma Ünvanı'] || row['Ünvan'] || row['Firma'] || row['name'] || '').trim(),
            vkn: String(row['VKN'] || row['Vergi No'] || row['vkn'] || '').trim(),
            accountCode: String(row['Hesap Kodu'] || row['Kod'] || row['accountCode'] || '').trim(),
            accountName: String(row['Hesap Adı'] || row['Ad'] || row['accountName'] || '').trim(),
            taxOffice: String(row['Vergi Dairesi'] || row['taxOffice'] || '').trim(),
            address: String(row['Adres'] || row['address'] || '').trim(),
            phone: String(row['Telefon'] || row['phone'] || '').trim(),
            email: String(row['Email'] || row['email'] || '').trim(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          })).filter(v => v.name)
          if (vendors.length === 0) {
            reject(new Error('Excel dosyasında firma bilgisi bulunamadı!'))
            return
          }
          const currentList = this.loadVendorList()
          const mergedList = [...currentList]
          vendors.forEach(v => {
            const existing = mergedList.find(m => 
              m.name.toLowerCase() === v.name.toLowerCase() ||
              (m.vkn && v.vkn && m.vkn === v.vkn)
            )
            if (!existing) {
              mergedList.push(v)
            }
          })
          localStorage.setItem('mubis_vendor_list', JSON.stringify(mergedList))
          this.vendorList = mergedList
          resolve({ vendors, total: vendors.length, merged: mergedList.length })
        } catch (error) {
          reject(error)
        }
      }
      reader.readAsArrayBuffer(file)
    })
  }

  updateVendor(id, data) {
    const list = this.loadVendorList()
    const index = list.findIndex(v => v.id === id)
    if (index === -1) return { success: false, error: 'Firma bulunamadı!' }
    list[index] = { ...list[index], ...data, updatedAt: new Date().toISOString() }
    localStorage.setItem('mubis_vendor_list', JSON.stringify(list))
    this.vendorList = list
    return { success: true, vendor: list[index] }
  }

  deleteVendor(id) {
    const list = this.loadVendorList().filter(v => v.id !== id)
    localStorage.setItem('mubis_vendor_list', JSON.stringify(list))
    this.vendorList = list
    return { success: true }
  }

  loadAccountPlan() {
    const stored = localStorage.getItem('mubis_account_plan')
    if (stored) return JSON.parse(stored)
    return [
      { code: '120.01.01', name: 'Alıcılar (Yurtiçi)' },
      { code: '120.01.02', name: 'Alıcılar (Yurtdışı)' },
      { code: '120.01.34', name: 'Alıcılar - Opet' },
      { code: '120.01.35', name: 'Alıcılar - Shell' },
      { code: '120.01.36', name: 'Alıcılar - BP' },
      { code: '153.01', name: 'Ticari Mallar' },
      { code: '153.02', name: 'Hammadde' },
      { code: '153.03', name: 'Yarı Mamul' },
      { code: '153.04', name: 'Mamul' },
      { code: '153.05', name: 'Demirbaşlar' },
      { code: '157.01', name: 'Stok - Akaryakıt' },
      { code: '157.02', name: 'Stok - Kırtasiye' },
      { code: '157.03', name: 'Stok - Temizlik' },
      { code: '157.04', name: 'Stok - Sarf' },
      { code: '257', name: 'Demirbaşlar' },
      { code: '257.01', name: 'Bilgisayar' },
      { code: '257.02', name: 'Mobilya' },
      { code: '257.03', name: 'Araç' },
      { code: '600', name: 'Yurtiçi Satışlar' },
      { code: '600.01', name: 'Kira Gelirleri' },
      { code: '601', name: 'Hizmet Gelirleri' },
      { code: '610', name: 'Satış İadeleri' },
      { code: '642', name: 'Faiz Gelirleri' },
      { code: '649', name: 'Diğer Gelirler' },
      { code: '770.01', name: 'Kırtasiye Giderleri' },
      { code: '770.02', name: 'Telefon Giderleri' },
      { code: '770.03', name: 'Akaryakıt Giderleri' },
      { code: '770.04', name: 'Kira Giderleri' },
      { code: '770.05', name: 'Elektrik Giderleri' },
      { code: '770.06', name: 'Su Giderleri' },
      { code: '770.07', name: 'Doğalgaz Giderleri' },
      { code: '770.08', name: 'Temizlik Giderleri' },
      { code: '770.09', name: 'Bakım Onarım Giderleri' },
      { code: '770.10', name: 'Reklam Giderleri' },
      { code: '770.11', name: 'Yemek Giderleri' },
      { code: '770.12', name: 'Ulaşım Giderleri' },
      { code: '770.13', name: 'Konaklama Giderleri' },
      { code: '770.14', name: 'Eğitim Giderleri' },
      { code: '770.15', name: 'Sarf Malzemeleri' },
      { code: '770.16', name: 'SGK Prim Giderleri' },
      { code: '780', name: 'Hizmet Giderleri' },
      { code: '789', name: 'Çeşitli Giderler' },
    ]
  }

  loadAccountPlanFromExcel(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result)
          const workbook = XLSX.read(data, { type: 'array' })
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
          const jsonData = XLSX.utils.sheet_to_json(firstSheet)
          const plan = jsonData.map(row => ({
            code: String(row['Hesap Kodu'] || row['Kod'] || row['code'] || '').trim(),
            name: String(row['Hesap Adı'] || row['Ad'] || row['name'] || '').trim()
          })).filter(item => item.code && item.name)
          if (plan.length === 0) {
            reject(new Error('Excel dosyasında hesap planı bulunamadı!'))
            return
          }
          resolve(plan)
        } catch (error) {
          reject(error)
        }
      }
      reader.readAsArrayBuffer(file)
    })
  }

  getAccountNameByCode(code) {
    const plan = this.loadAccountPlan()
    const found = plan.find(a => a.code === code)
    return found ? found.name : null
  }

  suggestAccountCode(vendorName, invoiceType, invoiceTypeCode) {
    const lowerName = vendorName.toLowerCase()
    
    if (invoiceTypeCode === 'IADE' || invoiceTypeCode === 'İADE' || 
        invoiceTypeCode?.toUpperCase() === 'IADE' || 
        invoiceTypeCode?.toUpperCase() === 'İADE') {
      return { code: '610', name: 'Satış İadeleri' }
    }
    
    if (invoiceTypeCode === 'TEVKIFAT' || invoiceTypeCode?.toUpperCase() === 'TEVKIFAT') {
      return { code: '191', name: 'İndirilecek KDV (Tevkifat)' }
    }
    
    if (invoiceType === 'giden') {
      if (lowerName.includes('kira') || lowerName.includes('emlak')) {
        return { code: '600.01', name: 'Kira Gelirleri' }
      } else if (lowerName.includes('faiz') || lowerName.includes('banka')) {
        return { code: '642', name: 'Faiz Gelirleri' }
      } else if (lowerName.includes('satış') || lowerName.includes('ticaret')) {
        return { code: '600', name: 'Yurtiçi Satışlar' }
      } else if (lowerName.includes('hizmet')) {
        return { code: '601', name: 'Hizmet Gelirleri' }
      } else {
        return { code: '649', name: 'Diğer Gelirler' }
      }
    } else {
      if (lowerName.includes('opet') || lowerName.includes('shell') || lowerName.includes('bp') || lowerName.includes('akaryakıt')) {
        return { code: '770.03', name: 'Akaryakıt Giderleri' }
      } else if (lowerName.includes('telekom') || lowerName.includes('vodafone') || lowerName.includes('turkcell')) {
        return { code: '770.02', name: 'Telefon Giderleri' }
      } else if (lowerName.includes('migros') || lowerName.includes('bim') || lowerName.includes('a101')) {
        return { code: '770.15', name: 'Sarf Malzemeleri' }
      } else if (lowerName.includes('koçtaş') || lowerName.includes('teknosa') || lowerName.includes('vatan')) {
        return { code: '257', name: 'Demirbaşlar' }
      } else if (lowerName.includes('kira') || lowerName.includes('emlak')) {
        return { code: '770.04', name: 'Kira Giderleri' }
      } else if (lowerName.includes('elektrik') || lowerName.includes('enerji')) {
        return { code: '770.05', name: 'Elektrik Giderleri' }
      } else if (lowerName.includes('su')) {
        return { code: '770.06', name: 'Su Giderleri' }
      } else if (lowerName.includes('doğalgaz')) {
        return { code: '770.07', name: 'Doğalgaz Giderleri' }
      } else if (lowerName.includes('temizlik')) {
        return { code: '770.08', name: 'Temizlik Giderleri' }
      } else if (lowerName.includes('yemek')) {
        return { code: '770.11', name: 'Yemek Giderleri' }
      } else if (lowerName.includes('ulaşım') || lowerName.includes('taksi')) {
        return { code: '770.12', name: 'Ulaşım Giderleri' }
      } else if (lowerName.includes('konaklama') || lowerName.includes('otel')) {
        return { code: '770.13', name: 'Konaklama Giderleri' }
      } else if (lowerName.includes('eğitim') || lowerName.includes('kurs')) {
        return { code: '770.14', name: 'Eğitim Giderleri' }
      } else if (lowerName.includes('reklam')) {
        return { code: '770.10', name: 'Reklam Giderleri' }
      } else if (lowerName.includes('bakım') || lowerName.includes('onarım')) {
        return { code: '770.09', name: 'Bakım Onarım Giderleri' }
      } else {
        return { code: '789', name: 'Çeşitli Giderler' }
      }
    }
  }

  checkVendorAndSuggest(vendorName) {
    const result = this.getAccountCodeByVendor(vendorName)
    if (result.found) {
      return {
        status: 'found',
        vendor: result.vendor,
        accountCode: result.accountCode,
        accountName: result.accountName,
        isSimilar: result.isSimilar || false,
        message: result.isSimilar ? `Benzer firma bulundu: ${result.vendor.name}` : `Firma bulundu: ${result.vendor.name}`
      }
    }
    return {
      status: 'not_found',
      vendor: null,
      accountCode: null,
      accountName: null,
      isSimilar: false,
      message: 'Firma bulunamadı'
    }
  }

  addVendorWithAccount(vendorName, accountCode, vkn = '') {
    const accountName = this.getAccountNameByCode(accountCode)
    return this.addVendor({
      name: vendorName,
      vkn: vkn,
      accountCode: accountCode,
      accountName: accountName || 'Belirtilmedi'
    })
  }

  loadLearnedMatches() {
    const stored = localStorage.getItem('mubis_learned_matches')
    return stored ? JSON.parse(stored) : []
  }

  learn(vendor, accountCode, accountName) {
    const matches = this.loadLearnedMatches()
    const existing = matches.find(m => m.vendor === vendor)
    if (existing) {
      existing.accountCode = accountCode
      existing.accountName = accountName
      existing.usage = (existing.usage || 0) + 1
    } else {
      matches.push({ vendor, accountCode, accountName, usage: 1 })
    }
    localStorage.setItem('mubis_learned_matches', JSON.stringify(matches))
    this.learnedMatches = matches
    return matches
  }

  loadClientAccountPlan() {
    const stored = localStorage.getItem('mubis_client_account_plan')
    return stored ? JSON.parse(stored) : {}
  }

  saveClientAccountPlan(clientId, accountPlan) {
    const all = this.loadClientAccountPlan()
    all[clientId] = accountPlan
    localStorage.setItem('mubis_client_account_plan', JSON.stringify(all))
    this.clientAccountPlan = all
  }

  getClientAccountPlan(clientId) {
    return this.clientAccountPlan[clientId] || null
  }

  // ============ XML OKUMA - KDV'DEN HESAPLAMA ============
  
  readXML(file, invoiceType = 'gelen') {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const xmlContent = e.target.result
          const parser = new DOMParser()
          const xmlDoc = parser.parseFromString(xmlContent, 'text/xml')
          
          const parserError = xmlDoc.querySelector('parsererror')
          if (parserError) {
            console.error('XML Parse Hatası:', parserError.textContent)
            resolve({ success: false, error: 'XML geçersiz!', rawXML: xmlContent })
            return
          }

          console.log('📄 XML Parse Başladı...')

          let vendor = ''
          let vkn = ''
          let supplier = ''
          let supplierVkn = ''
          let customer = ''
          let customerVkn = ''
          let invoiceTypeCode = ''

          // ============ FATURA TİPİNİ OKU ============
          const typeCodeEl = xmlDoc.querySelector('cbc\\:InvoiceTypeCode') || xmlDoc.querySelector('InvoiceTypeCode')
          if (typeCodeEl) {
            invoiceTypeCode = typeCodeEl.textContent.trim().toUpperCase()
            console.log('📋 Fatura Tipi:', invoiceTypeCode)
          }

          // ============ SATICI (AccountingSupplierParty) ============
          const supplierParty = xmlDoc.querySelector('cac\\:AccountingSupplierParty') || xmlDoc.querySelector('AccountingSupplierParty')
          if (supplierParty) {
            let nameEl = supplierParty.querySelector('cac\\:Party cac\\:PartyName cbc\\:Name')
            if (!nameEl) nameEl = supplierParty.querySelector('Party PartyName Name')
            if (nameEl) {
              supplier = nameEl.textContent.trim()
              console.log('✅ Satıcı Firma:', supplier)
            }
            let idEl = supplierParty.querySelector('cac\\:Party cac\\:PartyIdentification cbc\\:ID')
            if (!idEl) idEl = supplierParty.querySelector('Party PartyIdentification ID')
            if (idEl) {
              supplierVkn = idEl.textContent.trim()
              console.log('✅ Satıcı VKN:', supplierVkn)
            }
          }

          // ============ ALICI (AccountingCustomerParty) ============
          const customerParty = xmlDoc.querySelector('cac\\:AccountingCustomerParty') || xmlDoc.querySelector('AccountingCustomerParty')
          if (customerParty) {
            let nameEl = customerParty.querySelector('cac\\:Party cac\\:PartyName cbc\\:Name')
            if (!nameEl) nameEl = customerParty.querySelector('Party PartyName Name')
            if (nameEl) {
              customer = nameEl.textContent.trim()
              console.log('✅ Alıcı Firma:', customer)
            }
            let idEl = customerParty.querySelector('cac\\:Party cac\\:PartyIdentification cbc\\:ID')
            if (!idEl) idEl = customerParty.querySelector('Party PartyIdentification ID')
            if (idEl) {
              customerVkn = idEl.textContent.trim()
              console.log('✅ Alıcı VKN:', customerVkn)
            }
          }

          // ============ FATURA TİPİNE GÖRE FİRMA SEÇ ============
          if (invoiceType === 'giden') {
            vendor = customer || supplier || 'Bilinmeyen Firma'
            vkn = customerVkn || supplierVkn || ''
          } else {
            vendor = supplier || customer || 'Bilinmeyen Firma'
            vkn = supplierVkn || customerVkn || ''
          }

          // ============ TARİH ============
          let date = xmlDoc.querySelector('cbc\\:IssueDate')?.textContent?.trim() ||
                     xmlDoc.querySelector('IssueDate')?.textContent?.trim() || ''

          // ============ FATURA NO ============
          let invoiceNo = xmlDoc.querySelector('cbc\\:ID')?.textContent?.trim() ||
                          xmlDoc.querySelector('ID')?.textContent?.trim() || ''

          // ============ AÇIKLAMA ============
          let description = ''
          const noteEl = xmlDoc.querySelector('cbc\\:Note')
          if (noteEl) {
            description = noteEl.textContent.trim()
            console.log('📝 Açıklama:', description)
          }

          // ============ KDV BİLGİLERİ - KDV'DEN HESAPLA ============
          const taxDetails = []
          let totalAmount = 0
          let totalTax = 0
          let totalSum = 0

          const taxTotal = xmlDoc.querySelector('cac\\:TaxTotal') || xmlDoc.querySelector('TaxTotal')
          if (taxTotal) {
            const subtotals = taxTotal.querySelectorAll('cac\\:TaxSubtotal') || taxTotal.querySelectorAll('TaxSubtotal')
            
            subtotals.forEach((subtotal) => {
              let rate = 0
              const rateEl = subtotal.querySelector('cbc\\:Percent') || subtotal.querySelector('Percent')
              if (rateEl) {
                rate = parseFloat(rateEl.textContent.trim().replace(',', '.')) || 0
              }
              
              // KDV Tutarı - ÖNCE KDV'Yİ OKU
              let taxAmount = 0
              const taxAmountEl = subtotal.querySelector('cbc\\:TaxAmount') || subtotal.querySelector('TaxAmount')
              if (taxAmountEl) {
                taxAmount = parseFloat(taxAmountEl.textContent.trim().replace(',', '.')) || 0
                console.log(`💰 KDV %${rate}:`, taxAmount)
              }
              
              // Matrahı KDV'den hesapla (KDV / (oran/100))
              let taxableAmount = 0
              if (taxAmount > 0 && rate > 0) {
                taxableAmount = taxAmount / (rate / 100)
                console.log(`💰 Matrah %${rate} (KDV'den):`, taxableAmount)
              } else {
                // Alternatif: TaxableAmount'dan oku
                const taxableEl = subtotal.querySelector('cbc\\:TaxableAmount') || subtotal.querySelector('TaxableAmount')
                if (taxableEl) {
                  taxableAmount = parseFloat(taxableEl.textContent.trim().replace(',', '.')) || 0
                }
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
                console.log(`💰 %${rate} - Matrah: ${taxableAmount}, KDV: ${taxAmount}, Toplam: ${subtotalSum}`)
              }
            })
          }

          // Eğer hiç KDV detayı yoksa LegalMonetaryTotal'den al
          if (taxDetails.length === 0) {
            const legalTotal = xmlDoc.querySelector('cac\\:LegalMonetaryTotal') || xmlDoc.querySelector('LegalMonetaryTotal')
            if (legalTotal) {
              const payableEl = legalTotal.querySelector('cbc\\:PayableAmount') || legalTotal.querySelector('PayableAmount')
              if (payableEl) {
                totalSum = parseFloat(payableEl.textContent.trim().replace(',', '.')) || 0
                console.log('💰 PayableAmount (Toplam):', totalSum)
              }
              const lineExtEl = legalTotal.querySelector('cbc\\:LineExtensionAmount') || legalTotal.querySelector('LineExtensionAmount')
              if (lineExtEl) {
                totalAmount = parseFloat(lineExtEl.textContent.trim().replace(',', '.')) || 0
                console.log('💰 LineExtensionAmount (Matrah):', totalAmount)
              }
              if (totalSum > 0 && totalAmount > 0) {
                const rate = ((totalSum - totalAmount) / totalAmount) * 100
                taxDetails.push({
                  rate: Math.round(rate),
                  taxableAmount: totalAmount,
                  taxAmount: totalSum - totalAmount,
                  total: totalSum
                })
                totalTax = totalSum - totalAmount
              }
            }
          }

          console.log('📊 KDV SONUÇ:')
          console.log('   📌 Toplam Matrah:', totalAmount)
          console.log('   📌 Toplam KDV:', totalTax)
          console.log('   📌 Genel Toplam:', totalSum)
          console.log('   📌 KDV Detayları:', taxDetails)
          console.log('📊 FATURA BİLGİLERİ:')
          console.log('   📌 Fatura Tipi:', invoiceTypeCode)
          console.log('   📌 Satıcı:', supplier)
          console.log('   📌 Alıcı:', customer)

          resolve({
            success: true,
            vendor: vendor || 'Bilinmeyen Firma',
            vkn: vkn || '',
            supplier: supplier || '',
            supplierVkn: supplierVkn || '',
            customer: customer || '',
            customerVkn: customerVkn || '',
            invoiceTypeCode: invoiceTypeCode || '',
            date: date,
            invoiceNo: invoiceNo,
            description: description,
            amount: totalAmount,
            tax: totalTax,
            total: totalSum,
            taxDetails: taxDetails,
            rawXML: xmlContent
          })

        } catch (error) {
          console.error('XML okuma hatası:', error)
          resolve({ success: false, error: error.message, rawXML: e.target.result })
        }
      }
      reader.readAsText(file)
    })
  }

  // ============ DOSYA İŞLEME ============

  async processFiles(files, invoiceType = 'gelen') {
    const results = []
    for (const file of files) {
      try {
        let result = null
        if (file.name.endsWith('.xml')) {
          const data = await this.readXML(file, invoiceType)
          if (data.success) {
            let checkResult = { status: 'not_found', vendor: null, accountCode: null, accountName: null }
            if (data.vkn) {
              const vendorList = this.loadVendorList()
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
              checkResult = this.checkVendorAndSuggest(data.vendor)
            }
            
            const suggestion = this.suggestAccountCode(data.vendor, invoiceType, data.invoiceTypeCode)
            
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
    return results
  }

  // ============ LUCA EXPORT ============

  exportToLuca(documents) {
    let csv = 'Fatura No,Tarih,Tedarikçi,VKN,Matrah,KDV,Toplam,Hesap Kodu,Hesap Adı,Durum,Tip,Fatura Tipi\n'
    for (const doc of documents) {
      const tip = doc.invoiceType === 'giden' ? 'GİDEN (Satış)' : 'GELEN (Alış)'
      const typeCode = doc.invoiceTypeCode || 'SATIS'
      csv += `${doc.invoiceNo},${doc.date},${doc.vendor},${doc.vkn},${doc.amount},${doc.tax},${doc.total},${doc.suggestedAccount},${doc.accountName},Onaylandı,${tip},${typeCode}\n`
    }
    return csv
  }
}

export const aiService = new AIService()