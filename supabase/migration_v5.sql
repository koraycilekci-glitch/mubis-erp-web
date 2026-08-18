-- ============================================================
-- MUBiS ERP - Supabase Eksik Schema Tamamlama Migrasyonu (v5)
-- Bu script mevcut veriyi silmeden eksik tablolari, kolonlari,
-- fonksiyonlari ve politikalarini olusturur.
-- ============================================================

-- ------------------------------------------------------------
-- 1. OFFICES (Ofis / Tenant) tablosu
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS offices (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL DEFAULT 'mubis',
  name TEXT NOT NULL DEFAULT 'MUBiS Mali Musavirlik',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  owner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Varsayilan ana ofis (mevcut veriyi bozmamak icin id=1)
INSERT INTO offices (id, code, name, phone, email, is_active)
VALUES (1, 'mubis', 'MUBiS Mali Musavirlik', '0551 084 90 29', 'info@mubiserp.com.tr', true)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 2. PROFILES tablosuna eksik kolonlar
-- ------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS office_id BIGINT REFERENCES offices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_id BIGINT REFERENCES clients(id) ON DELETE SET NULL;

-- Mevcut kullanicilari ana ofise bagla (eger bos ise)
UPDATE profiles SET office_id = 1 WHERE office_id IS NULL;

-- Rol CHECK kisitlamasini guncelle (super_admin dahil)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'personel', 'client', 'musteri', 'super_admin'));

-- ------------------------------------------------------------
-- 3. CLIENTS tablosuna eksik kolonlar
-- ------------------------------------------------------------
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS office_id BIGINT REFERENCES offices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_client_id BIGINT REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS short_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS tax_no TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS phonenumbers JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS emails JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS portal_credentials JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS automation_enabled BOOLEAN DEFAULT true;

-- Mevcut musterileri ana ofise bagla (eger bos ise)
UPDATE clients SET office_id = 1 WHERE office_id IS NULL;

-- Type CHECK kisitlamasini guncelle
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_type_check;
ALTER TABLE clients ADD CONSTRAINT clients_type_check
  CHECK (type IN ('personal', 'company', 'individual'));

-- Status CHECK kisitlamasini guncelle
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_status_check;
ALTER TABLE clients ADD CONSTRAINT clients_status_check
  CHECK (status IN ('active', 'passive', 'closed', 'inactive'));

-- ------------------------------------------------------------
-- 4. Yardimci fonksiyonlar (RLS icin)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.my_office_id()
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_office_id bigint;
BEGIN
  SELECT office_id INTO v_office_id
  FROM public.profiles WHERE id = auth.uid();

  IF v_office_id IS NULL THEN
    SELECT office_id INTO v_office_id
    FROM public.clients
    WHERE auth_user_id = auth.uid()
    LIMIT 1;
  END IF;

  RETURN COALESCE(v_office_id, 1);
END;
$$;

