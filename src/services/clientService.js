import { supabase } from '../lib/supabase'
import { getMyOffice, buildClientLoginEmail } from './officeService'

// ============ CLIENTS ============

export async function getClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getClient(id) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function addClient(clientData) {
  // owner_id = giris yapmis kullanici, office_id = kullanicinin ofisi
  const { data: { user } } = await supabase.auth.getUser()
  const ofis = await getMyOffice()

  const username = clientData.type === 'company' ? (clientData.vkn || '') : (clientData.tc || '')
  const authEmail = username
    ? buildClientLoginEmail(username, ofis)
    : (clientData.email || `client_${Date.now()}@mubis.app`)
  const authPassword = '123456'
  
  const insertData = {
    owner_id: user?.id || null,
    office_id: ofis?.id || 1,
    type: clientData.type || 'personal',
    name: clientData.name || '',
    company: clientData.company || '',
    vkn: clientData.vkn || '',
    tc: clientData.tc || '',
    email: clientData.email || '',
    phone: clientData.phone || '',
    whatsapp: clientData.whatsapp || clientData.phone || '',
    tax_office: clientData.taxOffice || '',
    address: clientData.address || '',
    city: clientData.city || '',
    company_type: clientData.companyType || 'ltd',
    tax_type: clientData.taxType || 'Kurumlar Vergisi',
    capital: clientData.capital || '',
    open_date: clientData.openDate || '',
    close_date: clientData.closeDate || '',
    musteri_sinifi: clientData.musteriSinifi || '',
    nace_code: clientData.naceCode || '',
    nace_desc: clientData.naceDesc || '',
    efatura: clientData.efatura || false,
    earsiv: clientData.earsiv || false,
    esmm: clientData.esmm || false,
    edefter: clientData.edefter || false,
    edefter_period: clientData.edefterPeriod || 'aylik',
    serbest_meslek: clientData.serbestMeslek || false,
    eimza_start: clientData.eimzaStart || '',
    eimza_end: clientData.eimzaEnd || '',
    kart_tipi: clientData.kartTipi || '',
    kart_sifre: clientData.kartSifre || '',
    kira_bilgisi: typeof clientData.kiraBilgisi === 'object' && clientData.kiraBilgisi !== null ? JSON.stringify(clientData.kiraBilgisi) : (clientData.kiraBilgisi || ''),
    kira_kontrat_bitis: clientData.kiraKontratBitis || '',
    phonenumbers: clientData.phoneNumbers && clientData.phoneNumbers.length > 0 ? clientData.phoneNumbers : [],
    emails: clientData.emails && clientData.emails.length > 0 ? clientData.emails : [],
    dvs_username: clientData.dvdUsername || clientData.dvsUsername || '',
    dvs_password: clientData.dvdPassword || clientData.dvsPassword || '',
    sgk_user: clientData.sgkUsername || clientData.sgkUser || '',
    sgk_isyeri_kodu: clientData.sgkWorkplaceCode || clientData.sgkIsyeriKodu || '',
    sgk_sistem_sifre: clientData.sgkSystemPassword || clientData.sgkSistemSifre || '',
    sgk_isyeri_sifre: clientData.sgkWorkplacePassword || clientData.sgkIsyeriSifre || '',
    earsiv_user: clientData.earsivUser || '',
    earsiv_pass: clientData.earsivPass || '',
    edevlet_user: clientData.edevletUser || '',
    edevlet_pass: clientData.edevletPass || '',
    ticaret_sicil_no: clientData.tsgUsername || clientData.ticaretSicilNo || '',
    tax_no: clientData.taxNo || '',
    beyan_profile: clientData.beyanProfile || {},
    status: clientData.status || 'active',
    username: username,
    password: authPassword,
    temp_password: true,
  }

  const { data, error } = await supabase
    .from('clients')
    .insert(insertData)
    .select()
    .single()
  
  if (error) throw error

  // Supabase Auth'da musteri kullanicisi olustur
  try {
    await fetch('/api/create-client-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: authEmail,
        password: authPassword,
        name: clientData.name || clientData.company || '',
        clientId: data?.id,
        officeId: ofis?.id || 1
      })
    })
  } catch (err) {
    console.error('Musteri auth kullanici olusturma hatasi:', err)
  }

  return data
}

