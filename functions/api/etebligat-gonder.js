// MUBIS - e-Tebligat OTOMATIK GONDERIM koprusu.
//
// Otomatik Sorgu (cron) sirasinda YENI bir tebligat indirildiginde yardimci
// program bu uca PDF'i gonderir. Uc:
//   1) PDF'i Storage'a yukler ve etebligatlar satirina file_url isler,
//   2) musterinin "Tahakkuk Gonderim Sekli" tercihini okur
//      (clients.beyan_durumlari.tahakkukGonderim: whatsapp | mail | ikisi | yok),
//   3) tercihe gore UST YAZI + PDF eki ile gonderir:
//        - e-posta: /api/send-email (SMTP, ek olarak PDF),
//        - WhatsApp Cloud API (whatsapp_channel=api): belge mesaji,
//        - WhatsApp web/masaustu: sunucudan gonderilemez; gorev olarak
//          yardimci programa dondurulur (yerel_whatsapp).
//   4) gonderim zaman damgalarini satira yazar.
//
// Guvenlik: cron PATCH ucu gibi anahtarsizdir; ancak yalnizca AKTIF bir
// otomatik sorgu plani bulunan client_id kabul edilir ve govde gercek bir
// PDF olmak zorundadir.
import { CORS, json } from './_lib.js'

const SB_URL = 'https://gxuqrxmpgoeyykoolmwv.supabase.co'
const BUCKET = 'client-documents'

