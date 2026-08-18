-- Musteri portalinin kendi kaydini okuyup tahakkuk tutarini guncelleyebilmesi icin

ALTER TABLE clients ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id);

DROP POLICY IF EXISTS clients_select_musteri ON clients;
CREATE POLICY clients_select_musteri ON clients
  FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS clients_update_musteri ON clients;
CREATE POLICY clients_update_musteri ON clients
  FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());
