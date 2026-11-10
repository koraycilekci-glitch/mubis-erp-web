// Yardimci program zip yukleme ucu — Supabase Storage 'indirilenler' bucket'ina
// service key ile yazar. Guvenlik: istek 'x-upload-key' header'i Pages secret
// olan HELPER_UPLOAD_KEY ile eslesmeli. Zip boyutu ~40 MB (Pages limiti 25 MB
// oldugundan zip dosyasi STATIC olarak deploy EDILMEZ; bu fonksiyon uzerinden
// storage'a gider).
export const onRequestPost = async ({ request, env }) => {
  try {
    const key = request.headers.get('x-upload-key') || ''
    if (!env.HELPER_UPLOAD_KEY || key !== env.HELPER_UPLOAD_KEY) {
      return new Response(JSON.stringify({ ok: false, error: 'yetkisiz', tani: { envVarMi: !!env.HELPER_UPLOAD_KEY, envUzunluk: (env.HELPER_UPLOAD_KEY || '').length, gonderilenUzunluk: key.length } }), { status: 401, headers: { 'Content-Type': 'application/json' } })
    }
    const url = new URL(request.url)
    const dosyaAdi = (url.searchParams.get('dosya') || 'mubis-gib-yardimci.zip').replace(/[^a-zA-Z0-9._-]/g, '')
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY
    if (!serviceKey) {
      return new Response(JSON.stringify({ ok: false, error: 'service key yok' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
    const govde = await request.arrayBuffer()
    if (!govde || govde.byteLength < 1000) {
      return new Response(JSON.stringify({ ok: false, error: 'govde bos/cok kucuk' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    const upRes = await fetch(
      `https://gxuqrxmpgoeyykoolmwv.supabase.co/storage/v1/object/indirilenler/${dosyaAdi}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/zip',
          'x-upsert': 'true'
        },
        body: govde
      }
    )
    const upText = await upRes.text()
    if (!upRes.ok) {
      return new Response(JSON.stringify({ ok: false, status: upRes.status, error: upText.substring(0, 400) }), { status: 502, headers: { 'Content-Type': 'application/json' } })
    }
    // dogrula: public HEAD ile boyut karsilastir
    let publicBoyut = null
    try {
      const h = await fetch(`https://gxuqrxmpgoeyykoolmwv.supabase.co/storage/v1/object/public/indirilenler/${dosyaAdi}`, { method: 'HEAD' })
      publicBoyut = Number(h.headers.get('content-length') || 0)
    } catch { }
    return new Response(JSON.stringify({ ok: true, dosya: dosyaAdi, yuklenen: govde.byteLength, publicBoyut }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e && e.message) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
