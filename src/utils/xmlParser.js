// src/utils/xmlParser.js

export const parseInvoiceXML = (xmlContent) => {
  try {
    // XML'i DOM'a çevir
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

    // Hata kontrolü
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      console.error('XML Parse Hatası:', parserError.textContent);
      return null;
    }

    // Fatura numarası (ID)
    const id = xmlDoc.querySelector('cbc\\:ID')?.textContent || 
               xmlDoc.querySelector('ID')?.textContent || 
               'Bilinmiyor';

    // ALICI Firma bilgisi (AccountingCustomerParty)
    const customerName = 
      xmlDoc.querySelector('cac\\:AccountingCustomerParty cac\\:Party cac\\:PartyName cbc\\:Name')?.textContent ||
      xmlDoc.querySelector('cac\\:AccountingCustomerParty cac\\:Party cac\\:Person cbc\\:FirstName')?.textContent ||
      xmlDoc.querySelector('AccountingCustomerParty Party PartyName Name')?.textContent ||
      'Bilinmeyen Firma';

    // ALICI VKN / TCKN
    const vkn = 
      xmlDoc.querySelector('cac\\:AccountingCustomerParty cac\\:Party cac\\:PartyIdentification cbc\\:ID')?.textContent ||
      xmlDoc.querySelector('AccountingCustomerParty Party PartyIdentification ID')?.textContent ||
      '-';

    // SATICI Firma bilgisi (AccountingSupplierParty)
    const supplierName = 
      xmlDoc.querySelector('cac\\:AccountingSupplierParty cac\\:Party cac\\:PartyName cbc\\:Name')?.textContent ||
      xmlDoc.querySelector('AccountingSupplierParty Party PartyName Name')?.textContent ||
      'Bilinmeyen Satıcı';

    // SATICI VKN
    const supplierVkn = 
      xmlDoc.querySelector('cac\\:AccountingSupplierParty cac\\:Party cac\\:PartyIdentification cbc\\:ID')?.textContent ||
      xmlDoc.querySelector('AccountingSupplierParty Party PartyIdentification ID')?.textContent ||
      '-';

    // Tarih
    const issueDate = 
      xmlDoc.querySelector('cbc\\:IssueDate')?.textContent ||
      xmlDoc.querySelector('IssueDate')?.textContent ||
      'Bilinmiyor';

    // Fatura türü
    const invoiceType = 
      xmlDoc.querySelector('cbc\\:InvoiceTypeCode')?.textContent ||
      xmlDoc.querySelector('InvoiceTypeCode')?.textContent ||
      'Bilinmiyor';

    // Para birimi
    const currency = 
      xmlDoc.querySelector('cbc\\:DocumentCurrencyCode')?.textContent ||
      xmlDoc.querySelector('DocumentCurrencyCode')?.textContent ||
      'TRY';

    // Tutar (Önce PayableAmount, yoksa LineExtensionAmount)
    let amount = 
      xmlDoc.querySelector('cac\\:LegalMonetaryTotal cbc\\:PayableAmount')?.textContent ||
      xmlDoc.querySelector('LegalMonetaryTotal PayableAmount')?.textContent ||
      xmlDoc.querySelector('cac\\:LegalMonetaryTotal cbc\\:LineExtensionAmount')?.textContent ||
      xmlDoc.querySelector('LegalMonetaryTotal LineExtensionAmount')?.textContent ||
      '0';

    // Tutarı temizle ve sayıya çevir
    amount = parseFloat(amount.replace(',', '.').replace(/[^0-9.]/g, ''));
    if (isNaN(amount)) amount = 0;

    // KDV oranı
    let taxRate = 
      xmlDoc.querySelector('cac\\:TaxTotal cac\\:TaxSubtotal cbc\\:Percent')?.textContent ||
      xmlDoc.querySelector('TaxTotal TaxSubtotal Percent')?.textContent ||
      '0';
    taxRate = parseFloat(taxRate.replace(',', '.'));
    if (isNaN(taxRate)) taxRate = 0;

    // KDV tutarı
    let taxAmount = 
      xmlDoc.querySelector('cac\\:TaxTotal cac\\:TaxSubtotal cbc\\:TaxAmount')?.textContent ||
      xmlDoc.querySelector('TaxTotal TaxSubtotal TaxAmount')?.textContent ||
      '0';
    taxAmount = parseFloat(taxAmount.replace(',', '.'));
    if (isNaN(taxAmount)) taxAmount = 0;

    // Vergi türü (KDV tipi)
    const taxTypeCode = 
      xmlDoc.querySelector('cac\\:TaxTotal cac\\:TaxSubtotal cac\\:TaxCategory cac\\:TaxScheme cbc\\:TaxTypeCode')?.textContent ||
      xmlDoc.querySelector('TaxTotal TaxSubtotal TaxCategory TaxScheme TaxTypeCode')?.textContent ||
      '';

    // KDV durumu (0015 = KDV)
    const taxType = taxTypeCode === '0015' ? 'KDV' : 'Diğer';

    // Kurumlar/Gelir Vergisi türü (SATICI üzerinden kontrol)
    const taxOfficeName = 
      xmlDoc.querySelector('cac\\:AccountingSupplierParty cac\\:Party cac\\:PartyTaxScheme cac\\:TaxScheme cbc\\:Name')?.textContent ||
      xmlDoc.querySelector('AccountingSupplierParty Party PartyTaxScheme TaxScheme Name')?.textContent ||
      '';

    const isCorporate = taxOfficeName.includes('KURUMLAR') || taxOfficeName.includes('Kurumlar');
    const companyTaxType = isCorporate ? 'Kurumlar Vergisi' : 'Gelir Vergisi';

    // Ürün/hizmet açıklaması
    const itemName = 
      xmlDoc.querySelector('cac\\:InvoiceLine cac\\:Item cbc\\:Name')?.textContent ||
      xmlDoc.querySelector('InvoiceLine Item Name')?.textContent ||
      '';

    return {
      id,                 // Fatura No
      customerName,       // Alıcı Firma
      vkn,                // Alıcı VKN
      supplierName,       // Satıcı Firma
      supplierVkn,        // Satıcı VKN
      issueDate,          // Tarih
      invoiceType,        // Fatura Tipi (SATIS, IADE, vs)
      currency,           // Para Birimi
      amount,             // Tutar (sayısal)
      taxRate,            // KDV Oranı
      taxAmount,          // KDV Tutarı
      taxType,            // KDV / Diğer
      companyTaxType,     // Kurumlar Vergisi / Gelir Vergisi
      itemName,           // Ürün/Hizmet Açıklaması
      raw: xmlContent     // Orijinal XML
    };
  } catch (error) {
    console.error('XML Parse Hatası:', error);
    return null;
  }
};

// XML dosyasını okumak için yardımcı fonksiyon
export const readXMLFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        const parsed = parseInvoiceXML(content);
        resolve({
          fileName: file.name,
          content: content,
          data: parsed
        });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
};