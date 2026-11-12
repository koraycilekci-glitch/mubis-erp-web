-- ============================================================
-- MUBIS ERP - e-Tebligat Merkezi Tablosu
-- (Dijital Vergi Dairesi'nden indirilen e-Tebligatlar)
-- Supabase Dashboard > SQL Editor'de calistirin.
-- ============================================================

CREATE TABLE IF NOT EXISTS etebligatlar (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT REFERENCES offices(id) ON DELETE CASCADE,
  client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
  kaynak TEXT DEFAULT 'vergi', -- 'vergi' (Dijital Vergi Dairesi) | 'sgk' (e-Devlet)
  kurum TEXT DEFAULT '',
  belge_turu TEXT DEFAULT '',
  belge_no TEXT NOT NULL,
  gonderme_tarihi TEXT DEFAULT '',
  teblig_tarihi TEXT DEFAULT '',
  okuma_tarihi TEXT DEFAULT '',
  okundu BOOLEAN DEFAULT false,
  dosya_adi TEXT,
  file_url TEXT,
  whatsapp_gonderim_ts TIMESTAMPTZ,
  email_gonderim_ts TIMESTAMPTZ,
  sorgu_ts TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, belge_no)
);

CREATE INDEX IF NOT EXISTS idx_etebligatlar_office_client ON etebligatlar(office_id, client_id);
CREATE INDEX IF NOT EXISTS idx_etebligatlar_okundu ON etebligatlar(okundu);

-- ============================================================
-- RLS Politikalari (automation.sql ile ayni desen)
-- ============================================================

ALTER TABLE etebligatlar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS etebligatlar_select ON etebligatlar;
DROP POLICY IF EXISTS etebligatlar_admin_all ON etebligatlar;
DROP POLICY IF EXISTS etebligatlar_client ON etebligatlar;

CREATE POLICY "etebligatlar_select" ON etebligatlar FOR SELECT USING (
  is_super_admin() OR office_id = my_office_id()
);
CREATE POLICY "etebligatlar_admin_all" ON etebligatlar FOR ALL USING (
  is_super_admin() OR office_id = my_office_id()
);

-- Musteri rolune kendi tebligatlarini gosterme
CREATE POLICY "etebligatlar_client" ON etebligatlar FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = etebligatlar.client_id AND c.auth_user_id = auth.uid()
  )
);

-- Dogrulama sorgusu
SELECT 'etebligatlar' AS tablo, COUNT(*) AS satir FROM etebligatlar;
