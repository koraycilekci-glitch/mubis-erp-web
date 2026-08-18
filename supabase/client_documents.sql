-- Musteri evraklarini klasor yapida saklamak icin JSONB kolonu
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_documents jsonb DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