/**
 * Mevcut bir musteriye MUBiS portal giris hesabi acar.
 *
 * Eski kayitlarda veya hesap acilmadan olusturulmus musterilerde
 * clients.auth_user_id bos kalir; bu durumda musteri portala girse
 * bile kendi verisini goremez. Bu fonksiyon eksik hesabi tamamlar.
 *
 * @param {number} clientId  clients.id
 * @param {string} sifre     gecici sifre (varsayilan 123456)
 * @returns {Promise<{email: string, sifre: string}>} giris bilgileri
 */
export async function createPortalAccount(clientId, sifre = '123456') {
  const { data: c, error } = await supabase
    .from('clients')
    .select('id, name, company, username, vkn, tc, office_id, auth_user_id')
    .eq('id', clientId)
    .single()

  if (error) throw error
  if (!c) throw new Error('Musteri bulunamadi')
  if (c.auth_user_id) throw new Error('Bu musterinin portal hesabi zaten var')

  const username = c.username || c.vkn || c.tc
  if (!username) {
    throw new Error('Musterinin VKN/TC bilgisi yok. Once musteri kartina girip ekleyin.')
  }

  const ofis = await getMyOffice()
  const authEmail = buildClientLoginEmail(username, ofis)

  const resp = await fetch('/api/create-client-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: authEmail,
      password: sifre,
      name: c.name || c.company || '',
      clientId: c.id,
      officeId: c.office_id || ofis?.id || 1
    })
  })

  const sonuc = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(sonuc.error || 'Portal hesabi olusturulamadi')

  return { email: authEmail, sifre }
}

export async function bulkAddClients(clientsList) {
  // owner_id = giris yapmis kullanici, office_id = kullanicinin ofisi
  const { data: { user } } = await supabase.auth.getUser()
  const ownerId = user?.id || null
  const ofis = await getMyOffice()
  const ofisId = ofis?.id || 1

  const insertRows = []
  const authUsers = []

  for (const c of clientsList) {
    const username = c.type === 'company' ? (c.vkn || '') : (c.tc || '')
    const authEmail = username
      ? buildClientLoginEmail(username, ofis)
      : (c.email || `client_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@mubis.app`)
    const authPassword = c.password || '123456'

    const row = {
      owner_id: ownerId,
      office_id: ofisId,
      type: c.type || 'individual',
      name: c.name || '',
      company: c.company || '',
      vkn: c.vkn || '',
      tc: c.tc || '',
      email: c.email || '',
      phone: c.phone || '',
      whatsapp: c.whatsapp || c.phone || '',
      tax_office: c.taxOffice || '',
      address: c.address || '',
      city: c.city || '',
      district: c.district || '',
      company_type: c.companyType || 'ltd',
      tax_type: c.taxType || 'Gelir Vergisi',
      capital: c.capital || '',
      open_date: c.openDate || '',
      close_date: c.closeDate || '',
      musteri_sinifi: c.musteriSinifi || '',
      short_name: c.shortName || c.kisaAd || '',
      nace_code: c.naceCode || '',
      nace_desc: c.naceDesc || '',
      tax_no: c.taxNo || '',
      efatura: parseBool(c.efatura),
      earsiv: parseBool(c.earsiv),
      esmm: parseBool(c.esmm),
      edefter: parseBool(c.edefter),
      edefter_period: c.edefterPeriod || 'aylik',
      serbest_meslek: parseBool(c.serbestMeslek),
      eimza_start: c.eimzaStart || '',
      eimza_end: c.eimzaEnd || '',
      kart_tipi: c.kartTipi || '',
      kart_sifre: c.kartSifre || '',
      kira_bilgisi: typeof c.kiraBilgisi === 'object' && c.kiraBilgisi !== null ? JSON.stringify(c.kiraBilgisi) : (c.kiraBilgisi || ''),
      kira_kontrat_bitis: c.kiraKontratBitis || '',
      dvs_username: c.dvsUsername || '',
      dvs_password: c.dvsPassword || '',
      sgk_user: c.sgkUser || '',
      sgk_isyeri_kodu: c.sgkIsyeriKodu || '',
      sgk_sistem_sifre: c.sgkSistemSifre || '',
      sgk_isyeri_sifre: c.sgkIsyeriSifre || '',
      earsiv_user: c.earsivUser || '',
      earsiv_pass: c.earsivPass || '',
      edevlet_user: c.edevletUser || '',
      edevlet_pass: c.edevletPass || '',
      ticaret_sicil_no: c.ticaretSicilNo || '',
      beyan_profile: buildBeyanProfile(c),
      status: c.status || 'active',
      username: username,
      password: authPassword,
      temp_password: true,
    }
    insertRows.push(row)
    authUsers.push({ email: authEmail, password: authPassword, name: c.name || c.company || '' })
  }

  // Toplu insert
  const { data, error } = await supabase
    .from('clients')
    .insert(insertRows)
    .select('id')

  if (error) throw error

  // Supabase Auth kullanicilarini olustur (arka planda, hata olursa yut)
  if (data) {
    for (let i = 0; i < data.length; i++) {
      try {
        await fetch('/api/create-client-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: authUsers[i].email,
            password: authUsers[i].password,
            name: authUsers[i].name,
            clientId: data[i].id,
            officeId: ofisId
          })
        })
      } catch (err) {
        console.error('Toplu musteri auth kullanici olusturma hatasi:', err)
      }
    }
  }

  return data
}

