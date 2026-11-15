-- MUBiS Lisans Sistemi
-- Model: Dış ofisler lisanslıdır; kendi ofis (LISANS_MUAF_OFFICES, varsayılan 1) muaf.
-- Yeni ofis ilk girişte 30 gün otomatik deneme alır. Süre bitince API 402 döner.
--
-- Planlar: deneme | aylik | yillik | kalici
-- Durumlar: aktif | iptal

CREATE TABLE IF NOT EXISTS lisanslar (
  id BIGSERIAL PRIMARY KEY,
  lisans_kodu TEXT NOT NULL UNIQUE,          -- imzali kod: MUBLIC1.<payload>.<imza>
  office_id BIGINT NOT NULL,
  cihaz_id TEXT,                             -- ilk aktivasyon cihazi (denetim icin; web'de ofis bagimli)
  plan TEXT NOT NULL DEFAULT 'yillik',       -- deneme | aylik | yillik | kalici
  baslangic TIMESTAMPTZ DEFAULT NOW(),
  bitis TIMESTAMPTZ,                         -- kalici icin NULL
  durum TEXT NOT NULL DEFAULT 'aktif',       -- aktif | iptal
  talep_kodu TEXT,
  notlar TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS lisanslar_office_plan_idx ON lisanslar (office_id, plan);
CREATE INDEX IF NOT EXISTS lisanslar_office_idx ON lisanslar (office_id);

CREATE TABLE IF NOT EXISTS lisans_deneme (
  id BIGSERIAL PRIMARY KEY,
  office_id BIGINT NOT NULL UNIQUE,
  ilk_giris TIMESTAMPTZ DEFAULT NOW(),
  deneme_bitis TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE lisanslar ENABLE ROW LEVEL SECURITY;
ALTER TABLE lisans_deneme ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lisanslar' AND policyname = 'lisanslar_select_authenticated') THEN
    CREATE POLICY lisanslar_select_authenticated ON lisanslar
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lisans_deneme' AND policyname = 'lisans_deneme_select_authenticated') THEN
    CREATE POLICY lisans_deneme_select_authenticated ON lisans_deneme
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
