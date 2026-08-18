-- app_settings tablosu (eger yoksa)
CREATE TABLE IF NOT EXISTS public.app_settings (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Varsayilan evrak klasor yapisi
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
            { "source": "gelir_beyani", "docType": "beyanname", "label": "Gelir/Kurumlar Vergi Beyanı" },
            { "source": "gelir_beyani", "docType": "tahakkuk", "label": "Tahakkuk" },
            { "source": "gelir_beyani", "docType": "mizan", "label": "Mizan" }
          ]
        },
        {
          "id": "gecici_vergi",
          "name": "Geçici Vergi",
          "contents": [
            { "source": "gecici_vergi", "docType": "beyanname", "label": "Geçici Vergi Beyanname" },
            { "source": "gecici_vergi", "docType": "tahakkuk", "label": "Tahakkuk" },
            { "source": "gecici_vergi", "docType": "mizan", "label": "Mizan" }
          ]
        },
        {
          "id": "vergi_levhasi",
          "name": "Vergi Levhası",
          "contents": [
            { "source": "vergi_levhasi", "label": "Vergi Levhası" }
          ]
        }
      ]
    },
    {
      "id": "mali_evraklar",
      "name": "Mali Evraklar",
      "children": [
        { "id": "imza_beyani", "name": "İmza Beyanı", "contents": [{ "source": "mali_evraklar", "category": "imza_beyani", "label": "İmza Beyanı" }] },
        { "id": "gazete", "name": "Gazete", "contents": [{ "source": "mali_evraklar", "category": "gazete", "label": "Gazete" }] },
        { "id": "kurulus", "name": "Kuruluş", "contents": [{ "source": "mali_evraklar", "category": "kurulus", "label": "Kuruluş" }] },
        { "id": "diger", "name": "Diğer", "contents": [{ "source": "mali_evraklar", "category": "diger", "label": "Diğer" }] },
        { "id": "bordro", "name": "Bordro", "contents": [{ "source": "mali_evraklar", "category": "bordro", "label": "Bordro" }] },
        { "id": "hizmet_listesi", "name": "Hizmet Listesi", "contents": [{ "source": "mali_evraklar", "category": "hizmet_listesi", "label": "Hizmet Listesi" }] },
        { "id": "sigorta_tahakkuk", "name": "Sigorta Tahakkuk", "contents": [{ "source": "mali_evraklar", "category": "sigorta_tahakkuk", "label": "Sigorta Tahakkuk" }] }
      ]
    }
  ]
}'::text) ON CONFLICT (key) DO NOTHING;
