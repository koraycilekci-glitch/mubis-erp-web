BEGIN;

ALTER TABLE public.drive_belgeler ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drive_belgeler FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.drive_belgeler TO authenticated;
GRANT ALL ON public.drive_belgeler TO service_role;

DROP POLICY IF EXISTS drive_belgeler_insert_authenticated ON public.drive_belgeler;
DROP POLICY IF EXISTS drive_belgeler_update_authenticated ON public.drive_belgeler;
DROP POLICY IF EXISTS drive_documents_tenant_guard ON public.drive_belgeler;
CREATE POLICY drive_documents_tenant_guard ON public.drive_belgeler
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (
        p.role = 'super_admin'
        OR EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = drive_belgeler.client_id AND (
            (p.role IN ('client', 'musteri') AND c.auth_user_id = auth.uid())
            OR (p.role IN ('admin', 'personel') AND p.office_id = c.office_id)
          )
        )
      )
    )
  );

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS drive_settings_server_only ON public.app_settings;
CREATE POLICY drive_settings_server_only ON public.app_settings
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (key NOT IN ('google_drive_refresh_token', 'google_drive_oauth_state', 'google_drive_root_folder_id'))
  WITH CHECK (key NOT IN ('google_drive_refresh_token', 'google_drive_oauth_state', 'google_drive_root_folder_id'));

NOTIFY pgrst, 'reload schema';
COMMIT;
