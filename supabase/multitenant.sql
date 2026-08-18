-- ============================================================
-- MUBIS ERP - COK OFISLI (MULTI-TENANT) YAPIYA GECIS
-- ============================================================
-- Bu dosya idempotenttir: birden fazla kez calistirilabilir.
--
-- ONEMLI: Calistirmadan once Supabase panelinden veritabani
-- yedegi (backup) aliniz.
--
-- Calistirma sirasi:
--   1) Bu dosya (multitenant.sql)
--   2) Kontrol sorgulari (dosya sonunda)
-- ============================================================


-- ============================================================
-- BOLUM 1 : OFFICES TABLOSU
-- ============================================================

CREATE TABLE IF NOT EXISTS offices (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,              -- 'mubis' : musteri giris onegi
  name TEXT NOT NULL,                     -- 'MUBIS Mali Musavirlik'
  owner_id UUID,                          -- ofis adminin profiles.id degeri
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  valid_until DATE,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE offices IS 'Sistemi kullanan mali musavirlik ofisleri (tenant)';
COMMENT ON COLUMN offices.code IS 'Musteri giris adi onegi: kod-vkn@mubis.app';

-- Ana ofis (mevcut veriler buraya atanir)
INSERT INTO offices (id, code, name, is_active)
VALUES (1, 'mubis', 'MUBiS Mali Musavirlik', true)
ON CONFLICT (id) DO NOTHING;

-- BIGSERIAL sayacini ileri al ki sonraki ofis id=2 olsun
SELECT setval('offices_id_seq', GREATEST((SELECT COALESCE(MAX(id), 1) FROM offices), 1));


-- ============================================================
-- BOLUM 2 : office_id KOLONLARI
-- ============================================================
-- Dogrudan ofise bagli tablolar. Diger tablolar (beyan_status,
-- payments, documents vb.) clients uzerinden baglanir; kolon eklenmez.
-- Olmayan tablolar sessizce atlanir.

DO $$
DECLARE
  t     TEXT;
  liste TEXT[] := ARRAY['profiles','clients','app_settings','announcements'];
BEGIN
  FOREACH t IN ARRAY liste LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Atlandi (tablo yok): %', t;
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS office_id BIGINT REFERENCES offices(id) ON DELETE SET NULL',
      t
    );
    EXECUTE format('UPDATE public.%I SET office_id = 1 WHERE office_id IS NULL', t);
    RAISE NOTICE 'office_id eklendi: %', t;
  END LOOP;
END $$;

-- clients.auth_user_id garanti altina al (musteri giris eslesmesi)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS auth_user_id UUID;

-- Ana ofisin sahibini ilk admin olarak isaretle
UPDATE offices SET owner_id = (
  SELECT id FROM profiles WHERE role IN ('admin', 'super_admin') ORDER BY created_at LIMIT 1
) WHERE id = 1 AND owner_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_office ON profiles(office_id);
CREATE INDEX IF NOT EXISTS idx_clients_office  ON clients(office_id);
CREATE INDEX IF NOT EXISTS idx_clients_auth_user ON clients(auth_user_id);


-- ------------------------------------------------------------
-- KRITIK : clients.auth_user_id doldurulmasi
-- ------------------------------------------------------------
-- Musteri erisimi artik auth_user_id uzerinden calisiyor.
-- Bos kalirsa musteri kendi verisini goremez. Mevcut kayitlari
-- auth.users tablosundaki e-posta ile eslestirip dolduruyoruz.
-- Olmayan kolonlar atlanir.

DO $$
DECLARE
  k     TEXT;
  liste TEXT[] := ARRAY['username','vkn','tc'];
