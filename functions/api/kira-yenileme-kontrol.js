// MUBIS - Kira yenileme hatirlatma kontrolu (Cloudflare Pages Function)
// GET /api/kira-yenileme-kontrol  (gunluk cron tetikler)
import { json, supabaseAdmin, getKiraBilgisi, trDateInputToDate, daysUntil, sendWhatsAppText } from './_lib.js'

// Yardimci program gunluk cron'u POST ile cagirir
export const onRequestPost = ({ env }) => onRequestGet({ env })

export async function onRequestGet({ env }) {
  const supabase = supabaseAdmin(env)
  if (!supabase) return json({ error: 'Supabase credentials missing' }, 500)

  const created = []
  const errors = []

  try {
    // WhatsApp ayarlari
    const { data: settingsRows } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['whatsapp_phone_number_id', 'whatsapp_access_token'])
    const settings = {}
    ;(settingsRows || []).forEach(r => { settings[r.key] = r.value })
    const waConfig = {
      phoneNumberId: settings.whatsapp_phone_number_id,
      accessToken: settings.whatsapp_access_token
    }

    // Once ertelenen kayitlari aktiflestir
    const todayIso = new Date().toISOString().split('T')[0]
    const { data: ertelenenler } = await supabase
      .from('kira_yenileme')
      .select('id, client_id, sahip_index, bitis_tarihi, erteleme_gunu, hatirlatma_7gun, hatirlatma_1gun')
      .eq('durum', 'ertelendi')
      .lte('erteleme_tarihi', todayIso)

    for (const e of ertelenenler || []) {
      try {
        await supabase
          .from('kira_yenileme')
          .update({ durum: 'bekliyor', erteleme_tarihi: null })
          .eq('id', e.id)
        created.push({ client_id: e.client_id, sahip_index: e.sahip_index, kalan: null, renewal_id: e.id, tekrar: true })
      } catch (err) {
        errors.push({ client_id: e.client_id, error: err.message })
      }
    }

    // Kiraci olan musterileri cek (kira_bilgisi JSONB icinde kiraTipi='kiraci')
    const { data: clients, error } = await supabase
      .from('clients')
      .select('*')
      .limit(50)

    if (error) throw error

    const kiraciClients = (clients || []).filter(client => {
      const kb = getKiraBilgisi(client)
      const tip = String(kb.kiraTipi || kb.kira_tipi || kb.kiraTip || '').toLowerCase()
      return tip === 'kiraci' || tip === 'kiracı'
    })

    const sampleKiraTipi = clients?.slice(0, 3).map(c => ({
      id: c.id,
      keys: Object.keys(c).slice(0, 30),
      kiraTipi: getKiraBilgisi(c).kiraTipi
    }))

    const allKiraBilgisiRaw = clients?.map(c => ({
      id: c.id,
      has_kb: !!getKiraBilgisi(c),
      kb_type: typeof c.kira_bilgisi,
      tip: (() => {
        const kb = getKiraBilgisi(c)
        return String(kb.kiraTipi || kb.kira_tipi || kb.kiraTip || '').toLowerCase()
      })()
    }))

    for (const client of kiraciClients) {
      try {
        const kb = getKiraBilgisi(client)
        const sahipler = Array.isArray(kb.isyeriSahipleri) ? kb.isyeriSahipleri : []
        if (!sahipler.length) {
          errors.push({ client_id: client.id, error: 'isyeriSahipleri bos', debug: JSON.stringify(kb).slice(0, 200) })
          continue
        }

        for (let i = 0; i < sahipler.length; i++) {
          const sahip = sahipler[i]
          const bitis = trDateInputToDate(sahip.kiraBitis)
          if (!bitis) {
            errors.push({ client_id: client.id, sahip_index: i, error: 'kiraBitis parse edilemedi', raw: sahip.kiraBitis })
            continue
          }
          const kalan = daysUntil(bitis)
          if (kalan < 1 || kalan > 7) {
            errors.push({ client_id: client.id, sahip_index: i, debug: `kalan=${kalan}, bitis=${sahip.kiraBitis}`, status: 'atlandi' })
            continue
          }

          // Ayni musteri/sahip/bitis icin bekleyen kayit var mi?
          const { data: existing } = await supabase
            .from('kira_yenileme')
            .select('id, hatirlatma_7gun, hatirlatma_1gun')
            .eq('client_id', client.id)
            .eq('sahip_index', i)
            .eq('bitis_tarihi', bitis.toISOString().split('T')[0])
            .in('durum', ['bekliyor', 'musteri_cevaplandi'])
            .maybeSingle()

          let renewalId = existing?.id
          if (!renewalId) {
            const { data: inserted, error: insertErr } = await supabase
              .from('kira_yenileme')
              .insert({
                client_id: client.id,
                office_id: client.office_id,
                sahip_index: i,
                eski_net_kira: sahip.netKira ? Number(String(sahip.netKira).replace(/\./g, '').replace(',', '.')) : null,
                eski_brut_kira: sahip.brutKira ? Number(String(sahip.brutKira).replace(/\./g, '').replace(',', '.')) : null,
                bitis_tarihi: bitis.toISOString().split('T')[0]
              })
              .select('id')
              .single()
            if (insertErr) throw insertErr
            renewalId = inserted.id
          }

          const updatePatch = {}
          const portalUrl = 'https://mubiserp.com/portal'
          const mesaj = `Sayin ${client.name}, kira sozlesmeniz ${sahip.kiraBitis} tarihinde sona eriyor. Yeni net kira tutarini MUBiS portaldan bildirin veya kira artisi olmadigini belirtin. ${portalUrl}`

          if (kalan <= 7 && kalan >= 1 && !existing?.hatirlatma_7gun) {
            updatePatch.hatirlatma_7gun = new Date().toISOString()
            if (client.phone) await sendWhatsAppText(client.phone, mesaj, waConfig)
          }
          if (kalan === 1 && !existing?.hatirlatma_1gun) {
            updatePatch.hatirlatma_1gun = new Date().toISOString()
            if (client.phone) await sendWhatsAppText(client.phone, mesaj, waConfig)
          }

          if (Object.keys(updatePatch).length > 0) {
            await supabase.from('kira_yenileme').update(updatePatch).eq('id', renewalId)
          }

          // Musteriye portal bildirimi gonder (admin degil)
          if (kalan <= 7 && kalan >= 1 && !existing?.hatirlatma_7gun) {
            await supabase.from('notifications').insert({
              client_id: client.id,
              type: 'kira_yenileme',
              title: 'Kira sözleşmeniz sona eriyor',
              message: `Sayin ${client.name}, kira sözleşmeniz ${sahip.kiraBitis} tarihinde sona eriyor. Yeni net kira tutarini portaldan bildirebilir veya kira artisi olmadigini belirtebilirsiniz.`,
              audience: 'client',
              route: '/portal',
              metadata: { renewal_id: renewalId, sahip_index: i, kalan_gun: kalan }
            })
            await supabase.from('client_messages').insert({
              client_id: client.id,
              sender: 'admin',
              message: mesaj,
              is_read: true,
              action_type: 'kira_yenileme_hatirlatma',
              action_label: 'Yeni Kira Bildir',
              action_url: '/portal'
            })
          }

          if (kalan === 1 && !existing?.hatirlatma_1gun) {
            await supabase.from('notifications').insert({
              client_id: client.id,
              type: 'kira_yenileme',
              title: 'Kira artisiniza 1 gün kaldi',
              message: `Sayin ${client.name}, kira sözleşmeniz ${sahip.kiraBitis} tarihinde sona eriyor. Son gün hatirlatmasi: Yeni net kira tutarini portaldan bildirin veya kira artisi olmadigini belirtin.`,
              audience: 'client',
              route: '/portal',
              metadata: { renewal_id: renewalId, sahip_index: i, kalan_gun: kalan }
            })
          }

          created.push({ client_id: client.id, sahip_index: i, kalan, renewal_id: renewalId })
        }
      } catch (err) {
        errors.push({ client_id: client.id, error: err.message })
      }
    }

    return json({ success: true, created, errors, debug: { total_clients: clients?.length || 0, kiraci_count: kiraciClients.length, sample: sampleKiraTipi, has_kb_map: allKiraBilgisiRaw } })

  } catch (err) {
    console.error('kira-yenileme-kontrol hatasi:', err)
    return json({ success: false, error: err.message }, 500)
  }
}
