-- Beyanname kayitlari: LISANSLI PROGRAM GIBI fiziksel satir kimligi
-- (Supabase Dashboard > SQL Editor'de bir kez calistirilir)
--
-- Lisansli otomasyon kurali: "Keep the physical result-row count; never
-- deduplicate corrections here." — GİB'deki her fiziksel satir ayri kayit.
-- Ayni VKN+tur+donem birden fazla kez yuklendiyse (duzeltme), her yukleme
-- ayri satir olarak korunur. Bunun icin benzersiz anahtar yukleme
-- zamanini da icermeli.
--
-- 1) Eski dar anahtari (vkn,tur,donem) bul ve kaldir
DO $$
DECLARE k text;
BEGIN
  FOR k IN
    SELECT c.conname FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'beyanname_kayitlari'
      AND c.contype = 'u'
      AND (SELECT count(*) FROM unnest(c.conkey)) = 3
  LOOP
    EXECUTE 'ALTER TABLE beyanname_kayitlari DROP CONSTRAINT ' || k;
  END LOOP;
END $$;

-- 2) Fiziksel satir anahtari: VKN + tur + donem + yukleme zamani
ALTER TABLE beyanname_kayitlari
  DROP CONSTRAINT IF EXISTS beyanname_kayitlari_satir_key;
ALTER TABLE beyanname_kayitlari
  ADD CONSTRAINT beyanname_kayitlari_satir_key
  UNIQUE (vkn, tur, donem, yukleme_zamani);