-- ------------------------------------------------------------
-- 5. RPC fonksiyonlari
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_office(
  p_code TEXT,
  p_name TEXT,
  p_phone TEXT DEFAULT '',
  p_email TEXT DEFAULT ''
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  new_id BIGINT;
BEGIN
  INSERT INTO public.offices (code, name, phone, email)
  VALUES (p_code, p_name, p_phone, p_email)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_user_to_office(
  p_user_id UUID,
  p_office_id BIGINT,
  p_role TEXT DEFAULT 'admin'
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET office_id = p_office_id, role = p_role
  WHERE id = p_user_id;
END;
$$;

-- ------------------------------------------------------------
-- 6. APP_SETTINGS tablosunu ofis bazli hale getir
-- ------------------------------------------------------------
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS office_id BIGINT REFERENCES offices(id) ON DELETE CASCADE;

-- Varsayilan ofis 1 olsun
ALTER TABLE app_settings ALTER COLUMN office_id SET DEFAULT 1;

-- Mevcut ayarlara ana ofis ata
UPDATE app_settings SET office_id = 1 WHERE office_id IS NULL;

-- Eski unique kisitlamayi kaldir, ofis+benzersiz anahtar olustur
ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_key_key;
ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_key_unique;

-- Ayni ofiste ayni key tekrar etmemeli
ALTER TABLE app_settings
  ADD CONSTRAINT app_settings_office_key_unique UNIQUE (office_id, key);

-- ------------------------------------------------------------
-- 7. RLS politikalarini guncelle / ekle
-- ------------------------------------------------------------
ALTER TABLE offices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS offices_select ON offices;
DROP POLICY IF EXISTS offices_all ON offices;

CREATE POLICY "offices_select" ON offices FOR SELECT USING (
  is_super_admin() OR id = my_office_id()
);
CREATE POLICY "offices_all" ON offices FOR ALL USING (
  is_super_admin()
);

-- Profiles ofis bazli erisim
DROP POLICY IF EXISTS profiles_select ON profiles;
DROP POLICY IF EXISTS profiles_update ON profiles;
DROP POLICY IF EXISTS profiles_insert ON profiles;

CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (
  auth.uid() = id OR
  is_super_admin() OR
  office_id = my_office_id()
);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (
  auth.uid() = id OR
  is_super_admin() OR
  office_id = my_office_id()
);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (true);

-- Clients ofis bazli erisim
DROP POLICY IF EXISTS clients_select ON clients;
DROP POLICY IF EXISTS clients_insert ON clients;
DROP POLICY IF EXISTS clients_update ON clients;
DROP POLICY IF EXISTS clients_delete ON clients;

CREATE POLICY "clients_select" ON clients FOR SELECT USING (
  is_super_admin() OR
  office_id = my_office_id() OR
  auth_user_id = auth.uid()
);
CREATE POLICY "clients_insert" ON clients FOR INSERT WITH CHECK (
  is_super_admin() OR
  office_id = my_office_id()
);
CREATE POLICY "clients_update" ON clients FOR UPDATE USING (
  is_super_admin() OR
  office_id = my_office_id() OR
  auth_user_id = auth.uid()
);
CREATE POLICY "clients_delete" ON clients FOR DELETE USING (
  is_super_admin() OR
  office_id = my_office_id()
);

-- App_settings ofis bazli
DROP POLICY IF EXISTS app_settings_select_policy ON app_settings;
DROP POLICY IF EXISTS app_settings_insert_policy ON app_settings;
DROP POLICY IF EXISTS app_settings_update_policy ON app_settings;

CREATE POLICY "app_settings_select_policy" ON app_settings FOR SELECT USING (
  is_super_admin() OR office_id = my_office_id()
);
CREATE POLICY "app_settings_insert_policy" ON app_settings FOR INSERT WITH CHECK (
  is_super_admin() OR office_id = my_office_id()
);
CREATE POLICY "app_settings_update_policy" ON app_settings FOR UPDATE USING (
  is_super_admin() OR office_id = my_office_id()
);

-- ------------------------------------------------------------
-- 8. Storage bucket: client-documents
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES ('client-documents', 'client-documents', true, false, 52428800, ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'])
ON CONFLICT (id) DO NOTHING;

-- Storage politikalarini temizle ve ekle
DROP POLICY IF EXISTS "client-documents-public" ON storage.objects;
DROP POLICY IF EXISTS "client-documents-insert" ON storage.objects;
DROP POLICY IF EXISTS "client-documents-update" ON storage.objects;
DROP POLICY IF EXISTS "client-documents-delete" ON storage.objects;

CREATE POLICY "client-documents-public"
ON storage.objects FOR SELECT
USING (bucket_id = 'client-documents');

CREATE POLICY "client-documents-insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'client-documents');

CREATE POLICY "client-documents-update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'client-documents');

CREATE POLICY "client-documents-delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'client-documents');

-- ------------------------------------------------------------
-- 9. updated_at tetikleyicileri
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS offices_updated_at ON offices;
DROP TRIGGER IF EXISTS app_settings_updated_at ON app_settings;
DROP TRIGGER IF EXISTS automation_settings_updated_at ON automation_settings;
DROP TRIGGER IF EXISTS automation_documents_updated_at ON automation_documents;

CREATE TRIGGER offices_updated_at BEFORE UPDATE ON offices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER app_settings_updated_at BEFORE UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER automation_settings_updated_at BEFORE UPDATE ON automation_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER automation_documents_updated_at BEFORE UPDATE ON automation_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- 10. Mevcut auth kullanicilarini profile bagla (eger yoksa)
-- ------------------------------------------------------------
INSERT INTO profiles (id, email, name, role, office_id, temp_password)
SELECT 
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'name', ''),
  COALESCE(u.raw_user_meta_data->>'role', 'personel'),
  1,
  CASE WHEN u.raw_user_meta_data->>'role' = 'client' THEN true ELSE false END
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- ------------------------------------------------------------
-- 11. Bildirim (reload schema)
-- ------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 12. Dogrulama sorgulari
-- ------------------------------------------------------------
SELECT 'offices' AS tablo, COUNT(*) AS satir FROM offices
UNION ALL SELECT 'profiles', COUNT(*) FROM profiles
UNION ALL SELECT 'clients', COUNT(*) FROM clients
UNION ALL SELECT 'app_settings', COUNT(*) FROM app_settings
UNION ALL SELECT 'automation_settings', COUNT(*) FROM automation_settings;
