-- =====================================================
-- Coklu ofis / coklu kullanici cekirdek RLS
-- Master admin (super_admin) tum verileri gorur;
-- her ofis admini yalnizca kendi ofisinin verilerini gorur.
-- Idempotent: tekrar tekrar calistirilabilir.
-- =====================================================

-- Mevcut policy'leri listelemek icin denetim sorgusu ( yorum ):
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE schemaname = 'public' AND tablename IN ('clients','profiles','offices','client_messages','notifications');

-- ---------------------------------------------------------------
-- CLIENTS
-- ---------------------------------------------------------------
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- super_admin her seyi gorur / yonetir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clients' AND policyname = 'clients_superadmin_all'
  ) THEN
    CREATE POLICY clients_superadmin_all
    ON public.clients FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'super_admin'
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'super_admin'
      )
    );
  END IF;
END
$$;

-- admin / personel: yalnizca kendi ofisinin musterileri
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clients' AND policyname = 'clients_office_all'
  ) THEN
    CREATE POLICY clients_office_all
    ON public.clients FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('admin', 'personel')
          AND p.office_id = public.clients.office_id
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('admin', 'personel')
          AND p.office_id = public.clients.office_id
      )
    );
  END IF;
END
$$;

-- musteri: yalnizca kendi kaydini gorur
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clients' AND policyname = 'clients_self_select'
  ) THEN
    CREATE POLICY clients_self_select
    ON public.clients FOR SELECT
    USING (auth_user_id = auth.uid());
  END IF;
END
$$;

-- ---------------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Herkes kendi profilini gorur
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_self_select'
  ) THEN
    CREATE POLICY profiles_self_select
    ON public.profiles FOR SELECT
    USING (id = auth.uid());
  END IF;
END
$$;

-- Ayni ofisteki kullanicilar birbirini gorur (ofis kullanici listesi icin)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_office_select'
  ) THEN
    CREATE POLICY profiles_office_select
    ON public.profiles FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.office_id = public.profiles.office_id
      )
    );
  END IF;
END
$$;

-- super_admin tum profilleri gorur
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_superadmin_select'
  ) THEN
    CREATE POLICY profiles_superadmin_select
    ON public.profiles FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'super_admin'
      )
    );
  END IF;
END
$$;

-- Kullanici kendi profilini guncelleyebilir (temp_password temizleme vb.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_self_update'
  ) THEN
    CREATE POLICY profiles_self_update
    ON public.profiles FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());
  END IF;
END
$$;

-- super_admin profilleri yonetir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_superadmin_all'
  ) THEN
    CREATE POLICY profiles_superadmin_all
    ON public.profiles FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'super_admin'
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'super_admin'
      )
    );
  END IF;
END
$$;

-- ---------------------------------------------------------------
-- OFFICES
-- ---------------------------------------------------------------
ALTER TABLE public.offices ENABLE ROW LEVEL SECURITY;

-- Uye oldugu ofisi gorur
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'offices' AND policyname = 'offices_member_select'
  ) THEN
    CREATE POLICY offices_member_select
    ON public.offices FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.office_id = public.offices.id
      )
    );
  END IF;
END
$$;

-- super_admin tum ofisleri gorur ve yonetir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'offices' AND policyname = 'offices_superadmin_all'
  ) THEN
    CREATE POLICY offices_superadmin_all
    ON public.offices FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'super_admin'
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'super_admin'
      )
    );
  END IF;
END
$$;

-- ---------------------------------------------------------------
-- CLIENT_MESSAGES (mesajlarim)
-- Not: tablo id / client_id / sender kolonlariyla varsayilir.
-- ---------------------------------------------------------------

-- Tablo yoksa bu bolum hata vermez; tablo varsa policy'ler eklenir.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'client_messages'
  ) THEN
    -- RLS acik degilse ac
    EXECUTE 'ALTER TABLE public.client_messages ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'client_messages' AND policyname = 'client_messages_office_all'
    ) THEN
      CREATE POLICY client_messages_office_all
      ON public.client_messages FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.clients c
          JOIN public.profiles p ON p.id = auth.uid()
          WHERE c.id = public.client_messages.client_id
            AND p.office_id = c.office_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.clients c
          JOIN public.profiles p ON p.id = auth.uid()
          WHERE c.id = public.client_messages.client_id
            AND p.office_id = c.office_id
        )
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'client_messages' AND policyname = 'client_messages_self_all'
    ) THEN
      CREATE POLICY client_messages_self_all
      ON public.client_messages FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = public.client_messages.client_id
            AND c.auth_user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = public.client_messages.client_id
            AND c.auth_user_id = auth.uid()
        )
      );
    END IF;
  END IF;
END
$$;

-- ---------------------------------------------------------------
-- NOTIFICATIONS: admin policy'sini ofis bazli hale getir
-- (mevcut genis policy degistirilir; herkese-acik servis
--  policy'si kaldirilir - service key RLS'i zaten atlar)
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS notifications_service_all ON public.notifications;

DROP POLICY IF EXISTS notifications_admin_select ON public.notifications;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'notifications_admin_select'
  ) THEN
    CREATE POLICY notifications_admin_select
    ON public.notifications FOR SELECT
    USING (
      audience = 'admin' AND (
        client_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.clients c
          JOIN public.profiles p ON p.id = auth.uid()
          WHERE c.id = public.notifications.client_id
            AND (p.office_id = c.office_id OR p.role = 'super_admin')
        )
      )
    );
  END IF;
END
$$;