function svcHeaders(env) {
  const key = env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_SERVICE_KEY
  if (!key) return null
  return { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' }
}

function tarihYaz(s) {
  const t = String(s || '').trim()
  if (!t) return ''
  const m = t.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}.${m[2]}.${m[1]}`
  return t
}

// Ust yazi (gonderim metni) — WhatsApp ve e-posta icin ortak govde
function ustYazi(client, satir, kanal) {
  const unvan = client?.company_name || client?.name || 'Sayin Mukellefimiz'
  const kurum = satir?.kurum || 'ilgili kurum'
  const tur = satir?.belge_turu ? ` (${satir.belge_turu})` : ''
  const no = satir?.belge_no ? `\nBelge No: ${satir.belge_no}` : ''
  const tarih = satir?.teblig_tarihi ? `\nTeblig Tarihi: ${tarihYaz(satir.teblig_tarihi)}` : ''
  const satirlar = [
    `Sayin ${unvan},`,
    '',
    `${kurum} tarafindan adiniza yeni bir e-Tebligat duzenlenmistir${tur}.${no}${tarih}`,
    '',
    'Tebligat belgesi bu mesaja eklenmistir. Tebligatin hukuki sureleri teblig tarihinden itibaren islemeye baslar; incelemenizi ve gerekli islemleri zamaninda yapmanizi rica ederiz.',
    '',
    'Bilgi ve islem icin mali musavirliginizla iletisime gecebilirsiniz.'
  ]
  if (kanal === 'whatsapp' && satir?.file_url) {
    satirlar.push('', `Belge baglantisi: ${satir.file_url}`)
  }
  return satirlar.join('\n')
}

function telefonNormalle(t) {
  let s = String(t || '').replace(/\D/g, '')
  if (!s) return ''
  if (s.startsWith('90')) return s
  if (s.startsWith('0')) s = s.slice(1)
  if (s.length === 10) return '90' + s
  return s
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function onRequestPost({ request, env }) {
  const SvcH = svcHeaders(env)
  if (!SvcH) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY tanimli degil' }, 500)

  let govde
  try {
    govde = await request.json()
  } catch {
    return json({ error: 'gecersiz JSON' }, 400)
  }

  const clientId = Number(govde?.client_id)
  const belgeNo = String(govde?.belge_no || '').trim()
  if (!clientId || !belgeNo) return json({ error: 'client_id ve belge_no zorunlu' }, 400)

  // Yalnizca aktif otomatik sorgu plani olan musteri
  try {
    const r = await fetch(`${SB_URL}/rest/v1/etebligat_cron?client_id=eq.${clientId}&aktif=eq.true&select=id&limit=1`, { headers: SvcH })
    const planlar = r.ok ? await r.json() : []
    if (!Array.isArray(planlar) || !planlar.length) {
      return json({ error: 'bu musteri icin aktif otomatik sorgu plani yok' }, 403)
    }
  } catch {
    return json({ error: 'plan dogrulanamadi' }, 502)
  }

  const sonuc = { ok: true, belge_no: belgeNo, yuklendi: false, mail: '', whatsapp: '', yerel_whatsapp: null }

  // ---- 1) PDF'i Storage'a yukle ----
  let fileUrl = String(govde?.file_url || '')
  const pdfB64 = String(govde?.pdf_base64 || '')
  if (!fileUrl && pdfB64) {
    try {
      const ikili = Uint8Array.from(atob(pdfB64), c => c.charCodeAt(0))
      const basi = new TextDecoder().decode(ikili.slice(0, 5))
      if (basi !== '%PDF-') return json({ error: 'govde PDF degil' }, 400)
      const onek = `etebligat_${clientId}_${belgeNo.replace(/[^A-Za-z0-9_-]/g, '_')}`
      const yol = `etebligatlar/${clientId}/${onek}.pdf`
      const y = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${yol}`, {
        method: 'POST',
        headers: {
          'apikey': SvcH.apikey,
          'Authorization': SvcH.Authorization,
          'Content-Type': 'application/pdf',
          'x-upsert': 'true'
        },
        body: ikili
      })
      if (y.ok) {
        fileUrl = `${SB_URL}/storage/v1/object/public/${BUCKET}/${yol}`
        sonuc.yuklendi = true
        await fetch(`${SB_URL}/rest/v1/etebligatlar?client_id=eq.${clientId}&belge_no=eq.${encodeURIComponent(belgeNo)}`, {
          method: 'PATCH',
          headers: { ...SvcH, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ file_url: fileUrl, dosya_adi: onek + '.pdf' })
        })
      } else {
        sonuc.yukleme_hatasi = `storage ${y.status}: ${(await y.text()).substring(0, 200)}`
      }
    } catch (e) {
      sonuc.yukleme_hatasi = e?.message || 'yukleme hatasi'
    }
  }

  // ---- 2) Musteri + tebligat satiri ----
  let client = null
  let satir = null
  try {
    const [cr, sr] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/clients?id=eq.${clientId}&select=id,name,company_name,email,phone,whatsapp,beyan_durumlari&limit=1`, { headers: SvcH }),
      fetch(`${SB_URL}/rest/v1/etebligatlar?client_id=eq.${clientId}&belge_no=eq.${encodeURIComponent(belgeNo)}&select=*&limit=1`, { headers: SvcH })
    ])
    client = ((cr.ok ? await cr.json() : [])[0]) || null
    satir = ((sr.ok ? await sr.json() : [])[0]) || null
  } catch { /* asagida kontrol ediliyor */ }
  if (!client) return json({ error: 'musteri bulunamadi' }, 404)
  satir = satir || { belge_no: belgeNo }
  if (fileUrl) satir.file_url = fileUrl

  // ---- 3) Gonderim tercihi (tahakkuk gonderim sekli ile ayni) ----
  const bd = client.beyan_durumlari || {}
  const tercih = String(bd.tahakkukGonderim || 'yok').toLowerCase()
  sonuc.tercih = tercih
  if (tercih === 'yok' || !tercih) {
    sonuc.atlandi = 'musteri tercihi: gonderme yok'
    return json(sonuc)
  }
  const waIstendi = tercih === 'whatsapp' || tercih === 'ikisi'
  const mailIstendi = tercih === 'mail' || tercih === 'email' || tercih === 'ikisi'

  const metin = ustYazi(client, satir, 'whatsapp')
  const mailMetni = ustYazi(client, satir, 'mail')
  const konu = `Yeni e-Tebligat: ${satir.kurum || ''} ${satir.belge_no || ''}`.trim()
  const dosyaAdi = `e-Tebligat_${belgeNo}.pdf`

  // ---- 4a) E-posta ----
  if (mailIstendi) {
    const alici = String(client.email || '').trim()
    if (!alici) sonuc.mail = 'atlandi: e-posta adresi yok'
    else if (!fileUrl) sonuc.mail = 'atlandi: belge baglantisi yok'
    else {
      try {
        const kokU = new URL(request.url)
        const r = await fetch(`${kokU.origin}/api/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: alici,
            subject: konu,
            text: mailMetni,
            html: `<pre style="font-family:inherit;white-space:pre-wrap">${mailMetni.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</pre>`,
            documents: [{ url: fileUrl, name: dosyaAdi }]
          })
        })
        const j = await r.json().catch(() => ({}))
        if (r.ok && j.success !== false) {
          sonuc.mail = 'gonderildi'
          await fetch(`${SB_URL}/rest/v1/etebligatlar?client_id=eq.${clientId}&belge_no=eq.${encodeURIComponent(belgeNo)}`, {
            method: 'PATCH',
            headers: { ...SvcH, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ email_gonderim_ts: new Date().toISOString() })
          })
        } else {
          sonuc.mail = 'hata: ' + String(j.error || r.status).substring(0, 160)
        }
      } catch (e) {
        sonuc.mail = 'hata: ' + (e?.message || '').substring(0, 160)
      }
    }
  }

  // ---- 4b) WhatsApp ----
  if (waIstendi) {
    const tel = telefonNormalle(client.whatsapp || client.phone)
    if (!tel) sonuc.whatsapp = 'atlandi: telefon yok'
    else {
      // Kanal ayari
      let kanal = 'api'
      let waToken = ''
      let waPhoneId = ''
      try {
        const r = await fetch(`${SB_URL}/rest/v1/app_settings?key=in.(whatsapp_channel,whatsapp_access_token,whatsapp_phone_number_id)&select=key,value`, { headers: SvcH })
        const ayarlar = r.ok ? await r.json() : []
        const bul = (k) => (ayarlar.find(a => a.key === k)?.value || '')
        kanal = (bul('whatsapp_channel') || 'api').toLowerCase()
        waToken = bul('whatsapp_access_token')
        waPhoneId = bul('whatsapp_phone_number_id')
      } catch { /* varsayilan api */ }

      if (kanal === 'web' || kanal === 'masaustu') {
        // Sunucudan gonderilemez — yardimci programa gorev olarak don
        sonuc.yerel_whatsapp = { telefon: tel, mesaj: metin, kanal, dosya_url: fileUrl || '', dosya_adi: dosyaAdi }
        sonuc.whatsapp = 'yerel-gorev'
      } else if (!waToken || !waPhoneId) {
        sonuc.whatsapp = 'atlandi: WhatsApp API ayarlari eksik'
      } else {
        try {
          const govdeWa = fileUrl
            ? { messaging_product: 'whatsapp', to: tel, type: 'document', document: { link: fileUrl, filename: dosyaAdi, caption: metin.substring(0, 1000) } }
            : { messaging_product: 'whatsapp', to: tel, type: 'text', text: { body: metin } }
          const r = await fetch(`https://graph.facebook.com/v21.0/${waPhoneId}/messages`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + waToken, 'Content-Type': 'application/json' },
            body: JSON.stringify(govdeWa)
          })
          const j = await r.json().catch(() => ({}))
          if (r.ok && !j.error) {
            sonuc.whatsapp = 'gonderildi'
            await fetch(`${SB_URL}/rest/v1/etebligatlar?client_id=eq.${clientId}&belge_no=eq.${encodeURIComponent(belgeNo)}`, {
              method: 'PATCH',
              headers: { ...SvcH, 'Prefer': 'return=minimal' },
              body: JSON.stringify({ whatsapp_gonderim_ts: new Date().toISOString() })
            })
          } else {
            sonuc.whatsapp = 'hata: ' + String(j?.error?.message || r.status).substring(0, 160)
          }
        } catch (e) {
          sonuc.whatsapp = 'hata: ' + (e?.message || '').substring(0, 160)
        }
      }
    }
  }

  return json(sonuc)
}

// Yardimci program yerel WhatsApp gorevini tamamladiginda zaman damgasini yazar
export async function onRequestPatch({ request, env }) {
  const SvcH = svcHeaders(env)
  if (!SvcH) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY tanimli degil' }, 500)
  try {
    const g = await request.json()
    const clientId = Number(g?.client_id)
    const belgeNo = String(g?.belge_no || '').trim()
    if (!clientId || !belgeNo) return json({ error: 'client_id ve belge_no zorunlu' }, 400)
    const alan = g?.kanal === 'mail' ? 'email_gonderim_ts' : 'whatsapp_gonderim_ts'
    await fetch(`${SB_URL}/rest/v1/etebligatlar?client_id=eq.${clientId}&belge_no=eq.${encodeURIComponent(belgeNo)}`, {
      method: 'PATCH',
      headers: { ...SvcH, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ [alan]: new Date().toISOString() })
    })
    return json({ ok: true })
  } catch (e) {
    return json({ error: e?.message || 'sunucu hatasi' }, 500)
  }
}
