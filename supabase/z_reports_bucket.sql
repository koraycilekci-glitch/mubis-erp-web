-- Z Raporlari icin Storage Bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('client-z-reports', 'client-z-reports', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Politikalari
CREATE POLICY "client_z_reports_storage_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'client-z-reports');

CREATE POLICY "client_z_reports_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'client-z-reports');

CREATE POLICY "client_z_reports_storage_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'client-z-reports');

-- Eger bucket zaten varsa politikalarin varligini kontrol et
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'client-z-reports'
  ) THEN
    INSERT INTO storage.buckets (id, name, public) 
    VALUES ('client-z-reports', 'client-z-reports', true);
  END IF;
END $$;
