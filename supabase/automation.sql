-- ============================================================
-- MUBIS ERP - Otomatik Belge Toplama (e-Tebligat + SGK) Tablolari
-- ============================================================

-- Ofis bazli otomasyon ayarlari
CREATE TABLE IF NOT EXISTS automation_settings (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT REFERENCES offices(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT true,
  schedule_time TIME DEFAULT '02:00',
  repeat_type TEXT DEFAULT 'daily' CHECK (repeat_type IN ('daily','weekly','monthly')),
  enabled_types TEXT[] DEFAULT ARRAY['etebligat','sgk'],
  notify_whatsapp BOOLEAN DEFAULT false,
  notify_email BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(office_id)
);

-- Otomasyon joblari (calistirma kaydi)
CREATE TABLE IF NOT EXISTS automation_jobs (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT REFERENCES offices(id) ON DELETE CASCADE,
  client_id BIGINT REFERENCES clients(id) ON DELETE SET NULL,
  job_type TEXT NOT NULL CHECK (job_type IN ('etebligat','sgk','vergi_dairesi','tum')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','cancelled')),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  documents_found INT DEFAULT 0,
  documents_downloaded INT DEFAULT 0,
  triggered_by TEXT DEFAULT 'schedule' CHECK (triggered_by IN ('schedule','manual','bulk')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indirilen otomasyon belgeleri
CREATE TABLE IF NOT EXISTS automation_documents (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT REFERENCES offices(id) ON DELETE CASCADE,
  client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
  job_id BIGINT REFERENCES automation_jobs(id) ON DELETE SET NULL,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'etebligat','sgk_tahakkuk','sgk_hizmet','sgk_borc_dokumu',
    'vergi_borc_dokumu','tahakkuk_fisi','beyanname'
  )),
  source_id TEXT,
  title TEXT,
  file_path TEXT NOT NULL,
  file_url TEXT,
  document_date DATE,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Musteri portal sifreleri sifreli saklanacak
ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_credentials JSONB DEFAULT '{}'::jsonb;
-- portal_credentials ornegi: {"dvs":{"u":"...","p":"enc:..."}, "sgk":{"u":"...","isyeri_kodu":"...","sistem_s":"enc:...","isyeri_s":"enc:..."}}

-- Indexler
CREATE INDEX IF NOT EXISTS idx_automation_settings_office ON automation_settings(office_id);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_office_client ON automation_jobs(office_id, client_id);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_status ON automation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_automation_documents_office_client ON automation_documents(office_id, client_id);
CREATE INDEX IF NOT EXISTS idx_automation_documents_type ON automation_documents(document_type);

-- ============================================================
-- RLS Politikalari
-- ============================================================

ALTER TABLE automation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS automation_settings_select ON automation_settings;
DROP POLICY IF EXISTS automation_settings_all ON automation_settings;
DROP POLICY IF EXISTS automation_jobs_select ON automation_jobs;
DROP POLICY IF EXISTS automation_jobs_all ON automation_jobs;
DROP POLICY IF EXISTS automation_documents_select ON automation_documents;
DROP POLICY IF EXISTS automation_documents_all ON automation_documents;

CREATE POLICY "automation_settings_select" ON automation_settings FOR SELECT USING (
  is_super_admin() OR office_id = my_office_id()
);
CREATE POLICY "automation_settings_all" ON automation_settings FOR ALL USING (
  is_super_admin() OR office_id = my_office_id()
);

CREATE POLICY "automation_jobs_select" ON automation_jobs FOR SELECT USING (
  is_super_admin() OR office_id = my_office_id()
);
CREATE POLICY "automation_jobs_all" ON automation_jobs FOR ALL USING (
  is_super_admin() OR office_id = my_office_id()
);

CREATE POLICY "automation_documents_select" ON automation_documents FOR SELECT USING (
  is_super_admin() OR office_id = my_office_id()
);
CREATE POLICY "automation_documents_all" ON automation_documents FOR ALL USING (
  is_super_admin() OR office_id = my_office_id()
);

-- Musteri rolune kendi belgelerini gosterme politikasi
CREATE POLICY "automation_documents_client" ON automation_documents FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM clients c
    WHERE c.id = automation_documents.client_id AND c.auth_user_id = auth.uid()
  )
);

-- ============================================================
-- Varsayilan ayar ekleme (mevcut ofisler icin)
-- ============================================================
INSERT INTO automation_settings (office_id, enabled, schedule_time, repeat_type)
SELECT id, true, '02:00', 'daily' FROM offices
ON CONFLICT (office_id) DO NOTHING;

-- Dogrulama sorgusu
SELECT 'automation_settings' AS tablo, COUNT(*) AS satir FROM automation_settings
UNION ALL
SELECT 'automation_jobs', COUNT(*) FROM automation_jobs
UNION ALL
SELECT 'automation_documents', COUNT(*) FROM automation_documents;