function parseBool(val) {
  if (typeof val === 'boolean') return val
  if (!val) return false
  const s = String(val).toLowerCase().trim()
  return s === 'evet' || s === 'evet ' || s === 'yes' || s === 'true' || s === '1' || s === 'x'
}

function buildBeyanProfile(c) {
  const months = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  const mk = (period, active) => months.reduce((acc, m) => {
    acc[m] = { period, active }
    return acc
  }, {})

  const profile = {}

  const kdv = String(c.kdvBeyan || '').toLowerCase().trim()
  profile.kdv = mk(kdv === 'aylik' ? 'aylik' : 'yok', kdv === 'aylik')

  const kdv2 = String(c.kdv2Beyan || '').toLowerCase().trim()
  profile.kdv2 = mk(kdv2 === 'aylik' ? 'aylik' : 'yok', kdv2 === 'aylik')

  const muhtasar = String(c.muhtasarBeyan || '').toLowerCase().trim()
  profile.muhtasar = mk(muhtasar === '3aylik' ? '3aylik' : (muhtasar === 'aylik' ? 'aylik' : 'yok'), muhtasar === 'aylik' || muhtasar === '3aylik')

  const sgk = String(c.sgkBeyan || '').toLowerCase().trim()
  profile.sgk = mk(sgk === 'aylik' ? 'aylik' : 'yok', sgk === 'aylik')

  const gecici = parseBool(c.geciciVergi)
  profile.gecici_vergi = {}
  months.forEach(m => {
    profile.gecici_vergi[m] = { period: ([1, 4, 7, 10].includes(m) && gecici) ? '3aylik' : 'yok', active: [1, 4, 7, 10].includes(m) && gecici }
  })

  const yillik = parseBool(c.yillikVergi)
  const taxType = String(c.taxType || '').toLowerCase()
  if (taxType.includes('kurumlar')) {
    profile.kurumlar_vergi = {}
    months.forEach(m => { profile.kurumlar_vergi[m] = { period: m === 3 && yillik ? 'yillik' : 'yok', active: m === 3 && yillik } })
  } else if (taxType.includes('gelir')) {
    profile.gelir_vergi = {}
    months.forEach(m => { profile.gelir_vergi[m] = { period: m === 2 && yillik ? 'yillik' : 'yok', active: m === 2 && yillik } })
  }

  const edefter = parseBool(c.edefter)
  const edefterPeriod = String(c.edefterPeriod || '').toLowerCase().trim()
  if (edefter) {
    profile.edefter = {}
    months.forEach(m => {
      if (edefterPeriod === '3aylik') {
        profile.edefter[m] = { period: '3aylik', active: [2, 5, 8, 11].includes(m) }
      } else {
        profile.edefter[m] = { period: 'aylik', active: true }
      }
    })
  }

  return profile
}

