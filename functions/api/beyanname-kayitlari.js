// Beyanname Kontrol Listesi — onaylı kayıt okuma ucu (Cloudflare Pages Function)
// --------------------------------------------------------------------------
// Tarayıcıdan Supabase'e doğrudan okuma yapıldığında iki sorun oluşuyordu:
//   1) PostgREST tek istekte en fazla 999 satır döndürüyor; istemci 1000
//      bekleyip ilk sayfada sanıyordu → yeni kayıtlar hiç okunmuyordu.
//   2) Aynı `sorgu_ts` değerine sahip toplu yazımlarda tek anahtarla sıralama
//      kararsız olduğu için sayfalar arasında kayıtlar kayboluyordu.
// Burada filtreleme/sunucu tarafında yapılır, sayfalama sabit `id` anahtarıyla
// ve doğru sayfa boyuyla (999) yürütülür; RLS de etkilemez (service-role).
import { json, supabaseAdmin } from './_lib.js'

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
}

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url)
  const yil = Number(u.searchParams.get('yil'))
  const ay = Number(u.searchParams.get('ay'))
  if (!(yil > 2000) || !(ay >= 1 && ay <= 12)) return json({ ok: false, hata: 'Geçersiz yıl/ay' }, 400)

  const admin = supabaseAdmin(env)
  if (!admin) return json({ ok: false, hata: 'Sunucu Supabase anahtarı tanımlı değil' }, 500)

  // Seçili dönem X ise yükleme ayı X+1'dir (2.7.494 lisanslı program kuralı).
  const yuklemeYil = ay === 12 ? yil + 1 : yil
  const yuklemeAy = ay === 12 ? 1 : ay + 1
  const baslangic = `01.${String(yuklemeAy).padStart(2, '0')}.${yuklemeYil}`
  // Text kolonu_oldugu icin yalniz alt sinir uygulanir; ust sinir PostgREST'de
  // ayni kolona iki filtre verildiginde guvenilmez oldugu icin JS'de kesilir.
  const ayinda = (z) => {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(String(z || '').trim())
    return !!m && +m[3] === yuklemeYil && +m[2] === yuklemeAy
  }

  try {
    const kayitlar = []
    const SAYFA = 999
    for (let bas = 0; ; bas += SAYFA) {
      const { data, error } = await admin
        .from('beyanname_kayitlari')
        .select('id,vkn,tur,donem,unvan,vergi_dairesi,yukleme_zamani,durum,onayli,sorgu_ts,office_id')
        .eq('onayli', true)
        .gte('yukleme_zamani', baslangic)
        .order('id', { ascending: true })
        .range(bas, bas + SAYFA - 1)
      if (error) throw error
      const parti = data || []
      kayitlar.push(...parti.filter(k => ayinda(k.yukleme_zamani)))
      if (parti.length < SAYFA) break
    }
    return json({ ok: true, yil, ay, baslangic, kayitlar })
  } catch (e) {
    return json({ ok: false, hata: (e && e.message) || 'okuma hatası' }, 502)
  }
}
