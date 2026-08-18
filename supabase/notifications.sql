-- Musteri bildirimleri tablosu
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info', -- info | success | warning
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select_policy ON notifications;
DROP POLICY IF EXISTS notifications_insert_policy ON notifications;
DROP POLICY IF EXISTS notifications_update_policy ON notifications;

CREATE POLICY notifications_select_policy
ON notifications FOR SELECT
USING (true);

CREATE POLICY notifications_insert_policy
ON notifications FOR INSERT
WITH CHECK (true);

CREATE POLICY notifications_update_policy
ON notifications FOR UPDATE
USING (true);

NOTIFY pgrst, 'reload schema';
