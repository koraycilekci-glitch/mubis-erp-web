-- ============================================================
-- MUBiS ERP - TEMIZ KURULUM (once sil, sonra olustur)
-- ============================================================

-- 1. MEVCUT POLICY'LERI SIL
DO $$ 
DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 2. MEVCUT TRIGGER'LARI SIL
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS clients_updated_at ON clients;
DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
DROP TRIGGER IF EXISTS beyan_status_updated_at ON beyan_status;

-- 3. MEVCUT TABLOLARI SIL (sirali - foreign key bagimliliklari)
DROP TABLE IF EXISTS ai_data CASCADE;
DROP TABLE IF EXISTS client_notes CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS banks CASCADE;
DROP TABLE IF EXISTS partners CASCADE;
DROP TABLE IF EXISTS beyan_status CASCADE;
DROP TABLE IF EXISTS clients CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- 4. FONKSIYONLARI SIL
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at() CASCADE;

-- ============================================================
-- TABLOLAR
-- ============================================================

CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  email TEXT,
  role TEXT NOT NULL DEFAULT 'personel' CHECK (role IN ('admin', 'personel', 'client')),
  permissions JSONB DEFAULT '{}',
  temp_password BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE clients (
  id BIGSERIAL PRIMARY KEY,
  owner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  type TEXT DEFAULT 'personal' CHECK (type IN ('personal', 'company')),
  name TEXT NOT NULL DEFAULT '',
  company TEXT DEFAULT '',
  vkn TEXT DEFAULT '',
  tc TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  tax_office TEXT DEFAULT '',
  address TEXT DEFAULT '',
  city TEXT DEFAULT '',
  company_type TEXT DEFAULT 'ltd',
  tax_type TEXT DEFAULT 'Kurumlar Vergisi',
  capital TEXT DEFAULT '',
  open_date TEXT DEFAULT '',
  close_date TEXT DEFAULT '',
  musteri_sinifi TEXT DEFAULT '',
  nace_code TEXT DEFAULT '',
  nace_desc TEXT DEFAULT '',
  efatura BOOLEAN DEFAULT false,
  earsiv BOOLEAN DEFAULT false,
  esmm BOOLEAN DEFAULT false,
  edefter BOOLEAN DEFAULT false,
  edefter_period TEXT DEFAULT 'aylik',
  serbest_meslek BOOLEAN DEFAULT false,
  eimza_start TEXT DEFAULT '',
  eimza_end TEXT DEFAULT '',
  kart_tipi TEXT DEFAULT '',
  kart_sifre TEXT DEFAULT '',
  kira_bilgisi TEXT DEFAULT '',
  kira_kontrat_bitis TEXT DEFAULT '',
  dvs_username TEXT DEFAULT '',
  dvs_password TEXT DEFAULT '',
  sgk_user TEXT DEFAULT '',
  sgk_isyeri_kodu TEXT DEFAULT '',
  sgk_sistem_sifre TEXT DEFAULT '',
  sgk_isyeri_sifre TEXT DEFAULT '',
  earsiv_user TEXT DEFAULT '',
  earsiv_pass TEXT DEFAULT '',
  edevlet_user TEXT DEFAULT '',
  edevlet_pass TEXT DEFAULT '',
  ticaret_sicil_no TEXT DEFAULT '',
  beyan_profile JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'passive', 'closed')),
  username TEXT DEFAULT '',
  password TEXT DEFAULT '123456',
  temp_password BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE beyan_status (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL,
  beyan_type TEXT NOT NULL,
  status TEXT DEFAULT 'yapilmadi' CHECK (status IN ('yapilmadi', 'hazir', 'onaylandi', 'gonderildi')),
  notes TEXT DEFAULT '',
  updated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, year, month, beyan_type)
);

CREATE TABLE partners (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  tc TEXT DEFAULT '',
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  tax_no TEXT DEFAULT '',
  share_percent NUMERIC DEFAULT 0,
  capital NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE banks (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL DEFAULT '',
  branch TEXT DEFAULT '',
  iban TEXT DEFAULT '',
  account_no TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE documents (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
  doc_type TEXT DEFAULT '',
  doc_name TEXT NOT NULL DEFAULT '',
  file_url TEXT DEFAULT '',
  file_size BIGINT DEFAULT 0,
  notes TEXT DEFAULT '',
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE client_notes (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ai_data (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
  data_type TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INDEXLER
-- ============================================================
CREATE INDEX idx_clients_owner ON clients(owner_id);
CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_clients_vkn ON clients(vkn);
CREATE INDEX idx_clients_tc ON clients(tc);
CREATE INDEX idx_beyan_status_client ON beyan_status(client_id, year, month);
CREATE INDEX idx_partners_client ON partners(client_id);
CREATE INDEX idx_banks_client ON banks(client_id);
CREATE INDEX idx_documents_client ON documents(client_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE beyan_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (
  auth.uid() = id OR 
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (
  auth.uid() = id OR 
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (true);

CREATE POLICY "clients_select" ON clients FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin') OR
  owner_id = auth.uid()
);
CREATE POLICY "clients_insert" ON clients FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'personel'))
);
CREATE POLICY "clients_update" ON clients FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin') OR
  owner_id = auth.uid()
);
CREATE POLICY "clients_delete" ON clients FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

CREATE POLICY "beyan_status_all" ON beyan_status FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin') OR
  EXISTS (SELECT 1 FROM clients c WHERE c.id = beyan_status.client_id AND c.owner_id = auth.uid())
);

CREATE POLICY "partners_all" ON partners FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin') OR
  EXISTS (SELECT 1 FROM clients c WHERE c.id = partners.client_id AND c.owner_id = auth.uid())
);

CREATE POLICY "banks_all" ON banks FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin') OR
  EXISTS (SELECT 1 FROM clients c WHERE c.id = banks.client_id AND c.owner_id = auth.uid())
);

CREATE POLICY "documents_all" ON documents FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin') OR
  EXISTS (SELECT 1 FROM clients c WHERE c.id = documents.client_id AND c.owner_id = auth.uid())
);

CREATE POLICY "notes_all" ON client_notes FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin') OR
  EXISTS (SELECT 1 FROM clients c WHERE c.id = client_notes.client_id AND c.owner_id = auth.uid())
);

CREATE POLICY "ai_data_all" ON ai_data FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin') OR
  EXISTS (SELECT 1 FROM clients c WHERE c.id = ai_data.client_id AND c.owner_id = auth.uid())
);

-- ============================================================
-- TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, temp_password)
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'name', ''), 
    COALESCE(new.raw_user_meta_data->>'role', 'personel'),
    CASE WHEN new.raw_user_meta_data->>'role' = 'client' THEN true ELSE false END
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER beyan_status_updated_at BEFORE UPDATE ON beyan_status FOR EACH ROW EXECUTE FUNCTION update_updated_at();
