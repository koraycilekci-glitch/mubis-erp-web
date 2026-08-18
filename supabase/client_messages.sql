-- ============================================================
-- MUBIS ASISTAN MESAJLASMA SISTEMI
-- Admin -> MUBIS Asistan -> Musteri mesaj akisi
-- ============================================================

CREATE TABLE IF NOT EXISTS client_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Kim gonderdi: admin (mali musavir) veya client (musteri)
  sender TEXT NOT NULL DEFAULT 'admin',
  sender_name TEXT,

  -- Icerik
  title TEXT,
  message TEXT NOT NULL,             -- adminin yazdigi ham mesaj
  assistant_message TEXT,            -- asistanin musteriye ilettigi duzenlenmis metin

  -- Aciliyet: normal (yesil), onemli (sari), acil (kirmizi)
  priority TEXT NOT NULL DEFAULT 'normal',

  -- Aksiyon: none, belge_talebi, odeme, beyanname_onay, bilgi
  action_type TEXT NOT NULL DEFAULT 'none',
  action_label TEXT,
  action_url TEXT,

  due_date DATE,
  related_period TEXT,               -- ornek: 2026_7_kdv

  channels TEXT[] NOT NULL DEFAULT '{portal}',

  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,

  parent_id UUID REFERENCES client_messages(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE client_messages IS 'Admin ile musteri arasindaki MUBIS Asistan mesajlari';
COMMENT ON COLUMN client_messages.sender IS 'admin | client';
COMMENT ON COLUMN client_messages.priority IS 'normal | onemli | acil';
COMMENT ON COLUMN client_messages.action_type IS 'none | belge_talebi | odeme | beyanname_onay | bilgi';

CREATE INDEX IF NOT EXISTS idx_client_messages_client ON client_messages(client_id);
CREATE INDEX IF NOT EXISTS idx_client_messages_created ON client_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_messages_unread ON client_messages(client_id, is_read);

-- ============================================================
-- RLS
-- Musteri: yalnizca kendi kayitlari. Admin/personel: tumu.
-- ============================================================
ALTER TABLE client_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cm_select_policy ON client_messages;
CREATE POLICY cm_select_policy ON client_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM clients c WHERE c.id = client_messages.client_id AND c.auth_user_id = auth.uid())
    OR NOT EXISTS (SELECT 1 FROM clients c2 WHERE c2.auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS cm_insert_policy ON client_messages;
CREATE POLICY cm_insert_policy ON client_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM clients c WHERE c.id = client_messages.client_id AND c.auth_user_id = auth.uid())
    OR NOT EXISTS (SELECT 1 FROM clients c2 WHERE c2.auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS cm_update_policy ON client_messages;
CREATE POLICY cm_update_policy ON client_messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM clients c WHERE c.id = client_messages.client_id AND c.auth_user_id = auth.uid())
    OR NOT EXISTS (SELECT 1 FROM clients c2 WHERE c2.auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS cm_delete_policy ON client_messages;
CREATE POLICY cm_delete_policy ON client_messages
  FOR DELETE TO authenticated
  USING (
    NOT EXISTS (SELECT 1 FROM clients c2 WHERE c2.auth_user_id = auth.uid())
  );
