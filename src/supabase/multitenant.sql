-- =====================================================
-- Kira yenileme takip ve admin onay akisi
-- =====================================================

-- Kira yenileme tablosu
CREATE TABLE IF NOT EXISTS public.kira_yenileme (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id integer NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  office_id integer NOT NULL,
  sahip_index integer NOT NULL DEFAULT 0,
  eski_net_kira numeric(15,2),
  eski_brut_kira numeric(15,2),
  yeni_net_kira numeric(15,2),
  bitis_tarihi date,
  durum text NOT NULL DEFAULT 'bekliyor'
    CHECK (durum IN ('bekliyor','musteri_cevaplandi','onaylandi','uzatildi','reddedildi','ertelendi')),
  artis_yok boolean NOT NULL DEFAULT false,
  hatirlatma_7gun timestamptz,
  hatirlatma_1gun timestamptz,
  erteleme_gunu integer,
  erteleme_tarihi date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexler
CREATE INDEX IF NOT EXISTS idx_kira_yenileme_client ON public.kira_yenileme(client_id);
CREATE INDEX IF NOT EXISTS idx_kira_yenileme_office ON public.kira_yenileme(office_id);
CREATE INDEX IF NOT EXISTS idx_kira_yenileme_durum ON public.kira_yenileme(durum);

-- Ileriye donuk idempotent kolon ekleme (varsa hata vermemesi icin DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'kira_yenileme' AND column_name = 'erteleme_gunu'
  ) THEN
    ALTER TABLE public.kira_yenileme ADD COLUMN erteleme_gunu integer;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'kira_yenileme' AND column_name = 'erteleme_tarihi'
  ) THEN
    ALTER TABLE public.kira_yenileme ADD COLUMN erteleme_tarihi date;
  END IF;
END
$$;

-- updated_at trigger fonksiyonu (paylasmali)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger (varsa atla)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_kira_yenileme_updated_at'
      AND tgrelid = 'public.kira_yenileme'::regclass
  ) THEN
    CREATE TRIGGER trg_kira_yenileme_updated_at
    BEFORE UPDATE ON public.kira_yenileme
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END
$$;

-- RLS aktiflestir
ALTER TABLE public.kira_yenileme ENABLE ROW LEVEL SECURITY;

-- Ayni ofisteki kullanicilar tum kayitlari gorebilir (admin/service)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'kira_yenileme' AND policyname = 'kira_yenileme_office_all'
  ) THEN
    CREATE POLICY kira_yenileme_office_all
    ON public.kira_yenileme FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.office_id = public.kira_yenileme.office_id
      )
    );
  END IF;
END
$$;

-- Portal kullanicisi sadece kendi client_id'sine ait kayitlari gorebilir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'kira_yenileme' AND policyname = 'kira_yenileme_client_select'
  ) THEN
    CREATE POLICY kira_yenileme_client_select
    ON public.kira_yenileme FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = public.kira_yenileme.client_id
          AND c.auth_user_id = auth.uid()
      )
    );
  END IF;
END
$$;

-- Notifications tablosu yoksa olustur (hatirlatma bildirimleri icin)
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id integer,
  user_id uuid,
  type text,
  title text,
  message text,
  route text,
  metadata jsonb DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  okundu boolean NOT NULL DEFAULT false,
  audience text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_office ON public.notifications(client_id);
CREATE INDEX IF NOT EXISTS idx_notifications_client ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(is_read);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'notifications_admin_select'
  ) THEN
    CREATE POLICY notifications_admin_select
    ON public.notifications FOR SELECT
    USING (audience = 'admin');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'notifications_client_select'
  ) THEN
    CREATE POLICY notifications_client_select
    ON public.notifications FOR SELECT
    USING (
      audience = 'client' AND (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = public.notifications.client_id
            AND c.auth_user_id = auth.uid()
        )
      )
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'notifications_service_all'
  ) THEN
    CREATE POLICY notifications_service_all
    ON public.notifications FOR ALL
    USING (true)
    WITH CHECK (true);
  END IF;
END
$$;
