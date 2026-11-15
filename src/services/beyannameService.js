// Beyanname Kontrol Listesi servisi
// - GİB Dijital VD "onaylı beyanname" sorgusunu yerel yardımcı programa
//   yaptırır (beyanname-sorgula işi; mali müşavir kimliğiyle tüm temsil
//   edilen mükelleflerin onaylı beyannameleri tek sorguda gelir)
// - Kayıtlar Supabase "beyanname_kayitlari" tablosuna upsert edilir (VKN bazlı)
// - Kullanıcı kararları "beyanname_kararlar" tablosunda tutulur
// (firma × tür × dönem: review/required/not-required)
import { supabase } from '../lib/supabase'
import { yardimciIsSunucu } from '../utils/gibOdemeHelper'
import { getMyOfficeId } from './officeService'

// Supabase tek istekte en fazla 1000 satir dondurur. Donem toplamlari ve
// listeler eksik kalmasin diye range() ile sayfa sayfa okunur.
const SAYFA_BOYU = 1000

async function sayfaliGetir(kur) {
  const hepsi = []
  for (let bas = 0; ; bas += SAYFA_BOYU) {
    const { data, error } = await kur().range(bas, bas + SAYFA_BOYU - 1)
    if (error) throw error
    const parti = data || []
    hepsi.push(...parti)
    if (parti.length < SAYFA_BOYU) break
  }
  return hepsi
}

// GİB dönem metni toleranslı okunur: "02/2026-02/2026" (aylık),
// "01/2026-03/2026" (üç aylık), "09/2026", "01/09/2026-30/09/2026"
// (günlük) ve nokta ayraçlı biçimler → metindeki tüm ay/yıl çiftleri
// bulunur, en küçük–en büyük ay aralığı verilen ayı kapsıyor mu bakılır.
// (2.7.492: DVS bazı ekranlarda dönemi günlük/tek-ay biçiminde yazabiliyor;
// katı "XX/YYYY-XX/YYYY" eşleşmesi kayıtları matristen düşürüyordu.)
export function donemKapsiyor(donemMetni, yil, ay) {
  const ciftler = String(donemMetni || '').match(/(\d{1,2})[/.](\d{4})/g) || []
  if (!ciftler.length) return false
  const ayilar = ciftler.map(s => {
    const m = s.match(/(\d{1,2})[/.](\d{4})/)
    return +m[2] * 12 + (+m[1] - 1)
  })
  const bas = Math.min(...ayilar), son = Math.max(...ayilar)
  const hedef = yil * 12 + (ay - 1)
  return hedef >= bas && hedef <= son
}

// Onaylı beyannameleri önce İstanbul sunucusundan (VPS) sorgular; VPS'e
// ulaşılamazsa (502/521/timeout) otomatik olarak YEREL yardımcıya düşer.
// Yerel yardımcı da kapalıysa anlaşılır hata döner.
// turKodu: GİB beyanname tür kodu filtresi (KDV1, KDV2, MUHSGK, KURUMLAR...) —
// boşsa tüm türler. vknListesi: GİB sistem hatası durumunda VKN/TCKN'ye
// daraltma için bilinen mükellef kimlikleri (lisanslı program tekniği).
// Donus: { ok, toplam, onayliToplam, bosKanit }
export async function beyannameSorgula({ kullaniciKodu, parola, yil, ay, turKodu, vknListesi }) {
  const res = await yardimciIsSunucu('beyanname-sorgula', {
    kullaniciKodu, parola, yil, ay, turKodu: turKodu || '',
    vknListesi: Array.isArray(vknListesi) ? vknListesi : []
  }, 40 * 60 * 1000)
  if (!res.ok) return res
  const onayli = (res.kayitlar || []).filter(k => k.onayli)
  const yazimHatalari = []
  if (onayli.length) {
    const simdi = new Date().toISOString()
    const officeId = await getMyOfficeId()
    const harita = new Map()
    for (const k of onayli) {
      harita.set(JSON.stringify([k.vkn, k.tur || '', k.donem || '', k.yuklemeZamani || '']), {
        office_id: officeId,
        vkn: k.vkn,
        tur: k.tur || '',
        donem: k.donem || '',
        unvan: k.unvan || '',
        vergi_dairesi: k.vergiDairesi || '',
        yukleme_zamani: k.yuklemeZamani || '',
        durum: k.durum || '',
        onayli: true,
        sorgu_ts: simdi
      })
    }
    const satirlar = [...harita.values()]
    const yazBatch = async (grup, conflict) => {
      const { error } = await supabase
        .from('beyanname_kayitlari')
        .upsert(grup, { onConflict: conflict })
      return error
    }
    for (let i = 0; i < satirlar.length; i += 200) {
      const grup = satirlar.slice(i, i + 200)
      const error = await yazBatch(grup, 'office_id,vkn,tur,donem,yukleme_zamani')
      if (error) {
        console.warn('beyanname kayit yazim hatasi:', error.message)
        yazimHatalari.push(error.message)
      }
    }
  }
  return {
    ok: true, toplam: res.toplam || 0, onayliToplam: onayli.length,
    bosKanit: !!res.bosKanit, basarisizSorgular: res.basarisizSorgular || [], yazimHatalari
  }
}

