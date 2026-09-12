-- clients tablosuna ESMM kolonu ekle
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS esmm BOOLEAN DEFAULT false;
