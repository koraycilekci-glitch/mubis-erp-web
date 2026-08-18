-- Gider Fişleri Tablosu
CREATE TABLE IF NOT EXISTS expense_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  document_date DATE,
  document_no TEXT,
  image_url TEXT,
  file_name TEXT,
  category TEXT DEFAULT 'diger',
  total_amount NUMERIC(15,2) DEFAULT 0,
  kdv_amount NUMERIC(15,2) DEFAULT 0,
  kdv_rate NUMERIC(5,2) DEFAULT 0,
  status TEXT DEFAULT 'pending',
  raw_text TEXT,
  ocr_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Gider Fişi Satırları (Detaylı Kalem Bilgisi)
CREATE TABLE IF NOT EXISTS expense_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_document_id UUID NOT NULL REFERENCES expense_documents(id) ON DELETE CASCADE,
  line_no INTEGER,
  description TEXT,
  account_code TEXT,
  amount NUMERIC(15,2) DEFAULT 0,
  kdv_amount NUMERIC(15,2) DEFAULT 0,
  kdv_rate NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Politikaları
ALTER TABLE expense_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_lines ENABLE ROW LEVEL SECURITY;

-- expense_documents politikaları
CREATE POLICY "expense_documents_select_policy" ON expense_documents
  FOR SELECT USING (true);

CREATE POLICY "expense_documents_insert_policy" ON expense_documents
  FOR INSERT WITH CHECK (true);

CREATE POLICY "expense_documents_update_policy" ON expense_documents
  FOR UPDATE USING (true);

CREATE POLICY "expense_documents_delete_policy" ON expense_documents
  FOR DELETE USING (true);

-- expense_lines politikaları
CREATE POLICY "expense_lines_select_policy" ON expense_lines
  FOR SELECT USING (true);

CREATE POLICY "expense_lines_insert_policy" ON expense_lines
  FOR INSERT WITH CHECK (true);

CREATE POLICY "expense_lines_update_policy" ON expense_lines
  FOR UPDATE USING (true);

CREATE POLICY "expense_lines_delete_policy" ON expense_lines
  FOR DELETE USING (true);

-- Storage bucket for client expenses
INSERT INTO storage.buckets (id, name, public) 
VALUES ('client-expenses', 'client-expenses', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "client_expenses_storage_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'client-expenses');

CREATE POLICY "client_expenses_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'client-expenses');

CREATE POLICY "client_expenses_storage_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'client-expenses');

-- Indexler
CREATE INDEX IF NOT EXISTS idx_expense_documents_client_id ON expense_documents(client_id);
CREATE INDEX IF NOT EXISTS idx_expense_documents_year_month ON expense_documents(year, month);
CREATE INDEX IF NOT EXISTS idx_expense_documents_status ON expense_documents(status);
CREATE INDEX IF NOT EXISTS idx_expense_lines_expense_id ON expense_lines(expense_document_id);
