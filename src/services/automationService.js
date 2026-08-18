import { supabase } from '../lib/supabase'
import { getMyOfficeId } from './officeService'
import { encryptCredentials, decryptCredentials } from '../utils/crypto'

const AUTOMATION_API_URL = import.meta.env.VITE_AUTOMATION_API_URL || ''
const AUTOMATION_API_KEY = import.meta.env.VITE_AUTOMATION_API_KEY || ''

async function apiPost(path, body) {
  if (!AUTOMATION_API_URL) throw new Error('Automation API URL tanimli degil')
  const res = await fetch(`${AUTOMATION_API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': AUTOMATION_API_KEY
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Automation API hatasi ${res.status}: ${txt}`)
  }
  return res.json()
}

export async function getAutomationSettings() {
  const officeId = await getMyOfficeId()
  const { data, error } = await supabase
    .from('automation_settings')
    .select('*')
    .eq('office_id', officeId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data || {
    enabled: true,
    schedule_time: '02:00',
    repeat_type: 'daily',
    enabled_types: ['etebligat', 'sgk'],
    notify_whatsapp: false,
    notify_email: false
  }
}

export async function saveAutomationSettings(settings) {
  const officeId = await getMyOfficeId()
  const { error } = await supabase
    .from('automation_settings')
    .upsert({ ...settings, office_id: officeId }, { onConflict: 'office_id' })
  if (error) throw error
  return true
}

export async function getAutomationJobs(limit = 50) {
  const officeId = await getMyOfficeId()
  const { data, error } = await supabase
    .from('automation_jobs')
    .select('*, clients(name)')
    .eq('office_id', officeId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function getAutomationDocuments(filters = {}) {
  const officeId = await getMyOfficeId()
  let q = supabase
    .from('automation_documents')
    .select('*, clients(name)')
    .eq('office_id', officeId)
    .order('created_at', { ascending: false })

  if (filters.client_id) q = q.eq('client_id', filters.client_id)
  if (filters.document_type) q = q.eq('document_type', filters.document_type)
  if (filters.is_read !== undefined) q = q.eq('is_read', filters.is_read)

  const { data, error } = await q.limit(filters.limit || 200)
  if (error) throw error
  return data || []
}

export async function markDocumentRead(docId, isRead = true) {
  const { error } = await supabase
    .from('automation_documents')
    .update({ is_read: isRead })
    .eq('id', docId)
  if (error) throw error
  return true
}

export async function triggerAutomation({ clientIds = [], types = ['etebligat', 'sgk'] }) {
  const officeId = await getMyOfficeId()
  return apiPost('/jobs/trigger', {
    office_id: officeId,
    client_ids: clientIds,
    types
  })
}

export async function getClientPortalCredentials(clientId) {
  const { data, error } = await supabase
    .from('clients')
    .select('portal_credentials')
    .eq('id', clientId)
    .single()
  if (error) throw error
  return decryptCredentials(data?.portal_credentials || {})
}

export async function saveClientPortalCredentials(clientId, creds) {
  const encrypted = await encryptCredentials(creds)
  const { error } = await supabase
    .from('clients')
    .update({ portal_credentials: encrypted })
    .eq('id', clientId)
  if (error) throw error
  return true
}

export async function getAutomationStats() {
  const officeId = await getMyOfficeId()
  const today = new Date().toISOString().split('T')[0]

  const [clientsRes, jobsRes, docsRes] = await Promise.all([
    supabase.from('clients').select('id', { count: 'exact' }).eq('office_id', officeId),
    supabase.from('automation_jobs').select('id', { count: 'exact' }).eq('office_id', officeId).eq('status', 'running'),
    supabase.from('automation_documents').select('id', { count: 'exact' }).eq('office_id', officeId).gte('created_at', today)
  ])

  return {
    totalClients: clientsRes.count || 0,
    activeJobs: jobsRes.count || 0,
    todayDocuments: docsRes.count || 0
  }
}
