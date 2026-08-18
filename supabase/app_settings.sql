-- Uygulama ayarlari tablosu (mali musavir tarafindan yonetilir)
CREATE TABLE IF NOT EXISTS app_settings (
  id BIGSERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_settings_select_policy ON app_settings;
DROP POLICY IF EXISTS app_settings_insert_policy ON app_settings;
DROP POLICY IF EXISTS app_settings_update_policy ON app_settings;

CREATE POLICY app_settings_select_policy
ON app_settings FOR SELECT
USING (true);

CREATE POLICY app_settings_insert_policy
ON app_settings FOR INSERT
WITH CHECK (true);

CREATE POLICY app_settings_update_policy
ON app_settings FOR UPDATE
USING (true);

-- Varsayilan degerler (bos olarak)
INSERT INTO app_settings (key, value) VALUES
  ('whatsapp_phone_number_id', ''),
  ('whatsapp_access_token', ''),
  ('whatsapp_template_name', 'beyanname_bildirim'),
  ('smtp_host', ''),
  ('smtp_port', '587'),
  ('smtp_user', ''),
  ('smtp_pass', ''),
  ('smtp_from', ''),
  ('smtp_secure', 'false'),
  ('client_document_permissions', '{"beyanname":{"kdv":true,"kdv2":true,"muhtasar":true,"sgk":true,"gecici_vergi":true,"kurumlar_vergi":true,"gelir_vergi":true,"edefter":true,"muhtasar_3aylik":true},"tahakkuk":{"kdv":true,"kdv2":true,"muhtasar":true,"sgk":true,"gecici_vergi":true,"kurumlar_vergi":true,"gelir_vergi":true,"edefter":true,"muhtasar_3aylik":true},"mizan":true,"sigorta_tahakkuk":true,"hizmet_listesi":true,"bordro":true}')
ON CONFLICT (key) DO NOTHING;

-- Eski EmailJS ayarlarini temizle (artik kullanilmiyor)
DELETE FROM app_settings WHERE key IN ('emailjs_public_key', 'emailjs_service_id', 'emailjs_template_id', 'default_sender_email', 'default_send_channel');

NOTIFY pgrst, 'reload schema';
