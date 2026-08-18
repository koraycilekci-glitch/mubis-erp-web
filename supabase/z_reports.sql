-- Z Raporlari tablosu (OCR sonrasi ham veri)
CREATE TABLE IF NOT EXISTS z_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL,
  report_date date NOT NULL,
  image_url text NOT NULL,
  file_name text,
  ocr_text text,
  ocr_status text DEFAULT 'pending', -- pending, parsed, approved, rejected
  z_no text,
  total_amount numeric(15,2),
  total_kdv numeric(15,2),
  kdv_matrah numeric(15,2),
  cash_amount numeric(15,2),
  credit_card_amount numeric(15,2),
  other_amount numeric(15,2),
  note text,
  parsed_data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Z Raporu detay satirlari (urun bazli)
CREATE TABLE IF NOT EXISTS z_report_lines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  z_report_id uuid NOT NULL REFERENCES z_reports(id) ON DELETE CASCADE,
  line_no integer,
  product_name text,
  quantity numeric(10,2),
  unit_price numeric(15,2),
  total_price numeric(15,2),
  kdv_rate numeric(5,2),
  kdv_amount numeric(15,2),
  payment_type text, -- nakit, kredi_karti, diger
  created_at timestamptz DEFAULT now()
);

-- Muhasebe kayitlari (OCR sonrasi olusan)
CREATE TABLE IF NOT EXISTS accounting_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  z_report_id uuid REFERENCES z_reports(id) ON DELETE SET NULL,
  entry_date date NOT NULL,
  entry_no text,
  description text,
  debit_account text,
  credit_account text,
  amount numeric(15,2),
  currency text DEFAULT 'TRY',
  source_type text DEFAULT 'z_report', -- z_report, manual, import
  status text DEFAULT 'draft', -- draft, approved, posted
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indeksler
CREATE INDEX IF NOT EXISTS idx_z_reports_client_id ON z_reports(client_id);
CREATE INDEX IF NOT EXISTS idx_z_reports_year_month ON z_reports(year, month);
CREATE INDEX IF NOT EXISTS idx_z_reports_status ON z_reports(ocr_status);
CREATE INDEX IF NOT EXISTS idx_z_report_lines_z_report_id ON z_report_lines(z_report_id);
CREATE INDEX IF NOT EXISTS idx_accounting_entries_client_id ON accounting_entries(client_id);
CREATE INDEX IF NOT EXISTS idx_accounting_entries_z_report_id ON accounting_entries(z_report_id);

-- RLS politikalar
ALTER TABLE z_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE z_report_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS z_reports_select_policy ON z_reports FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS z_reports_insert_policy ON z_reports FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS z_reports_update_policy ON z_reports FOR UPDATE USING (true);
CREATE POLICY IF NOT EXISTS z_reports_delete_policy ON z_reports FOR DELETE USING (true);

CREATE POLICY IF NOT EXISTS z_report_lines_select_policy ON z_report_lines FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS z_report_lines_insert_policy ON z_report_lines FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS z_report_lines_delete_policy ON z_report_lines FOR DELETE USING (true);

CREATE POLICY IF NOT EXISTS accounting_entries_select_policy ON accounting_entries FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS accounting_entries_insert_policy ON accounting_entries FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS accounting_entries_update_policy ON accounting_entries FOR UPDATE USING (true);
CREATE POLICY IF NOT EXISTS accounting_entries_delete_policy ON accounting_entries FOR DELETE USING (true);

-- Storage bucket (Supabase UI'dan olusturulmali)
-- Bucket adi: client-z-reports
-- Public: true
