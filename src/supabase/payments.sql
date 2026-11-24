-- =====================================================
-- Payments (odemeler) tablosu
-- =====================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id BIGSERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES public.clients(id) ON DELETE SET NULL,
  office_id INTEGER,
  tutar NUMERIC(15,2) NOT NULL DEFAULT 0,
  odeme_tipi TEXT DEFAULT 'kredi_karti', -- kredi_karti, eft, nakit
  odeme_kanali TEXT DEFAULT 'paytr',      -- paytr, odeal, manual
  durum TEXT DEFAULT 'bekliyor',          -- bekliyor, onaylandi, reddedildi
  makbuz_url TEXT,
  red_sebebi TEXT,
  aciklama TEXT,
  donem TEXT,
  gateway_ref TEXT,
  odeme_tarihi DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Eski tablolara yeni kolonlari ekle (idempotent)
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS office_id INTEGER;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS odeme_kanali TEXT DEFAULT 'paytr';
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS durum TEXT DEFAULT 'bekliyor';
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS makbuz_url TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS red_sebebi TEXT;

-- Mevcut kayitlar gecmis odemelerdir; onaylandi kabul edilir.
-- (Online odemeler gateway_ref tasir; manuel/eski kayitlarin hepsi onaylandi olur)
UPDATE public.payments SET durum = 'onaylandi' WHERE gateway_ref IS NULL;
UPDATE public.payments SET durum = 'onaylandi' WHERE durum IS NULL;

-- Indeksler
CREATE INDEX IF NOT EXISTS idx_payments_client_id ON public.payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_office_id ON public.payments(office_id);
CREATE INDEX IF NOT EXISTS idx_payments_gateway_ref ON public.payments(gateway_ref);
CREATE INDEX IF NOT EXISTS idx_payments_durum ON public.payments(durum);
CREATE INDEX IF NOT EXISTS idx_payments_client_id_durum ON public.payments(client_id, durum);

-- RLS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payments' AND policyname = 'payments_superadmin_all'
  ) THEN
    CREATE POLICY payments_superadmin_all
    ON public.payments FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payments' AND policyname = 'payments_office_all'
  ) THEN
    CREATE POLICY payments_office_all
    ON public.payments FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('admin', 'personel')
          AND (p.office_id = public.payments.office_id OR public.payments.office_id IS NULL)
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('admin', 'personel')
          AND (p.office_id = public.payments.office_id OR public.payments.office_id IS NULL)
      )
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payments' AND policyname = 'payments_client_select'
  ) THEN
    CREATE POLICY payments_client_select
    ON public.payments FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = public.payments.client_id AND c.auth_user_id = auth.uid()
      )
    );
  END IF;
END
$$;

-- Trigger: office_id otomatik doldur (client uzerinden)
CREATE OR REPLACE FUNCTION public.set_payments_office_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.office_id IS NULL AND NEW.client_id IS NOT NULL THEN
    SELECT office_id INTO NEW.office_id FROM public.clients WHERE id = NEW.client_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_payments_office_id ON public.payments;
CREATE TRIGGER trg_set_payments_office_id
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_payments_office_id();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
