-- ============================================================
-- MUBIS ERP — Kota temizlik / tespit script'i
-- Amaç: "exceed_storage_size_quota" hatasini gidermek icin
--       once NEYIN yer kapladigini gormek, sonra guvenle temizlemek.
--
-- KULLANIM: Supabase Dashboard > SQL Editor.
-- ADIM 1'i (tespit) her zaman calistirin — hicbir sey silmez.
-- ADIM 2+ silme yapar; once ADIM 1 ciktisina bakip karar verin.
-- ============================================================


-- ============================================================
-- ADIM 1 — TESPIT (salt okunur, silme YOK)
-- ============================================================

-- 1a) Veritabani boyutu ve en buyuk tablolar
SELECT
  schemaname || '.' || relname AS tablo,
  pg_size_pretty(pg_total_relation_size(relid)) AS toplam_boyut,
  pg_size_pretty(pg_relation_size(relid))       AS veri_boyutu,
  n_live_tup                                    AS satir_sayisi
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 25;


-- 1b) Dosya deposu: bucket bazinda boyut
SELECT
  bucket_id,
  COUNT(*)                                   AS dosya_sayisi,
  pg_size_pretty(SUM((metadata->>'size')::bigint)) AS toplam_boyut
FROM storage.objects
GROUP BY bucket_id
ORDER BY SUM((metadata->>'size')::bigint) DESC NULLS LAST;


-- 1c) En buyuk 40 dosya (hangi bucket/klasor sisiriyor)
SELECT
  bucket_id,
  name,
  pg_size_pretty((metadata->>'size')::bigint) AS boyut,
  created_at
FROM storage.objects
ORDER BY (metadata->>'size')::bigint DESC NULLS LAST
LIMIT 40;


-- ============================================================
-- ADIM 2 — VERITABANI TEMIZLIGI (silme yapar)
-- Her blok bagimsizdir; yalnizca ihtiyaciniz olani calistirin.
-- ============================================================

-- 2a) 30 gunden eski borc sorgu sonuclari (uygulama zaten 10 gun
--     uzerini otomatik siliyor; bu ek guvenlik temizligi)
-- DELETE FROM borc_sonuclari
-- WHERE sorgu_ts < NOW() - INTERVAL '30 days';

-- 2b) Okunmus ve 90 gunden eski bildirimler
-- DELETE FROM notifications
-- WHERE is_read = true
--   AND created_at < NOW() - INTERVAL '90 days';

-- 2c) 1 yildan eski beyanname GIB kayitlari (yeniden sorgulanabilir)
-- DELETE FROM beyanname_kayitlari
-- WHERE yukleme_zamani IS NOT NULL
--   AND created_at < NOW() - INTERVAL '1 year';

-- 2d) VACUUM: silme sonrasi alani gercekten bosaltir
-- VACUUM FULL borc_sonuclari;
-- VACUUM FULL notifications;


-- ============================================================
-- ADIM 3 — DOSYA DEPOSU TEMIZLIGI
-- NOT: Buradaki dosyalar silinirse MUBIS'te gorunmez.
-- KURAL: Google Drive'a aktarilip DOGRULANMADAN silmeyin.
-- Once Drive gecisini tamamlayin (scripts/drive-gecis.mjs).
-- ============================================================

-- 3a) yalnizca bucket'ta kalan artik/gecici dosyalari listele
--     (or. sifir baytlik veya .tmp)
SELECT bucket_id, name, pg_size_pretty((metadata->>'size')::bigint) AS boyut
FROM storage.objects
WHERE (metadata->>'size')::bigint = 0
   OR name ILIKE '%.tmp'
ORDER BY created_at DESC
LIMIT 100;

-- 3b) Tek tek silmek icin (ornek):
-- DELETE FROM storage.objects
-- WHERE bucket_id = 'client-documents'
--   AND name = 'yol/dosya.pdf';
