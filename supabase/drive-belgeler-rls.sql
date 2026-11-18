-- drive_belgeler RLS: tarayicidan (anon/authenticated) Drive referansi yazilabilsin
-- (uploadFileToDrive upsert'i icin gereken)
ALTER TABLE drive_belgeler ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'drive_belgeler' AND policyname = 'drive_belgeler_select_authenticated') THEN
    CREATE POLICY drive_belgeler_select_authenticated ON drive_belgeler
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'drive_belgeler' AND policyname = 'drive_belgeler_insert_authenticated') THEN
    CREATE POLICY drive_belgeler_insert_authenticated ON drive_belgeler
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'drive_belgeler' AND policyname = 'drive_belgeler_update_authenticated') THEN
    CREATE POLICY drive_belgeler_update_authenticated ON drive_belgeler
      FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- document_analysis RLS: AI analiz sonuclarini kullanici kaydedebilsin (403 hatasi cozumu)
ALTER TABLE document_analysis ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'document_analysis' AND policyname = 'document_analysis_select_authenticated') THEN
    CREATE POLICY document_analysis_select_authenticated ON document_analysis
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'document_analysis' AND policyname = 'document_analysis_insert_authenticated') THEN
    CREATE POLICY document_analysis_insert_authenticated ON document_analysis
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'document_analysis' AND policyname = 'document_analysis_update_authenticated') THEN
    CREATE POLICY document_analysis_update_authenticated ON document_analysis
      FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'document_analysis' AND policyname = 'document_analysis_delete_authenticated') THEN
    CREATE POLICY document_analysis_delete_authenticated ON document_analysis
      FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
