-- MUBiS ERP - Hesap Plani, Personel, Izin Takip
-- Supabase SQL Editor'da calistirin

-- 1. Hesap plani (musteriye ozel)
CREATE TABLE IF NOT EXISTS account_plans (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_auto_added BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, code)
);

-- 2. Personeller (bordrodan yuklenen)
CREATE TABLE IF NOT EXISTS employees (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
  ad_soyad TEXT NOT NULL,
  tc_kimlik TEXT DEFAULT '',
  ise_giris DATE,
  isten_cikis DATE,
  brut_ucret NUMERIC DEFAULT 0,
  aktif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Izin kayitlari
CREATE TABLE IF NOT EXISTS leave_records (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT REFERENCES employees(id) ON DELETE CASCADE,
  client_id BIGINT REFERENCES clients(id) ON DELETE CASCADE,
  yil INT NOT NULL,
  baslangic DATE NOT NULL,
  bitis DATE NOT NULL,
  is_gunu INT NOT NULL,
  aciklama TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. RLS
ALTER TABLE account_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_plans_all" ON account_plans FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "employees_all" ON employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "leave_records_all" ON leave_records FOR ALL USING (true) WITH CHECK (true);
