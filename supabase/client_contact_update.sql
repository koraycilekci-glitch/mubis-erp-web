-- ============================================================
-- MUSTERI ILETISIM BILGILERI GUNCELLEME
-- phoneNumbers ve emails JSONB sutunlari ekleme
-- ============================================================

-- clients tablosuna phoneNumbers sutunu ekle (yoksa)
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS phoneNumbers JSONB DEFAULT '[]'::jsonb;

-- clients tablosuna emails sutunu ekle (yoksa)
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS emails JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN clients.phoneNumbers IS 'Musterinin birden fazla telefon/WhatsApp numarasi [{name, phone, isWhatsapp}]';
COMMENT ON COLUMN clients.emails IS 'Musterinin birden fazla e-posta adresi [{email}]';
