-- ============================================================
-- TOPDU DUYURU VE BORC BILDIRIM SISTEMI
-- announcements, announcement_recipients, debt_notifications
-- ============================================================

-- 1. announcements: Duyuru kayitlari
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'duyuru',
  channels TEXT[] NOT NULL DEFAULT '{}',
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE announcements IS 'Admin tarafindan olusturulan toplu duyurular';
COMMENT ON COLUMN announcements.type IS 'duyuru, borc_hatirlatma, genel';
COMMENT ON COLUMN announcements.channels IS 'whatsapp, email';

-- 2. announcement_recipients: Her duyurunun alici detaylari
CREATE TABLE IF NOT EXISTS announcement_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'bekliyor',
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE announcement_recipients IS 'Duyuru alicilarinin gonderim durumlari';
COMMENT ON COLUMN announcement_recipients.status IS 'bekliyor, gonderildi, basarisiz';

-- 3. debt_notifications: Borc bildirim gecmisi
CREATE TABLE IF NOT EXISTS debt_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  borc_tutar NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'bekliyor',
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE debt_notifications IS 'Musterilere gonderilen borc bildirimleri';

-- ============================================================
-- INDEKSLER
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_announcements_created_by ON announcements(created_by);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcement_recipients_announcement ON announcement_recipients(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_recipients_client ON announcement_recipients(client_id);
CREATE INDEX IF NOT EXISTS idx_announcement_recipients_status ON announcement_recipients(status);
CREATE INDEX IF NOT EXISTS idx_debt_notifications_client ON debt_notifications(client_id);
CREATE INDEX IF NOT EXISTS idx_debt_notifications_created ON debt_notifications(created_at DESC);

-- ============================================================
-- RLS POLITIKALARI
-- ============================================================
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE debt_notifications ENABLE ROW LEVEL SECURITY;

-- announcements RLS
DROP POLICY IF EXISTS announcements_select_policy ON announcements;
CREATE POLICY announcements_select_policy ON announcements
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS announcements_insert_policy ON announcements;
CREATE POLICY announcements_insert_policy ON announcements
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS announcements_update_policy ON announcements;
CREATE POLICY announcements_update_policy ON announcements
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS announcements_delete_policy ON announcements;
CREATE POLICY announcements_delete_policy ON announcements
  FOR DELETE TO authenticated USING (true);

-- announcement_recipients RLS
DROP POLICY IF EXISTS ar_select_policy ON announcement_recipients;
CREATE POLICY ar_select_policy ON announcement_recipients
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS ar_insert_policy ON announcement_recipients;
CREATE POLICY ar_insert_policy ON announcement_recipients
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS ar_update_policy ON announcement_recipients;
CREATE POLICY ar_update_policy ON announcement_recipients
  FOR UPDATE TO authenticated USING (true);

-- debt_notifications RLS
DROP POLICY IF EXISTS dn_select_policy ON debt_notifications;
CREATE POLICY dn_select_policy ON debt_notifications
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS dn_insert_policy ON debt_notifications;
CREATE POLICY dn_insert_policy ON debt_notifications
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS dn_update_policy ON debt_notifications;
CREATE POLICY dn_update_policy ON debt_notifications
  FOR UPDATE TO authenticated USING (true);

-- ============================================================
-- TRIGGER: updated_at otomatik guncelleme
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS announcements_updated_at ON announcements;
CREATE TRIGGER announcements_updated_at
  BEFORE UPDATE ON announcements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
