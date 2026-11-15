// MUBiS - Lisans API (Cloudflare Pages Function)
//
// GET  /api/lisans?action=status           (Bearer) -> ofisin lisans/deneme durumu
// GET  /api/lisans?action=talep&device=... (Bearer) -> MUBREQ1 talep kodu uretir
// POST /api/lisans {action:'aktive', lisans_kodu} (Bearer) -> imzali kodu dogrulup kaydeder
// POST /api/lisans {action:'iptal', office_id} (Bearer, super_admin) -> lisansi iptal eder
//
// Gerekli env: (yok) — LISANS_MUAF_OFFICES opsiyonel (varsayilan '1')

import { CORS, json, dogrulaKullanici } from './_driveCommon.js'
import { createClient } from '@supabase/supabase-js'
import {
  lisansDurumu, lisansKoduCoz, talepKoduUret, talepKoduCoz, muafOfisler,
} from './_lisansCommon.js'

const SB_URL = 'https://gxuqrxmpgoeyykoolmwv.supabase.co'

function supabaseAdmin(env) {
  const key = env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_SERVICE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY tanimli degil')
  return createClient(SB_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const action = url.searchParams.get('action') || 'status'

  try {
    const admin = supabaseAdmin(env)
    const kontrol = await dogrulaKullanici(request, env)
    if (!kontrol.ok) return json({ ok: false, error: kontrol.hata }, kontrol.kod)
    const officeId = kontrol.profil?.office_id

    if (action === 'status') {
      const durum = await lisansDurumu(admin, env, officeId)
      return json({ ok: true, ...durum, muafOfisler: muafOfisler(env) })
    }

    if (action === 'talep') {
      const device = (url.searchParams.get('device') || '').toUpperCase()
      if (!/^[A-F0-9]{8,64}$/.test(device)) {
        return json({ ok: false, error: 'Gecerli cihaz kimligi (device) gerekli.' }, 400)
      }
      if (!officeId) return json({ ok: false, error: 'Ofis bilgisi bulunamadi.' }, 400)
      const kod = talepKoduUret(officeId, device)
      return json({ ok: true, talep_kodu: kod, office_id: officeId, device })
    }

    return json({ ok: false, error: 'Gecersiz action. status | talep bekleniyor.' }, 400)
  } catch (e) {
    return json({ ok: false, error: e?.message || 'Lisans hatasi' }, 500)
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const admin = supabaseAdmin(env)
    const kontrol = await dogrulaKullanici(request, env)
    if (!kontrol.ok) return json({ ok: false, error: kontrol.hata }, kontrol.kod)

    const body = await request.json().catch(() => ({}))

    if (body?.action === 'aktive') {
      let p
      try {
        p = await lisansKoduCoz(body.lisans_kodu)
      } catch (e) {
        return json({ ok: false, error: e.message }, 400)
      }
      const officeId = kontrol.profil?.office_id
      // super_admin baskasina da aktive edebilir; normal admin kendi ofisine
      const hedefOffice = (kontrol.profil?.role === 'super_admin' && body.office_id)
        ? Number(body.office_id) : Number(officeId)
      if (p.office !== hedefOffice) {
        return json({ ok: false, error: `Bu lisans kodu ${p.office} numarali ofis icin uretilmis; sizin ofisiniz ${hedefOffice}.` }, 400)
      }

      const bitis = p.bitis || null
      const { error: yazHata } = await admin.from('lisanslar').upsert(
        {
          lisans_kodu: String(body.lisans_kodu).trim(),
          office_id: hedefOffice,
          cihaz_id: body.device || null,
          plan: p.plan,
          bitis,
          durum: 'aktif',
          talep_kodu: body.talep_kodu || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'office_id,plan' }
      )
      if (yazHata) return json({ ok: false, error: 'Lisans kaydedilemedi: ' + yazHata.message }, 500)
      return json({ ok: true, mesaj: 'Lisans aktive edildi.', plan: p.plan, bitis })
    }

    if (body?.action === 'iptal') {
      if (kontrol.profil?.role !== 'super_admin') {
        return json({ ok: false, error: 'Bu islem icin sistem yoneticisi yetkisi gerekir' }, 403)
      }
      if (!body.office_id) return json({ ok: false, error: 'office_id gerekli' }, 400)
      await admin.from('lisanslar').update({ durum: 'iptal', updated_at: new Date().toISOString() })
        .eq('office_id', Number(body.office_id))
      return json({ ok: true, mesaj: 'Lisans(lar) iptal edildi.' })
    }

    return json({ ok: false, error: "action 'aktive' | 'iptal' bekleniyor" }, 400)
  } catch (e) {
    return json({ ok: false, error: e?.message || 'Lisans hatasi' }, 500)
  }
}