export async function updateClient(id, updateData) {
  // camelCase -> snake_case donusumu
  const mapped = {}
  const fieldMap = {
    name: 'name', company: 'company', vkn: 'vkn', taxNo: 'tax_no', tc: 'tc',
    email: 'email', phone: 'phone', whatsapp: 'whatsapp',
    taxOffice: 'tax_office', address: 'address', city: 'city',
    type: 'type', companyType: 'company_type', taxType: 'tax_type',
    capital: 'capital', openDate: 'open_date', closeDate: 'close_date',
    musteriSinifi: 'musteri_sinifi', shortName: 'short_name', kisaAd: 'short_name',
    naceCode: 'nace_code', naceDesc: 'nace_desc',
    efatura: 'efatura', earsiv: 'earsiv', esmm: 'esmm',
    edefter: 'edefter', edefterPeriod: 'edefter_period',
    serbestMeslek: 'serbest_meslek',
    eimzaStart: 'eimza_start', eimzaEnd: 'eimza_end',
    kartTipi: 'kart_tipi', kartSifre: 'kart_sifre',
    kiraBilgisi: 'kira_bilgisi', kiraKontratBitis: 'kira_kontrat_bitis',
    dvsUsername: 'dvs_username', dvsPassword: 'dvs_password',
    dvdUsername: 'dvs_username', dvdPassword: 'dvs_password',
    sgkUser: 'sgk_user', sgkUsername: 'sgk_user',
    sgkIsyeriKodu: 'sgk_isyeri_kodu', sgkWorkplaceCode: 'sgk_isyeri_kodu',
    sgkSistemSifre: 'sgk_sistem_sifre', sgkSystemPassword: 'sgk_sistem_sifre',
    sgkIsyeriSifre: 'sgk_isyeri_sifre', sgkWorkplacePassword: 'sgk_isyeri_sifre',
    earsivUser: 'earsiv_user', earsivPass: 'earsiv_pass',
    edevletUser: 'edevlet_user', edevletPass: 'edevlet_pass',
    ticaretSicilNo: 'ticaret_sicil_no', tsgUsername: 'ticaret_sicil_no',
    beyanProfile: 'beyan_profile',
    status: 'status', username: 'username', password: 'password',
    tempPassword: 'temp_password',
    officials: 'officials',
    banks: 'banks',
    services: 'services',
    documents: 'documents',
    parentClientId: 'parent_client_id',
  }

  for (const [key, val] of Object.entries(updateData)) {
    const dbKey = fieldMap[key]
    if (dbKey) {
      mapped[dbKey] = val
    }
    // Bilinmeyen alanlari atla (clients tablosunda olmayanlar)
  }

  // kira_bilgisi text kolonu oldugu icin object gelirse JSON string'e cevir
  if (mapped.kira_bilgisi && typeof mapped.kira_bilgisi === 'object') {
    mapped.kira_bilgisi = JSON.stringify(mapped.kira_bilgisi)
  }

  const { data, error } = await supabase
    .from('clients')
    .update(mapped)
    .eq('id', id)
    .select()
    .single()
  
  if (error) {
    console.error('Supabase updateClient hatasi:', error)
    const enhanced = new Error(error.message || 'Supabase update hatasi')
    enhanced.details = error.details
    enhanced.hint = error.hint
    enhanced.code = error.code
    throw enhanced
  }
  return data
}

export async function deleteClient(id) {
  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ============ PARTNERS ============

export async function getPartners(clientId) {
  const { data, error } = await supabase
    .from('partners')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at')
  if (error) throw error
  return data || []
}

export async function addPartner(clientId, partnerData) {
  // Ana ortakliga ait ortak kaydet
  const { data, error } = await supabase
    .from('partners')
    .insert({
      client_id: clientId,
      name: partnerData.name || '',
      tc: partnerData.tc || '',
      vkn: partnerData.vkn || '',
      vergi_dairesi: partnerData.vergi_dairesi || '',
      hisse_orani: Number(partnerData.hisse_orani || 0),
      phone: partnerData.phone || '',
      email: partnerData.email || '',
      address: partnerData.address || '',
      title: partnerData.title || '',
    })
    .select()
    .single()
  if (error) throw error

  // Ortak icin otomatik musteri karti olustur
  try {
    const username = partnerData.tc || partnerData.vkn || ''
    const authEmail = username ? `${username}@mubis.app` : `partner_${Date.now()}@mubis.app`
    const authPassword = '123456'

    const { data: clientRow, error: clientError } = await supabase
      .from('clients')
      .insert({
        parent_client_id: clientId,
        type: 'individual',
        name: partnerData.name || '',
        tc: partnerData.tc || '',
        vkn: partnerData.vkn || '',
        tax_office: partnerData.vergi_dairesi || '',
        phone: partnerData.phone || '',
        email: partnerData.email || '',
        address: partnerData.address || '',
        tax_type: 'Gelir Vergisi',
        status: 'active',
        username: username,
        password: authPassword,
        temp_password: true,
      })
      .select()
      .single()

    if (!clientError && clientRow) {
      // Partner kaydina bagli musteri id'sini yaz
      await supabase.from('partners').update({ child_client_id: clientRow.id }).eq('id', data.id)
      // Auth kullanici olustur
      await fetch('/api/create-client-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authEmail,
          password: authPassword,
          name: partnerData.name || '',
          clientId: clientRow.id
        })
      })
    }
  } catch (err) {
    console.error('Ortak musteri karti olusturma hatasi:', err)
  }

  return data
}

