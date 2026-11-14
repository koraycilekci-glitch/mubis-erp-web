// local-exclusions — "Sadece fatura bilgisi oku, dosya indirme" firması işaretleme
// Supabase'de company_local_exclusions tablosu kullanılarak işaretlenir.
// Bu firmalar için: PDF/XML indirme atlanır, sadece metadata/tablo verisi
// gösterilir. Fatura bilgisi OK butonu + sadece tablo Gönder WhatsApp yapılır.

const crypto = require('node:crypto')

// exclusion anahtarını oluştur: firma|tip
function exclusionKey(companyId, type) {
  return `local-exclusion|${companyId}|${type}`
}

// Exclusion'ı Supabase'e kaydet
async function saveExclusion(supabase, officeId, key, reason, addedBy = 'system') {
  try {
    const { error } = await supabase
      .from('company_local_exclusions')
      .upsert({ key, reason, office_id: officeId, added_by: addedBy, status: 'active' },
        { onConflict: 'key' })
    if (error) throw error
    return true
  } catch (e) {
    console.log('[local-exclusions] Kaydedilemedi:', e.message)
    return false
  }
}

// Exclusion'ı Supabase'ten oku
async function loadExclusions(supabase, officeId) {
  try {
    const { data, error } = await supabase
      .from('company_local_exclusions')
      .select('key, reason, office_id, added_by, status')
      .eq('office_id', officeId)
      .eq('status', 'active')

    if (error) throw error
    return data || []
  } catch (e) {
    console.log('[local-exclusions] Yuklenemedi:', e.message)
    return []
  }
}

// Bir firmanın indirme dışı Listedeki var mı kontrolü
function isExcluded(key) {
  return key.startsWith('local-exclusion|')
}

// Exclusion reason'ını döndür
function exclusionReason(key) {
  const parts = key.split('|')
  return parts.slice(2).join('|') || 'Bilinmeyen sebep'
}

module.exports = { exclusionKey, saveExclusion, loadExclusions, isExcluded, exclusionReason, crypto }