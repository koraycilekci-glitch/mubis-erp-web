// src/utils/aiSuggester.js

export const suggestAccountCode = (invoiceData, _existingCodes = []) => {
  // Varsayılan öneri
  let suggestion = {
    code: '789',
    name: 'Çeşitli Giderler',
    confidence: 50
  };

  if (!invoiceData) return suggestion;

  const { customerName, supplierName, itemName, amount, vkn } = invoiceData;

  // 1. Firma adına göre eşleşme (Alıcı veya Satıcı)
  const knownCompanies = [
    { name: 'ÖZBEY İNŞAAT', code: '120', account: 'Yapı Malzemeleri', confidence: 90 },
    { name: 'NESTORTAKÖY', code: '789', account: 'Çeşitli Giderler', confidence: 85 },
    { name: 'ABC LTD', code: '150', account: 'Ticari Mallar', confidence: 85 },
    { name: 'XYZ TİCARET', code: '153', account: 'Ticari Mallar', confidence: 80 },
    { name: 'YILMAZ LTD', code: '153', account: 'Ticari Mallar', confidence: 80 },
    { name: 'DEMO', code: '789', account: 'Çeşitli Giderler', confidence: 60 },
  ];

  const searchName = (customerName || supplierName || '').toUpperCase();
  for (const company of knownCompanies) {
    if (searchName.includes(company.name.toUpperCase())) {
      suggestion = {
        code: company.code,
        name: company.account,
        confidence: company.confidence
      };
      break;
    }
  }

  // 2. Ürün/Hizmet adına göre öneri
  if (itemName) {
    const itemLower = itemName.toLowerCase();
    if (itemLower.includes('inşaat') || itemLower.includes('malzeme') || itemLower.includes('yapı')) {
      suggestion = { code: '120', name: 'Yapı Malzemeleri', confidence: 75 };
    } else if (itemLower.includes('danışmanlık') || itemLower.includes('hizmet')) {
      suggestion = { code: '180', name: 'Danışmanlık Giderleri', confidence: 70 };
    } else if (itemLower.includes('elektrik') || itemLower.includes('su')) {
      suggestion = { code: '730', name: 'Elektrik-Su Giderleri', confidence: 70 };
    }
  }

  // 3. KDV oranına göre öneri
  if (invoiceData.taxRate >= 18) {
    suggestion = { code: '191', name: 'İndirilecek KDV', confidence: 65 };
  }

  // 4. Tutar büyüklüğüne göre
  if (amount > 10000) {
    suggestion.confidence = Math.min(suggestion.confidence + 10, 95);
  }

  // 5. VKN kontrolü
  if (vkn && vkn.length === 10) {
    suggestion.confidence = Math.min(suggestion.confidence + 5, 95);
  }

  return suggestion;
};

// Toplu eşleştirme için
export const batchSuggest = (invoices) => {
  return invoices.map(inv => ({
    ...inv,
    suggestion: suggestAccountCode(inv)
  }));
};