-- MUBIS Document Intelligence Engine - Database Schema

-- document_analysis tablosu
CREATE TABLE IF NOT EXISTS document_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL DEFAULT 'BILINMIYOR',
  document_subtype TEXT,
  storage_url TEXT NOT NULL,
  analysis_status TEXT NOT NULL DEFAULT 'bekliyor', -- bekliyor, analiz_ediliyor, tamamlandi, hata
  json_result JSONB,
  raw_text TEXT,
  error_message TEXT,
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_document_analysis_client_id ON document_analysis(client_id);
CREATE INDEX IF NOT EXISTS idx_document_analysis_document_type ON document_analysis(document_type);
CREATE INDEX IF NOT EXISTS idx_document_analysis_status ON document_analysis(analysis_status);
CREATE INDEX IF NOT EXISTS idx_document_analysis_created_at ON document_analysis(created_at);

-- RLS Politikaları
ALTER TABLE document_analysis ENABLE ROW LEVEL SECURITY;

-- Admin ve personel için tüm yetkiler
CREATE POLICY "document_analysis_admin_all" ON document_analysis
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'personel')
    )
  );

-- Müşteri için sadece kendi kayıtları
CREATE POLICY "document_analysis_client_select" ON document_analysis
  FOR SELECT
  TO authenticated
  USING (
    client_id = (
      SELECT clients.id FROM clients
      WHERE clients.auth_user_id = auth.uid()
      LIMIT 1
    )
  );

-- Trigger: updated_at otomatik güncelleme
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_document_analysis_updated_at
  BEFORE UPDATE ON document_analysis
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Analiz durumu enum tipi (opsiyonel)
-- CREATE TYPE document_analysis_status AS ENUM ('bekliyor', 'analiz_ediliyor', 'tamamlandi', 'hata');

-- Örnek veri ekleme (test için)
-- INSERT INTO document_analysis (client_id, document_type, storage_url, analysis_status, json_result)
-- VALUES (1, 'TAHAKKUK', 'https://.../test.pdf', 'tamamlandi', '{"amount": 12540.32}');