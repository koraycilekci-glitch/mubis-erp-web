-- Google Drive belge referanslari
-- Amac: Dosyalarin kendisi Google Drive'da tutulur; Supabase'de yalnizca
-- kimlik/adi/yolu ve baglanti bilgisi saklanir.
--
-- Not: Mevcut Supabase Storage dosyalari SILINMEZ. Gecis tamamlanip
-- dogrulanana kadar her iki kaynak birlikte calisir.

CREATE TABLE IF NOT EXISTS drive_belgeler (
  id BIGSERIAL PRIMARY KEY,
  drive_file_id TEXT NOT NULL UNIQUE,
  dosya_adi TEXT NOT NULL,
  mime_type TEXT,
  boyut BIGINT DEFAULT 0,
  client_id BIGINT,
  belge_turu TEXT DEFAULT 'genel',   -- genel | beyanname | tahakkuk | fatura | edefter | z_raporu | gider_fisi | muhasebe
  yol TEXT DEFAULT '',               -- musteri/yil/ay/GELEN gibi Drive klasor yolu
  drive_link TEXT DEFAULT '',
  sha1 TEXT DEFAULT '',
  durum TEXT DEFAULT 'aktif',        -- aktif | arsiv
  kaynak TEXT DEFAULT 'drive',       -- drive | supabase-storage (gecis donemi)
  eski_storage_path TEXT,            -- Supabase Storage'dan tasinanlar icin iz
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS drive_belgeler_client_idx ON drive_belgeler (client_id);
CREATE INDEX IF NOT EXISTS drive_belgeler_tur_idx ON drive_belgeler (belge_turu);
CREATE INDEX IF NOT EXISTS drive_belgeler_yol_idx ON drive_belgeler (yol);
CREATE INDEX IF NOT EXISTS drive_belgeler_durum_idx ON drive_belgeler (durum);

-- Mevcut borc_sonuclari tablosuna Drive referans alanlari
ALTER TABLE borc_sonuclari ADD COLUMN IF NOT EXISTS drive_file_id TEXT;
ALTER TABLE borc_sonuclari ADD COLUMN IF NOT EXISTS google_drive_link TEXT;
ALTER TABLE borc_sonuclari ADD COLUMN IF NOT EXISTS drive_status TEXT DEFAULT 'active';

-- RLS: ofis bazli erisim varsayilan olarak servis anahtariyla yapilir.
-- (Uygulama service role ile yaziyor; okuma istemciden yapilacaksa politika ekleyin.)
ALTER TABLE drive_belgeler ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'drive_belgeler' AND policyname = 'drive_belgeler_select_authenticated'
  ) THEN
    CREATE POLICY drive_belgeler_select_authenticated ON drive_belgeler
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