export async function updatePartner(id, partnerData) {
  const { data, error } = await supabase
    .from('partners')
    .update({
      name: partnerData.name || '',
      tc: partnerData.tc || '',
      vkn: partnerData.vkn || '',
      vergi_dairesi: partnerData.vergi_dairesi || '',
      hisse_orani: Number(partnerData.hisse_orani || 0),
      phone: partnerData.phone || '',
      email: partnerData.email || '',
      address: partnerData.address || '',
      title: partnerData.title || '',
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error

  // Bagli musteri karti varsa guncelle
  if (data?.child_client_id) {
    try {
      await supabase.from('clients').update({
        name: partnerData.name || '',
        tc: partnerData.tc || '',
        vkn: partnerData.vkn || '',
        tax_office: partnerData.vergi_dairesi || '',
        phone: partnerData.phone || '',
        email: partnerData.email || '',
        address: partnerData.address || '',
      }).eq('id', data.child_client_id)
    } catch (err) {
      console.error('Bagli musteri karti guncelleme hatasi:', err)
    }
  }

  return data
}

export async function deletePartner(id) {
  // Once bagli musteri kartini sil
  try {
    const { data: partner } = await supabase.from('partners').select('child_client_id').eq('id', id).single()
    if (partner?.child_client_id) {
      await supabase.from('clients').delete().eq('id', partner.child_client_id)
    }
  } catch (err) {
    console.error('Bagli musteri karti silme hatasi:', err)
  }

  const { error } = await supabase.from('partners').delete().eq('id', id)
  if (error) throw error
}

// ============ BANKS ============

export async function getBanks(clientId) {
  const { data, error } = await supabase
    .from('banks')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at')
  if (error) throw error
  return data || []
}

export async function addBank(clientId, bankData) {
  const { data, error } = await supabase
    .from('banks')
    .insert({ client_id: clientId, ...bankData })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteBank(id) {
  const { error } = await supabase.from('banks').delete().eq('id', id)
  if (error) throw error
}

// ============ BEYAN STATUS ============

export async function getBeyanStatus(clientId, year, month) {
  const { data, error } = await supabase
    .from('beyan_status')
    .select('*')
    .eq('client_id', clientId)
    .eq('year', year)
    .eq('month', month)
  if (error) throw error
  return data || []
}

export async function upsertBeyanStatus(clientId, year, month, beyanType, status) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('beyan_status')
    .upsert({
      client_id: clientId,
      year,
      month,
      beyan_type: beyanType,
      status,
      updated_by: user?.id
    }, { onConflict: 'client_id,year,month,beyan_type' })
    .select()
    .single()
  if (error) throw error
  return data
}

// ============ ACCOUNT PLANS (Hesap Plani) ============

export async function getAccountPlans(clientId) {
  const { data, error } = await supabase
    .from('account_plans')
    .select('*')
    .eq('client_id', clientId)
    .order('code')
  if (error) throw error
  return data || []
}

export async function saveAccountPlans(clientId, plans) {
  // Onceki kayitlari sil, yenilerini ekle
  await supabase.from('account_plans').delete().eq('client_id', clientId)
  if (plans.length === 0) return []
  const rows = plans.map(p => ({
    client_id: clientId,
    code: p.code,
    name: p.name,
    is_auto_added: p.is_auto_added || false
  }))
  const { data, error } = await supabase
    .from('account_plans')
    .insert(rows)
    .select()
  if (error) throw error
  return data || []
}

export async function addAccountPlan(clientId, code, name, isAutoAdded = false) {
  const { data, error } = await supabase
    .from('account_plans')
    .upsert({ client_id: clientId, code, name, is_auto_added: isAutoAdded }, { onConflict: 'client_id,code' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteAccountPlan(id) {
  const { error } = await supabase.from('account_plans').delete().eq('id', id)
  if (error) throw error
}

export async function getAutoAddedAccounts(clientId) {
  const { data, error } = await supabase
    .from('account_plans')
    .select('*')
    .eq('client_id', clientId)
    .eq('is_auto_added', true)
    .order('code')
  if (error) throw error
  return data || []
}

// ============ EMPLOYEES (Personel) ============

export async function getEmployees(clientId) {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('client_id', clientId)
    .order('ad_soyad')
  if (error) throw error
  return data || []
}

export async function addEmployee(clientId, employeeData) {
  const { data, error } = await supabase
    .from('employees')
    .insert({
      client_id: clientId,
      ad_soyad: employeeData.ad_soyad || employeeData.adSoyad || '',
      tc_kimlik: employeeData.tc_kimlik || employeeData.tcKimlik || '',
      ise_giris: employeeData.ise_giris || employeeData.iseGiris || null,
      isten_cikis: employeeData.isten_cikis || employeeData.istenCikis || null,
      brut_ucret: employeeData.brut_ucret || employeeData.brutUcret || 0,
      dogum_tarihi: employeeData.dogum_tarihi || employeeData.dogumTarihi || null,
      aktif: employeeData.aktif !== undefined ? employeeData.aktif : true
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateEmployee(id, employeeData) {
  const mapped = {}
  if (employeeData.ad_soyad !== undefined || employeeData.adSoyad !== undefined) mapped.ad_soyad = employeeData.ad_soyad || employeeData.adSoyad
  if (employeeData.tc_kimlik !== undefined || employeeData.tcKimlik !== undefined) mapped.tc_kimlik = employeeData.tc_kimlik || employeeData.tcKimlik
  if (employeeData.ise_giris !== undefined || employeeData.iseGiris !== undefined) mapped.ise_giris = employeeData.ise_giris || employeeData.iseGiris
  if (employeeData.isten_cikis !== undefined || employeeData.istenCikis !== undefined) mapped.isten_cikis = employeeData.isten_cikis || employeeData.istenCikis
  if (employeeData.brut_ucret !== undefined || employeeData.brutUcret !== undefined) mapped.brut_ucret = employeeData.brut_ucret || employeeData.brutUcret
  if (employeeData.dogum_tarihi !== undefined || employeeData.dogumTarihi !== undefined) mapped.dogum_tarihi = employeeData.dogum_tarihi || employeeData.dogumTarihi || null
  if (employeeData.aktif !== undefined) mapped.aktif = employeeData.aktif
  mapped.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('employees')
    .update(mapped)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteEmployee(id) {
  // Izin kayitlarini da sil
  await supabase.from('leave_records').delete().eq('employee_id', id)
  const { error } = await supabase.from('employees').delete().eq('id', id)
  if (error) throw error
}

export async function saveEmployeesFromExcel(clientId, employees) {
  const rows = employees.map(e => ({
    client_id: clientId,
    ad_soyad: e.ad_soyad || '',
    tc_kimlik: e.tc_kimlik || '',
    ise_giris: e.ise_giris || null,
    isten_cikis: e.isten_cikis || null,
    brut_ucret: e.brut_ucret || 0,
    dogum_tarihi: e.dogum_tarihi || null,
    aktif: true
  }))
  const { data, error } = await supabase
    .from('employees')
    .insert(rows)
    .select()
  if (error) throw error
  return data || []
}

// ============ LEAVE RECORDS (Izin Takip) ============

export async function getLeaveRecords(clientId, yil = null) {
  let query = supabase
    .from('leave_records')
    .select('*')
    .eq('client_id', clientId)
    .order('baslangic', { ascending: false })
  if (yil) query = query.eq('yil', yil)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function getEmployeeLeaveRecords(employeeId, yil = null) {
  let query = supabase
    .from('leave_records')
    .select('*')
    .eq('employee_id', employeeId)
    .order('baslangic', { ascending: false })
  if (yil) query = query.eq('yil', yil)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function addLeaveRecord(record) {
  const { data, error } = await supabase
    .from('leave_records')
    .insert({
      employee_id: record.employee_id || record.employeeId,
      client_id: record.client_id || record.clientId,
      yil: record.yil,
      baslangic: record.baslangic,
      bitis: record.bitis,
      is_gunu: record.is_gunu || record.isGunu,
      aciklama: record.aciklama || ''
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteLeaveRecord(id) {
  const { error } = await supabase.from('leave_records').delete().eq('id', id)
  if (error) throw error
}

// ============ HELPER: DB -> Frontend format donusumu ============

export function dbToFrontend(dbClient) {
  if (!dbClient) return null
  return {
    ...dbClient,
    // snake_case -> camelCase mapping
    id: dbClient.id,
    authUserId: dbClient.auth_user_id || null,
    officeId: dbClient.office_id || null,
    type: dbClient.type,
    name: dbClient.name,
    company: dbClient.company,
    vkn: dbClient.vkn,
    taxNo: dbClient.tax_no || '',
    tc: dbClient.tc,
    email: dbClient.email,
    phone: dbClient.phone,
    whatsapp: dbClient.whatsapp,
    taxOffice: dbClient.tax_office,
    address: dbClient.address,
    city: dbClient.city,
    companyType: dbClient.company_type,
    taxType: dbClient.tax_type,
    capital: dbClient.capital,
    taxNo: dbClient.tax_no || '',
    openDate: dbClient.open_date,
    closeDate: dbClient.close_date,
    musteriSinifi: dbClient.musteri_sinifi,
    shortName: dbClient.short_name || '',
    kisaAd: dbClient.short_name || '',
    naceCode: dbClient.nace_code,
    naceDesc: dbClient.nace_desc,
    efatura: dbClient.efatura,
    earsiv: dbClient.earsiv,
    esmm: dbClient.esmm,
    edefter: dbClient.edefter,
    edefterPeriod: dbClient.edefter_period,
    serbestMeslek: dbClient.serbest_meslek,
    eimzaStart: dbClient.eimza_start,
    eimzaEnd: dbClient.eimza_end,
    kartTipi: dbClient.kart_tipi,
    kartSifre: dbClient.kart_sifre,
    kiraBilgisi: dbClient.kira_bilgisi,
    kiraKontratBitis: dbClient.kira_kontrat_bitis,
    dvdUsername: dbClient.dvs_username,
    dvsUsername: dbClient.dvs_username,
    dvdPassword: dbClient.dvs_password,
    dvsPassword: dbClient.dvs_password,
    sgkUser: dbClient.sgk_user,
    sgkUsername: dbClient.sgk_user,
    sgkIsyeriKodu: dbClient.sgk_isyeri_kodu,
    sgkWorkplaceCode: dbClient.sgk_isyeri_kodu,
    sgkSistemSifre: dbClient.sgk_sistem_sifre,
    sgkSystemPassword: dbClient.sgk_sistem_sifre,
    sgkIsyeriSifre: dbClient.sgk_isyeri_sifre,
    sgkWorkplacePassword: dbClient.sgk_isyeri_sifre,
    earsivUser: dbClient.earsiv_user,
    earsivPass: dbClient.earsiv_pass,
    edevletUser: dbClient.edevlet_user,
    edevletPass: dbClient.edevlet_pass,
    ticaretSicilNo: dbClient.ticaret_sicil_no,
    tsgUsername: dbClient.ticaret_sicil_no,
    beyanProfile: dbClient.beyan_profile || {},
    beyanDurumlari: dbClient.beyan_durumlari || {},
    status: dbClient.status,
    username: dbClient.username,
    password: dbClient.password,
    tempPassword: dbClient.temp_password,
    phoneNumbers: dbClient.phonenumbers || [],
    emails: dbClient.emails || [],
    createdAt: dbClient.created_at,
    parentClientId: dbClient.parent_client_id || null,
  }
}

// Toplu donusum
export function dbToFrontendList(dbClients) {
  return (dbClients || []).map(dbToFrontend)
}
