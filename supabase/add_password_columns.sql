-- Profiles tablosuna sifre sikligi kolonlari ekle
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_change_interval TEXT DEFAULT 'never';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_password_change TIMESTAMPTZ DEFAULT now();
