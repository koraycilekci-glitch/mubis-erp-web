-- Mevcut z_reports tablosuna file_name kolonu ekle
ALTER TABLE z_reports 
ADD COLUMN IF NOT EXISTS file_name text;