// 2.7.494: LISANSLI PROGRAM GIBI ("Vergilendirme dönemi filtrelenmedi") —
// matris donemine ait kayitlar YUKLEME TARIHINE gore suzulur: dönem X
// seçilirse X+1 ayında yüklenmiş onaylı beyannameler listelenir (dönem
// metni yalnızca gösterim amaçlıdır; filtrelenmez). Yükleme zamanı
// "GG.AA.YYYY ..." biçiminde gelir.
export function yuklemeAyinda(yuklemeZamani, yil, ay) {
  const sorguYil = ay === 12 ? yil + 1 : yil
  const sorguAy = ay === 12 ? 1 : ay + 1
  const m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(String(yuklemeZamani || '').trim())
  if (!m) return false
  return +m[3] === sorguYil && +m[2] === sorguAy
}

// Secili doneme ait onayli kayitlar (VKN bazli, ham)
// Detay: hata yutulmaz — okuma hatasi ekranda gosterilir (2.7.495)
export async function beyannameKayitlariGetirDetay(yil, ay) {
  try {
    const { data, error } = await sayfaliGetir(() => supabase
      .from('beyanname_kayitlari')
      .select('*')
      .eq('onayli', true)
      .order('sorgu_ts', { ascending: false }))
    if (error) return { kayitlar: [], hata: error.message }
    return { kayitlar: (data || []).filter(k => yuklemeAyinda(k.yukleme_zamani, yil, ay)), hata: '' }
  } catch (e) {
    return { kayitlar: [], hata: (e && e.message) || 'okuma hatasi' }
  }
}

export async function beyannameKayitlariGetir(yil, ay) {
  const { kayitlar } = await beyannameKayitlariGetirDetay(yil, ay)
  return kayitlar
}

// Secili donemin kararlarini getirir: [{client_id, tur, donem, karar}]
export async function beyannameKararlariGetir(yil, ay) {
  try {
    const { data, error } = await sayfaliGetir(() => supabase
      .from('beyanname_kararlar')
      .select('*'))
    if (error) return []
    return (data || []).filter(k => donemKapsiyor(k.donem, yil, ay))
  } catch {
    return []
  }
}

// Tek hücre karari kaydeder/degistirir (onayli kayit olan hucrelerde UI
// zaten select gostermiyor — gozlem kullanici kararini ezmez)
export async function beyannameKararKaydet(clientId, tur, donem, karar) {
  const { error } = await supabase
    .from('beyanname_kararlar')
    .upsert({ client_id: clientId, tur, donem, karar, updated_at: new Date().toISOString() },
      { onConflict: 'client_id,tur,donem' })
  return !error
}

// Secili yil+ay donemine ait TUM kullanici kararlarini siler (matris sifirlama).
// donem alanı "AA/YYYY" veya aralık "AA/YYYY-AA/YYYY" olabildiginden once
// tüm satirlar okunur, donemKapsiyor ile filtrelenir, id bazinda silinir.
export async function beyannameKararlariSifirla(yil, ay) {
  try {
    const { data, error } = await sayfaliGetir(() => supabase
      .from('beyanname_kararlar')
      .select('id, donem'))
    if (error) return -1
    const ids = (data || []).filter(k => donemKapsiyor(k.donem, yil, ay)).map(k => k.id)
    if (!ids.length) return 0
    const { error: delError } = await supabase
      .from('beyanname_kararlar')
      .delete()
      .in('id', ids)
    return delError ? -1 : ids.length
  } catch {
    return -1
  }
}

// Secili donemin matrisini besleyen GİB onayli kayitlarini siler —
// matriste gorunen YESIL "Gönderildi" hucreleri bunlar. Donem filtresi
// matrisle ayni: yukleme tarihi (GG.AA.YYYY) dönem+1 ayinda olan kayitlar.
export async function beyannameKayitlariSifirla(yil, ay) {
  try {
    const { data, error } = await supabase
      .from('beyanname_kayitlari')
      .select('id, yukleme_zamani')
      .eq('onayli', true)
      .limit(20000)
    if (error) return -1
    const ids = (data || []).filter(k => yuklemeAyinda(k.yukleme_zamani, yil, ay)).map(k => k.id)
    if (!ids.length) return 0
    const { error: delError } = await supabase
      .from('beyanname_kayitlari')
      .delete()
      .in('id', ids)
    return delError ? -1 : ids.length
  } catch {
    return -1
  }
}
