import { supabase } from '../lib/supabase'

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
  // owner_id = giris yapmis kullanici
  const { data: { user } } = await supabase.auth.getUser()
  
  const insertData = {
    owner_id: user?.id || null,
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
    kira_bilgisi: clientData.kiraBilgisi || '',
    kira_kontrat_bitis: clientData.kiraKontratBitis || '',
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
    beyan_profile: clientData.beyanProfile || {},
    status: clientData.status || 'active',
    username: clientData.type === 'company' ? (clientData.vkn || '') : (clientData.tc || ''),
    password: '123456',
    temp_password: true,
  }

  const { data, error } = await supabase
    .from('clients')
    .insert(insertData)
    .select()
    .single()
  
  if (error) throw error
  return data
}

export async function updateClient(id, updateData) {
  // camelCase -> snake_case donusumu
  const mapped = {}
  const fieldMap = {
    name: 'name', company: 'company', vkn: 'vkn', tc: 'tc',
    email: 'email', phone: 'phone', whatsapp: 'whatsapp',
    taxOffice: 'tax_office', address: 'address', city: 'city',
    type: 'type', companyType: 'company_type', taxType: 'tax_type',
    capital: 'capital', openDate: 'open_date', closeDate: 'close_date',
    musteriSinifi: 'musteri_sinifi', naceCode: 'nace_code', naceDesc: 'nace_desc',
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
  }

  for (const [key, val] of Object.entries(updateData)) {
    const dbKey = fieldMap[key]
    if (dbKey) {
      mapped[dbKey] = val
    } else if (key === 'partners' || key === 'bankalar' || key === 'services' || key === 'evraklar' || key === 'notes') {
      // Bu alanlar ayri tablolarda, burada atla
    } else {
      // Bilinmeyen alan - dogrudan gonder (snake_case ise)
      mapped[key] = val
    }
  }

  const { data, error } = await supabase
    .from('clients')
    .update(mapped)
    .eq('id', id)
    .select()
    .single()
  
  if (error) throw error
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
  const { data, error } = await supabase
    .from('partners')
    .insert({ client_id: clientId, ...partnerData })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updatePartner(id, partnerData) {
  const { data, error } = await supabase
    .from('partners')
    .update(partnerData)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deletePartner(id) {
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
    type: dbClient.type,
    name: dbClient.name,
    company: dbClient.company,
    vkn: dbClient.vkn,
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
    openDate: dbClient.open_date,
    closeDate: dbClient.close_date,
    musteriSinifi: dbClient.musteri_sinifi,
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
    status: dbClient.status,
    username: dbClient.username,
    password: dbClient.password,
    tempPassword: dbClient.temp_password,
    createdAt: dbClient.created_at,
  }
}

// Toplu donusum
export function dbToFrontendList(dbClients) {
  return (dbClients || []).map(dbToFrontend)
}
