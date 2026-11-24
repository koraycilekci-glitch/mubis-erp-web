-- MUBiS ERP - Muhasebe Odeme Takip
-- Supabase SQL Editor'da calistirin

-- 1. Musteri muhasebe ucretleri
CREATE TABLE IF NOT EXISTS accounting_fees (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
  onceki_donem_borc NUMERIC DEFAULT 0,
  defter_tasdik_ucreti NUMERIC DEFAULT 0,
  aylik_ucret NUMERIC DEFAULT 0,
  muhasebe_ucreti_var BOOLEAN DEFAULT true,
  baslangic_ay INT DEFAULT 1,
  baslangic_yil INT DEFAULT 2025,
  notlar TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id)
);

-- 2. Odeme kayitlari
CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
  tutar NUMERIC NOT NULL,
  odeme_tipi TEXT NOT NULL DEFAULT 'eft',
  odeme_kanali TEXT DEFAULT 'manuel',
  aciklama TEXT DEFAULT '',
  donem TEXT DEFAULT '',
  gateway_ref TEXT DEFAULT '',
  odeme_tarihi DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE accounting_fees ADD COLUMN IF NOT EXISTS muhasebe_ucreti_var BOOLEAN DEFAULT true;
ALTER TABLE accounting_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounting_fees_all" ON accounting_fees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "payments_all" ON payments FOR ALL USING (true) WITH CHECK (true);
