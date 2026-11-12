-- efatura_faturalar tablosu duzeltmesi
-- Hata: "invalid input syntax for type uuid: 1784"
-- Sebep: client_id kolonu uuid tipindeydi ama kod client.id (INTEGER) yaziyor.
-- Tablo bostan (0 kayit), kolon tipi degistirmek yerine tablo yeniden kurulur.
-- clients.id INTEGER oldugu icin client_id INTEGER REFERENCES clients(id) yapilir.

DROP TABLE IF EXISTS public.efatura_faturalar CASCADE;

CREATE TABLE public.efatura_faturalar (
  id BIGSERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  yon TEXT NOT NULL DEFAULT 'gelen',        -- gelen (alis) | giden (satis)
  tur TEXT NOT NULL DEFAULT 'efatura',      -- efatura | earsiv | esmm | utts
  fatura_turu TEXT DEFAULT '',              -- SATIS | IADE | TEVKIFAT ...
  fatura_uuid TEXT NOT NULL,
  fatura_no TEXT DEFAULT '',
  tarih DATE,
  karsi_vkn TEXT DEFAULT '',
  karsi_unvan TEXT DEFAULT '',
  tutar NUMERIC,
  matrah NUMERIC,
  kdv NUMERIC,
  para_birimi TEXT DEFAULT 'TRY',
  pdf_url TEXT DEFAULT '',
  xml_url TEXT DEFAULT '',
  html_url TEXT DEFAULT '',
  sorgu_ts TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, yon, tur, fatura_uuid)
);

ALTER TABLE public.efatura_faturalar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS efatura_faturalar_select_policy ON public.efatura_faturalar;
DROP POLICY IF EXISTS efatura_faturalar_insert_policy ON public.efatura_faturalar;
DROP POLICY IF EXISTS efatura_faturalar_update_policy ON public.efatura_faturalar;
DROP POLICY IF EXISTS efatura_faturalar_delete_policy ON public.efatura_faturalar;

CREATE POLICY efatura_faturalar_select_policy
ON public.efatura_faturalar FOR SELECT
USING (true);

CREATE POLICY efatura_faturalar_insert_policy
ON public.efatura_faturalar FOR INSERT
WITH CHECK (true);

CREATE POLICY efatura_faturalar_update_policy
ON public.efatura_faturalar FOR UPDATE
USING (true);

CREATE POLICY efatura_faturalar_delete_policy
ON public.efatura_faturalar FOR DELETE
USING (true);

CREATE INDEX IF NOT EXISTS efatura_faturalar_client_idx ON public.efatura_faturalar(client_id);
CREATE INDEX IF NOT EXISTS efatura_faturalar_tarih_idx ON public.efatura_faturalar(tarih DESC);

NOTIFY pgrst, 'reload schema';
