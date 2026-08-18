-- whatsapp_logs tablosu
CREATE TABLE IF NOT EXISTS whatsapp_logs (
  id BIGSERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  beyan_type TEXT,
  year INTEGER,
  month INTEGER,
  document_type TEXT,
  phone TEXT,
  email TEXT,
  channel TEXT DEFAULT 'whatsapp', -- whatsapp | email
  message_id TEXT,
  status TEXT,
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Eski tabloda channel kolonu yoksa ekle
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_logs' AND column_name = 'channel'
  ) THEN
    ALTER TABLE whatsapp_logs ADD COLUMN channel TEXT DEFAULT 'whatsapp';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_logs' AND column_name = 'email'
  ) THEN
    ALTER TABLE whatsapp_logs ADD COLUMN email TEXT;
  END IF;
END $$;

-- Storage bucket manuel olarak olusturulacak: client-documents
-- Supabase Dashboard > Storage > New Bucket > client-documents

-- RLS aktiflestir
ALTER TABLE whatsapp_logs ENABLE ROW LEVEL SECURITY;

-- Mevcut policeleri kontrol etmeden once var olanlari sil (idempotent)
DROP POLICY IF EXISTS whatsapp_logs_select_policy ON whatsapp_logs;
DROP POLICY IF EXISTS whatsapp_logs_insert_policy ON whatsapp_logs;

-- Yeni policeleri olustur
CREATE POLICY whatsapp_logs_select_policy
ON whatsapp_logs FOR SELECT
USING (true);

CREATE POLICY whatsapp_logs_insert_policy
ON whatsapp_logs FOR INSERT
WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
