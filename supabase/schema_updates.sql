-- clients tablosuna evrak JSONB alanı ekle
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS client_documents jsonb DEFAULT '{}';

-- app_settings tablosu (eger yoksa)
CREATE TABLE IF NOT EXISTS public.app_settings (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Evrak gorunurluk varsayilan degeri
INSERT INTO public.app_settings (key, value) VALUES ('client_document_permissions', '{
  "beyanname": {"kdv": true, "kdv2": true, "muhtasar": true, "sgk": true, "gecici_vergi": true, "kurumlar_vergi": true, "gelir_vergi": true, "edefter": true, "muhtasar_3aylik": true},
  "tahakkuk": {"kdv": true, "kdv2": true, "muhtasar": true, "sgk": true, "gecici_vergi": true, "kurumlar_vergi": true, "gelir_vergi": true, "edefter": true, "muhtasar_3aylik": true},
  "mizan": true,
  "sigorta_tahakkuk": true,
  "hizmet_listesi": true,
  "bordro": true,
  "gelir_beyani": true,
  "gecici_vergi": true,
  "vergi_levhasi": true,
  "mali_evraklar": true
}'::text) ON CONFLICT (key) DO NOTHING;

-- Evrak klasor yapisi varsayilan degeri
INSERT INTO public.app_settings (key, value) VALUES ('client_document_folders', '{
  "folders": [
    {
      "id": "mali_veriler",
      "name": "Mali Veriler",
      "children": [
        {
          "id": "gelir_beyani",
          "name": "Gelir Beyanı",
          "contents": [
            {"source": "gelir_beyani", "docType": "beyanname", "label": "Gelir/Kurumlar Vergi Beyanı"},
            {"source": "gelir_beyani", "docType": "tahakkuk", "label": "Tahakkuk"},
            {"source": "gelir_beyani", "docType": "mizan", "label": "Mizan"}
          ]
        },
        {
          "id": "gecici_vergi",
          "name": "Geçici Vergi",
          "contents": [
            {"source": "gecici_vergi", "docType": "beyanname", "label": "Geçici Vergi Beyanname"},
            {"source": "gecici_vergi", "docType": "tahakkuk", "label": "Tahakkuk"},
            {"source": "gecici_vergi", "docType": "mizan", "label": "Mizan"}
          ]
        },
        {
          "id": "vergi_levhasi",
          "name": "Vergi Levhası",
          "contents": [
            {"source": "vergi_levhasi", "label": "Vergi Levhası"}
          ]
        }
      ]
    },
    {
      "id": "mali_evraklar",
      "name": "Mali Evraklar",
      "children": [
        {"id": "imza_beyani", "name": "İmza Beyanı", "contents": [{"source": "mali_evraklar", "category": "imza_beyani", "label": "İmza Beyanı"}]},
        {"id": "gazete", "name": "Gazete", "contents": [{"source": "mali_evraklar", "category": "gazete", "label": "Gazete"}]},
        {"id": "kurulus", "name": "Kuruluş", "contents": [{"source": "mali_evraklar", "category": "kurulus", "label": "Kuruluş"}]},
        {"id": "diger", "name": "Diğer", "contents": [{"source": "mali_evraklar", "category": "diger", "label": "Diğer"}]},
        {"id": "bordro", "name": "Bordro", "contents": [{"source": "mali_evraklar", "category": "bordro", "label": "Bordro"}]},
        {"id": "hizmet_listesi", "name": "Hizmet Listesi", "contents": [{"source": "mali_evraklar", "category": "hizmet_listesi", "label": "Hizmet Listesi"}]},
        {"id": "sigorta_tahakkuk", "name": "Sigorta Tahakkuk", "contents": [{"source": "mali_evraklar", "category": "sigorta_tahakkuk", "label": "Sigorta Tahakkuk"}]}
      ]
    }
  ]
}'::text) ON CONFLICT (key) DO NOTHING;

-- whatsapp_logs tablosu
CREATE TABLE IF NOT EXISTS public.whatsapp_logs (
  id BIGSERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES public.clients(id) ON DELETE CASCADE,
  beyan_type TEXT,
  year INTEGER,
  month INTEGER,
  document_type TEXT,
  phone TEXT,
  email TEXT,
  channel TEXT,
  message_id TEXT,
  status TEXT,
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.whatsapp_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'whatsapp_logs' AND policyname = 'whatsapp_logs_select_policy'
  ) THEN
    CREATE POLICY whatsapp_logs_select_policy ON public.whatsapp_logs FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'whatsapp_logs' AND policyname = 'whatsapp_logs_insert_policy'
  ) THEN
    CREATE POLICY whatsapp_logs_insert_policy ON public.whatsapp_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- app_settings RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'app_settings' AND policyname = 'app_settings_select_policy'
  ) THEN
    CREATE POLICY app_settings_select_policy ON public.app_settings FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END $$;
