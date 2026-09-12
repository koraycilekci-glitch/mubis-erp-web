-- MUBiS ERP - Personel SGK durumu (calisan/emekli) + Ise Giris-Isten Cikis Bildirgesi
-- Supabase SQL Editor'da calistirin

ALTER TABLE employees ADD COLUMN IF NOT EXISTS sgk_durumu TEXT DEFAULT 'calisan';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS ise_giris_bildirge_url TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS isten_cikis_bildirge_url TEXT;

-- Sadece 'calisan' veya 'emekli' degeri alabilsin
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_sgk_durumu_check;
ALTER TABLE employees ADD CONSTRAINT employees_sgk_durumu_check
  CHECK (sgk_durumu IN ('calisan', 'emekli'));
