-- MUBIS İletişim Merkezi - Database Schema

-- announcements (Duyurular) tablosu
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'duyuru', -- duyuru, borc_hatirlatma, genel
  channels TEXT[] NOT NULL DEFAULT '{}', -- ['whatsapp', 'email']
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- announcement_recipients (Duyuru alıcıları) tablosu
CREATE TABLE IF NOT EXISTS announcement_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  channel TEXT NOT NULL, -- whatsapp, email
  status TEXT NOT NULL DEFAULT 'bekliyor', -- bekliyor, gonderildi, basarisiz
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- debt_notifications (Borç bildirim geçmişi) tablosu
CREATE TABLE IF NOT EXISTS debt_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  channel TEXT NOT NULL, -- whatsapp, email
  borc_tutar NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'bekliyor',
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- communication_templates (İletişim şablonları) tablosu
CREATE TABLE IF NOT EXISTS communication_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- duyuru, borc_hatirlatma, tahakkuk
  channel TEXT NOT NULL, -- whatsapp, email
  subject TEXT, -- email için konu
  content TEXT NOT NULL,
  variables TEXT[] DEFAULT '{}', -- ['{musteri_adi}', '{borc_tutar}', '{son_odeme}']
  is_default BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_announcements_created_by ON announcements(created_by);
CREATE INDEX IF NOT EXISTS idx_announcements_type ON announcements(type);
CREATE INDEX IF NOT EXISTS idx_announcement_recipients_announcement ON announcement_recipients(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_recipients_client ON announcement_recipients(client_id);
CREATE INDEX IF NOT EXISTS idx_debt_notifications_client ON debt_notifications(client_id);
CREATE INDEX IF NOT EXISTS idx_communication_templates_type ON communication_templates(type);

-- RLS Politikaları
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE debt_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_templates ENABLE ROW LEVEL SECURITY;

-- Admin ve personel için tüm yetkiler
CREATE POLICY "announcements_admin_all" ON announcements
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'personel')
    )
  );

CREATE POLICY "announcement_recipients_admin_all" ON announcement_recipients
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'personel')
    )
  );

CREATE POLICY "debt_notifications_admin_all" ON debt_notifications
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'personel')
    )
  );

CREATE POLICY "communication_templates_admin_all" ON communication_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'personel')
    )
  );

-- Müşteri için sadece kendi kayıtları
CREATE POLICY "debt_notifications_client_select" ON debt_notifications
  FOR SELECT
  TO authenticated
  USING (
    client_id = (
      SELECT clients.id FROM clients
      WHERE clients.auth_user_id = auth.uid()
      LIMIT 1
    )
  );

-- Varsayılan şablonlar
INSERT INTO communication_templates (name, type, channel, subject, content, variables, is_default) VALUES
('Borç Hatırlatma - WhatsApp', 'borc_hatirlatma', 'whatsapp', NULL, 
 'Merhaba {musteri_adi},\n\n{miktar} TL tutarındaki muhasebe ücreti borcunuz bulunmaktadır.\nSon ödeme tarihi: {son_odeme}\n\nÖdeme yapmak için: {odeme_linki}', 
 ARRAY['{musteri_adi}', '{miktar}', '{son_odeme}', '{odeme_linki}'], true),

('Borç Hatırlatma - Email', 'borc_hatirlatma', 'email', 'Muhasebe Ücreti Borç Hatırlatması',
 'Sayın {musteri_adi},\n\n{miktar} TL tutarındaki muhasebe ücreti borcunuz bulunmaktadır.\n\nSon ödeme tarihi: {son_odeme}\n\nÖdeme yapmak için aşağıdaki linke tıklayabilirsiniz:\n{odeme_linki}\n\nSaygılarımızla,\nMUBİS ERP',
 ARRAY['{musteri_adi}', '{miktar}', '{son_odeme}', '{odeme_linki}'], true),

('Tahakkuk Bildirimi - WhatsApp', 'tahakkuk', 'whatsapp', NULL,
 'Merhaba {musteri_adi},\n\n{vergi_turu} tahakkukunuz hazırlanmıştır.\n\n💰 Tutar: {tutar} TL\n📅 Son Ödeme: {son_odeme}\n\nPDF dokümanını portal üzerinden indirebilirsiniz.',
 ARRAY['{musteri_adi}', '{vergi_turu}', '{tutar}', '{son_odeme}'], true),

('Genel Duyuru - WhatsApp', 'duyuru', 'whatsapp', NULL,
 'Merhaba {musteri_adi},\n\n{mesaj}\n\nSaygılarımızla,\nMUBİS ERP',
 ARRAY['{musteri_adi}', '{mesaj}'], true),

('Genel Duyuru - Email', 'duyuru', 'email', '{baslik}',
 'Sayın {musteri_adi},\n\n{mesaj}\n\nSaygılarımızla,\nMUBİS ERP',
 ARRAY['{musteri_adi}', '{baslik}', '{mesaj}'], true)
ON CONFLICT DO NOTHING;

-- Trigger: updated_at otomatik güncelleme
CREATE TRIGGER update_announcements_updated_at
  BEFORE UPDATE ON announcements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_communication_templates_updated_at
  BEFORE UPDATE ON communication_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();