BEGIN
  -- <kolon>@mubis.app eslesmesi
  FOREACH k IN ARRAY liste LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = k
    ) THEN
      RAISE NOTICE 'Atlandi (kolon yok): clients.%', k;
      CONTINUE;
    END IF;

    EXECUTE format(
      'UPDATE clients c SET auth_user_id = u.id FROM auth.users u '
      'WHERE c.auth_user_id IS NULL AND c.%I IS NOT NULL AND c.%I <> '''' '
      'AND lower(u.email) = lower(c.%I || ''@mubis.app'')',
      k, k, k
    );
  END LOOP;

  -- Musterinin gercek e-postasi ile eslesme (son care)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'email'
  ) THEN
    UPDATE clients c SET auth_user_id = u.id
    FROM auth.users u
    WHERE c.auth_user_id IS NULL
      AND c.email IS NOT NULL AND c.email <> ''
      AND lower(u.email) = lower(c.email);
  END IF;
END $$;

-- Musteri profillerini de ana ofise bagla
UPDATE profiles p
SET office_id = c.office_id
FROM clients c
WHERE c.auth_user_id = p.id AND p.office_id IS DISTINCT FROM c.office_id;


-- ============================================================
-- BOLUM 3 : ROL - super_admin
-- ============================================================
-- profiles.role CHECK kisitini genislet.
-- NOT: Uygulama musteri rolunu bazi yerlerde 'client', bazi
-- yerlerde 'musteri' olarak yaziyor. Ikisi de kabul edilir.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'profiles'::regclass AND contype = 'c' AND conname LIKE '%role%'
  ) LOOP
    EXECUTE format('ALTER TABLE profiles DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'admin', 'personel', 'client', 'musteri'));


-- ============================================================
-- BOLUM 4 : app_settings OFIS BAZLI BENZERSIZLIK
-- ============================================================
-- Eski: key UNIQUE  ->  Yeni: (office_id, key) UNIQUE

DO $$
DECLARE r RECORD;
BEGIN
  IF to_regclass('public.app_settings') IS NULL THEN
    RAISE NOTICE 'Atlandi: app_settings tablosu yok';
    RETURN;
  END IF;

  -- Eski UNIQUE kisitlarini kaldir
  FOR r IN (
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'app_settings'::regclass AND contype = 'u'
  ) LOOP
    EXECUTE format('ALTER TABLE app_settings DROP CONSTRAINT %I', r.conname);
  END LOOP;

  -- Ayni (office_id, key) icin mukerrer satir varsa en yenisini birak
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'app_settings' AND column_name = 'id'
  ) THEN
    DELETE FROM app_settings a USING app_settings b
    WHERE a.office_id IS NOT DISTINCT FROM b.office_id
      AND a.key = b.key
      AND a.id < b.id;
  END IF;

  ALTER TABLE app_settings ADD CONSTRAINT app_settings_office_key_unique UNIQUE (office_id, key);
END $$;


-- ============================================================
-- BOLUM 5 : YARDIMCI FONKSIYONLAR
-- ============================================================
-- SECURITY DEFINER : RLS icinde cagrilirken sonsuz donguyu onler
-- STABLE           : ayni sorgu icinde tekrar tekrar hesaplanmaz

CREATE OR REPLACE FUNCTION my_office_id()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT office_id FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;

-- Ofis personeli mi? (super_admin / admin / personel)
CREATE OR REPLACE FUNCTION is_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'personel')
  );
$$;

-- Giris yapan musterinin clients.id degeri (personel ise NULL)
CREATE OR REPLACE FUNCTION my_client_id()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM clients WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- Verilen musteri kaydina erisim hakki var mi?
CREATE OR REPLACE FUNCTION can_access_client(p_client_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = p_client_id
        AND (
          (is_staff() AND c.office_id = my_office_id())
          OR c.auth_user_id = auth.uid()
        )
    );
$$;

GRANT EXECUTE ON FUNCTION my_office_id()             TO authenticated;
GRANT EXECUTE ON FUNCTION my_role()                  TO authenticated;
GRANT EXECUTE ON FUNCTION is_super_admin()           TO authenticated;
GRANT EXECUTE ON FUNCTION is_staff()                 TO authenticated;
GRANT EXECUTE ON FUNCTION my_client_id()             TO authenticated;
GRANT EXECUTE ON FUNCTION can_access_client(BIGINT)  TO authenticated;


-- ============================================================
-- BOLUM 6 : ESKI POLITIKALARI TEMIZLE
-- ============================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'offices','profiles','clients','beyan_status','partners','banks','documents',
        'client_notes','ai_data','app_settings','announcements','announcement_recipients',
        'debt_notifications','client_messages','notifications','accounting_fees','payments',
        'employees','leave_records','account_plans','parameters','calculations',
        'expense_documents','expense_lines','z_reports','z_report_lines','accounting_entries',
        'whatsapp_logs'
      )
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;


-- ============================================================
-- BOLUM 7 : RLS - OFIS BAZLI POLITIKALAR
-- ============================================================

ALTER TABLE offices ENABLE ROW LEVEL SECURITY;

-- offices : herkes kendi ofisini gorur, super_admin hepsini
CREATE POLICY offices_select ON offices FOR SELECT TO authenticated
  USING (is_super_admin() OR id = my_office_id());
CREATE POLICY offices_insert ON offices FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());
CREATE POLICY offices_update ON offices FOR UPDATE TO authenticated
  USING (is_super_admin() OR (id = my_office_id() AND my_role() = 'admin'));
CREATE POLICY offices_delete ON offices FOR DELETE TO authenticated
  USING (is_super_admin());


-- ---------- profiles ----------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR is_super_admin()
    OR (is_staff() AND office_id = my_office_id())
  );
-- INSERT: trigger (handle_new_user) SECURITY DEFINER ile calistigi icin serbest
CREATE POLICY profiles_insert ON profiles FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY profiles_update ON profiles FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR is_super_admin()
    OR (my_role() = 'admin' AND office_id = my_office_id())
  );
CREATE POLICY profiles_delete ON profiles FOR DELETE TO authenticated
  USING (is_super_admin() OR (my_role() = 'admin' AND office_id = my_office_id()));


-- ---------- clients ----------
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY clients_select ON clients FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR (is_staff() AND office_id = my_office_id())
    OR auth_user_id = auth.uid()
  );
CREATE POLICY clients_insert ON clients FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR (is_staff() AND office_id = my_office_id()));
CREATE POLICY clients_update ON clients FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR (is_staff() AND office_id = my_office_id())
    OR auth_user_id = auth.uid()
  );
CREATE POLICY clients_delete ON clients FOR DELETE TO authenticated
  USING (is_super_admin() OR (my_role() = 'admin' AND office_id = my_office_id()));


-- ---------- clients uzerinden baglanan tablolar ----------
-- Ortak desen: can_access_client(client_id)
-- Tablo veya client_id kolonu yoksa sessizce atlanir; boylece
-- surumler arasi sema farklari script'i durdurmaz.

DO $$
DECLARE
  t    TEXT;
  liste TEXT[] := ARRAY[
    'beyan_status','partners','banks','documents','client_notes','ai_data',
    'accounting_fees','payments','employees','leave_records','account_plans',
    'notifications','z_reports','accounting_entries','expense_documents',
    'announcement_recipients','debt_notifications','whatsapp_logs'
  ];
BEGIN
  FOREACH t IN ARRAY liste LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Atlandi (tablo yok): %', t;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'client_id'
    ) THEN
      RAISE NOTICE 'Atlandi (client_id kolonu yok): %', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (can_access_client(client_id)) '
      'WITH CHECK (can_access_client(client_id))',
      t || '_all', t
    );
    RAISE NOTICE 'Politika kuruldu: %', t;
  END LOOP;
END $$;


-- ---------- alt kayit tablolari (ust tablo uzerinden) ----------

DO $$
BEGIN
  IF to_regclass('public.z_report_lines') IS NOT NULL
     AND to_regclass('public.z_reports') IS NOT NULL THEN
    ALTER TABLE z_report_lines ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS z_report_lines_all ON z_report_lines;
    CREATE POLICY z_report_lines_all ON z_report_lines FOR ALL TO authenticated
      USING (EXISTS (
        SELECT 1 FROM z_reports z
        WHERE z.id = z_report_lines.z_report_id AND can_access_client(z.client_id)
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM z_reports z
        WHERE z.id = z_report_lines.z_report_id AND can_access_client(z.client_id)
      ));
  ELSE
    RAISE NOTICE 'Atlandi: z_report_lines';
  END IF;

  IF to_regclass('public.expense_lines') IS NOT NULL
     AND to_regclass('public.expense_documents') IS NOT NULL THEN
    ALTER TABLE expense_lines ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS expense_lines_all ON expense_lines;
    CREATE POLICY expense_lines_all ON expense_lines FOR ALL TO authenticated
      USING (EXISTS (
        SELECT 1 FROM expense_documents e
        WHERE e.id = expense_lines.expense_document_id AND can_access_client(e.client_id)
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM expense_documents e
        WHERE e.id = expense_lines.expense_document_id AND can_access_client(e.client_id)
      ));
  ELSE
    RAISE NOTICE 'Atlandi: expense_lines';
  END IF;
END $$;


-- ---------- musteri mesajlari ----------

DO $$
BEGIN
  IF to_regclass('public.client_messages') IS NULL THEN
    RAISE NOTICE 'Atlandi: client_messages';
    RETURN;
  END IF;

  ALTER TABLE client_messages ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS client_messages_select ON client_messages;
  DROP POLICY IF EXISTS client_messages_insert ON client_messages;
  DROP POLICY IF EXISTS client_messages_update ON client_messages;
  DROP POLICY IF EXISTS client_messages_delete ON client_messages;

  CREATE POLICY client_messages_select ON client_messages FOR SELECT TO authenticated
    USING (can_access_client(client_messages.client_id));
  CREATE POLICY client_messages_insert ON client_messages FOR INSERT TO authenticated
    WITH CHECK (can_access_client(client_messages.client_id));
  CREATE POLICY client_messages_update ON client_messages FOR UPDATE TO authenticated
    USING (can_access_client(client_messages.client_id));
  CREATE POLICY client_messages_delete ON client_messages FOR DELETE TO authenticated
    USING (is_staff() AND can_access_client(client_messages.client_id));
END $$;


-- ---------- duyurular (ofis bazli) ----------

DO $$
BEGIN
  IF to_regclass('public.announcements') IS NULL THEN
    RAISE NOTICE 'Atlandi: announcements';
    RETURN;
  END IF;

  ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS announcements_all ON announcements;
  CREATE POLICY announcements_all ON announcements FOR ALL TO authenticated
    USING (is_super_admin() OR (is_staff() AND office_id = my_office_id()))
    WITH CHECK (is_super_admin() OR (is_staff() AND office_id = my_office_id()));
END $$;


-- ---------- app_settings (ofis bazli) ----------

DO $$
BEGIN
  IF to_regclass('public.app_settings') IS NULL THEN
    RAISE NOTICE 'Atlandi: app_settings';
    RETURN;
  END IF;

  ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS app_settings_select ON app_settings;
  DROP POLICY IF EXISTS app_settings_insert ON app_settings;
  DROP POLICY IF EXISTS app_settings_update ON app_settings;
  DROP POLICY IF EXISTS app_settings_delete ON app_settings;

  -- Musteriler de bazi ayarlari okur (evrak gorunurlugu, klasor yapisi)
  CREATE POLICY app_settings_select ON app_settings FOR SELECT TO authenticated
    USING (
      is_super_admin()
      OR office_id = my_office_id()
      OR office_id = (SELECT office_id FROM clients WHERE auth_user_id = auth.uid() LIMIT 1)
    );
  CREATE POLICY app_settings_insert ON app_settings FOR INSERT TO authenticated
    WITH CHECK (is_super_admin() OR (is_staff() AND office_id = my_office_id()));
  CREATE POLICY app_settings_update ON app_settings FOR UPDATE TO authenticated
    USING (is_super_admin() OR (is_staff() AND office_id = my_office_id()));
  CREATE POLICY app_settings_delete ON app_settings FOR DELETE TO authenticated
    USING (is_super_admin() OR (my_role() = 'admin' AND office_id = my_office_id()));
END $$;


-- ---------- parameters : ortak vergi parametreleri ----------
-- Devlet tarafindan belirlenir, tum ofisler icin aynidir.
-- Herkes okur, yalnizca super_admin yazar.

DO $$
BEGIN
  IF to_regclass('public.parameters') IS NULL THEN
    RAISE NOTICE 'Atlandi: parameters';
    RETURN;
  END IF;

  ALTER TABLE parameters ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS parameters_select ON parameters;
  DROP POLICY IF EXISTS parameters_insert ON parameters;
  DROP POLICY IF EXISTS parameters_update ON parameters;
  DROP POLICY IF EXISTS parameters_delete ON parameters;

  CREATE POLICY parameters_select ON parameters FOR SELECT TO authenticated USING (true);
  CREATE POLICY parameters_insert ON parameters FOR INSERT TO authenticated WITH CHECK (is_super_admin());
  CREATE POLICY parameters_update ON parameters FOR UPDATE TO authenticated USING (is_super_admin());
  CREATE POLICY parameters_delete ON parameters FOR DELETE TO authenticated USING (is_super_admin());
END $$;


-- ---------- calculations : kullanici bazli ----------

DO $$
BEGIN
  IF to_regclass('public.calculations') IS NULL THEN
    RAISE NOTICE 'Atlandi: calculations';
    RETURN;
  END IF;

  ALTER TABLE calculations ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS calculations_all ON calculations;
  CREATE POLICY calculations_all ON calculations FOR ALL TO authenticated
    USING (
      is_super_admin()
      OR user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = calculations.user_id AND p.office_id = my_office_id()
      )
    )
    WITH CHECK (user_id = auth.uid() OR is_super_admin());
END $$;


-- ---------- atil / eski tablolar ----------
-- Kod tabaninda kullanilmayan eski tablolar. Silinmiyor ama
-- RLS'siz kalmamalari icin yalnizca super_admin'e aciliyor.

DO $$
DECLARE
  t     TEXT;
  liste TEXT[] := ARRAY['credentials','users'];
BEGIN
  FOREACH t IN ARRAY liste LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_super_only', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (is_super_admin()) WITH CHECK (is_super_admin())',
      t || '_super_only', t
    );
    RAISE NOTICE 'Kilitlendi (atil tablo): %', t;
  END LOOP;
END $$;


-- ============================================================
-- BOLUM 8 : YENI KULLANICI TRIGGER'I (office_id destegi)
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_office_id BIGINT;
BEGIN
  -- Kayit sirasinda metadata ile gonderilen office_id
  v_office_id := NULLIF(new.raw_user_meta_data->>'office_id', '')::BIGINT;

  -- Gonderilmemisse ana ofise ata
  IF v_office_id IS NULL THEN
    v_office_id := 1;
  END IF;

  INSERT INTO public.profiles (id, email, name, role, temp_password, office_id)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', ''),
    COALESCE(new.raw_user_meta_data->>'role', 'personel'),
    CASE WHEN new.raw_user_meta_data->>'role' = 'client' THEN true ELSE false END,
    v_office_id
  )
  ON CONFLICT (id) DO UPDATE SET
    email     = EXCLUDED.email,
    office_id = COALESCE(public.profiles.office_id, EXCLUDED.office_id);

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- BOLUM 9 : OFIS ACMA FONKSIYONU (super_admin)
-- ============================================================
-- Ofis kaydini olusturur. Ofis adminin auth hesabi uygulama
-- tarafinda (supabase.auth.signUp) acilir, sonra bu fonksiyon
-- ile ofise baglanir.

CREATE OR REPLACE FUNCTION create_office(
  p_code TEXT,
  p_name TEXT,
  p_phone TEXT DEFAULT '',
  p_email TEXT DEFAULT ''
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id BIGINT;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Yalnizca super_admin ofis acabilir';
  END IF;

  INSERT INTO offices (code, name, phone, email)
  VALUES (lower(trim(p_code)), trim(p_name), p_phone, p_email)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Bir kullaniciyi ofise atar / rolunu belirler
CREATE OR REPLACE FUNCTION assign_user_to_office(
  p_user_id UUID,
  p_office_id BIGINT,
  p_role TEXT DEFAULT 'admin'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Yalnizca super_admin kullanici atayabilir';
  END IF;

  UPDATE profiles SET office_id = p_office_id, role = p_role WHERE id = p_user_id;

  -- Ofisin sahibi bos ise bu kullaniciyi sahip yap
  UPDATE offices SET owner_id = p_user_id
  WHERE id = p_office_id AND owner_id IS NULL AND p_role = 'admin';
END;
$$;

GRANT EXECUTE ON FUNCTION create_office(TEXT, TEXT, TEXT, TEXT)      TO authenticated;
GRANT EXECUTE ON FUNCTION assign_user_to_office(UUID, BIGINT, TEXT)  TO authenticated;


-- ============================================================
-- BOLUM 10 : STORAGE - PRIVATE BUCKET
-- ============================================================

UPDATE storage.buckets SET public = false WHERE id = 'client-documents';

-- Eski storage politikalarini temizle
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

-- Personel: kendi ofisinin klasorune tam yetki.
-- Ana ofis (mubis) dosyalari kok dizinde durdugu icin (ofis onegi yok),
-- 'ofis_' ile baslamayan yollar ana ofise aittir.
CREATE POLICY storage_staff_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND (
      is_super_admin()
      OR (
        is_staff() AND (
          (my_office_id() = 1 AND name NOT LIKE 'ofis\_%')
          OR name LIKE ('ofis_' || my_office_id()::text || '/%')
        )
      )
    )
  );

CREATE POLICY storage_staff_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-documents'
    AND (
      is_super_admin()
      OR (
        is_staff() AND (
          (my_office_id() = 1 AND name NOT LIKE 'ofis\_%')
          OR name LIKE ('ofis_' || my_office_id()::text || '/%')
        )
      )
    )
  );

CREATE POLICY storage_staff_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND (
      is_super_admin()
      OR (
        is_staff() AND (
          (my_office_id() = 1 AND name NOT LIKE 'ofis\_%')
          OR name LIKE ('ofis_' || my_office_id()::text || '/%')
        )
      )
    )
  );

CREATE POLICY storage_staff_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND (
      is_super_admin()
      OR (
        is_staff() AND (
          (my_office_id() = 1 AND name NOT LIKE 'ofis\_%')
          OR name LIKE ('ofis_' || my_office_id()::text || '/%')
        )
      )
    )
  );

-- Musteri: kendi ofisinin klasorunden okuma + kendi yukledigi evraklar.
-- Musteri klasor adi VKN/TC ile basladigi icin dosya yolu kontrolu
-- uygulama tarafinda yapilir; burada ofis sinirini koruyoruz.
CREATE POLICY storage_client_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND EXISTS (
      SELECT 1 FROM clients c
      WHERE c.auth_user_id = auth.uid()
        AND (
          (c.office_id = 1 AND name NOT LIKE 'ofis\_%')
          OR name LIKE ('ofis_' || c.office_id::text || '/%')
        )
    )
  );

CREATE POLICY storage_client_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-documents'
    AND EXISTS (
      SELECT 1 FROM clients c
      WHERE c.auth_user_id = auth.uid()
        AND (
          (c.office_id = 1 AND name NOT LIKE 'ofis\_%')
          OR name LIKE ('ofis_' || c.office_id::text || '/%')
        )
    )
  );


-- ============================================================
-- BOLUM 11 : updated_at TETIKLEYICISI
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS offices_updated_at ON offices;
CREATE TRIGGER offices_updated_at BEFORE UPDATE ON offices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


NOTIFY pgrst, 'reload schema';


-- ============================================================
-- KONTROL SORGULARI (calistirdiktan sonra tek tek deneyin)
-- ============================================================
-- 1) Ofis olustu mu?
--    SELECT * FROM offices;
--
-- 2) Tum musteriler ana ofiste mi?
--    SELECT office_id, count(*) FROM clients GROUP BY office_id;
--
-- 3) Tum profiller ana ofiste mi?
--    SELECT office_id, role, count(*) FROM profiles GROUP BY office_id, role;
--
-- 4) KENDINIZI SUPER ADMIN YAPIN (e-postanizi yazin):
--    UPDATE profiles SET role = 'super_admin' WHERE email = 'BURAYA_KENDI_MAILINIZ';
--
-- 5) Ayarlar ofise baglandi mi?
--    SELECT office_id, count(*) FROM app_settings GROUP BY office_id;
--
-- 6) Bucket private oldu mu?
--    SELECT id, public FROM storage.buckets WHERE id = 'client-documents';
--
-- 7) ONEMLI - Musteri girisleri baglandi mi?
--    Bu sorgu 0 dondurmelidir. Sifir degilse o musteriler portala
--    giremez; ilgili musteri icin admin panelinden "Giris Bilgileri"
--    yeniden olusturulmalidir.
--    SELECT count(*) AS baglanmamis_musteri
--    FROM clients WHERE auth_user_id IS NULL;
--
--    Hangi musteriler baglanmamis:
--    SELECT id, name, company, username, vkn, tc
--    FROM clients WHERE auth_user_id IS NULL ORDER BY name;
--
-- 8) GUVENLIK - RLS'i kapali kalan tablo var mi?
--    Bu sorgu BOS donmelidir. Satir donerse o tablodaki veriyi
--    tum ofisler gorebilir; bana bildirin.
--    SELECT c.relname AS korumasiz_tablo
--    FROM pg_class c
--    JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public'
--      AND c.relkind = 'r'
--      AND c.relrowsecurity = false
--    ORDER BY 1;
--
-- 9) RLS acik ama hic politikasi olmayan tablo var mi?
--    Bu da BOS donmelidir.
--    SELECT c.relname AS politikasiz_tablo
--    FROM pg_class c
--    JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public'
--      AND c.relkind = 'r'
--      AND c.relrowsecurity = true
--      AND NOT EXISTS (
--        SELECT 1 FROM pg_policies p
--        WHERE p.schemaname = 'public' AND p.tablename = c.relname
--      )
--    ORDER BY 1;
-- ============================================================
