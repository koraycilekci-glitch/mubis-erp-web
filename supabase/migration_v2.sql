-- MUBiS ERP - Parametreler ve Hesaplama Kayitlari
-- Supabase SQL Editor'da calistirin

-- 1. Parametreler tablosu
CREATE TABLE IF NOT EXISTS parameters (
  id BIGSERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  year INT,
  month INT,
  key TEXT NOT NULL,
  value NUMERIC,
  text_value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(category, year, month, key)
);

-- 2. Hesaplama kayitlari tablosu
CREATE TABLE IF NOT EXISTS calculations (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  calc_type TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Musteri tablosuna sgk_isyeri_no ekle
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sgk_isyeri_no TEXT DEFAULT '';

-- 4. Profiles tablosuna sifre kolonlari (onceki migration'dan)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_change_interval TEXT DEFAULT 'never';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_password_change TIMESTAMPTZ DEFAULT now();

-- 5. RLS
ALTER TABLE parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE calculations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "params_all" ON parameters FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "calcs_all" ON calculations FOR ALL USING (true) WITH CHECK (true);
