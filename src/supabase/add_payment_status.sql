-- payments tablosuna onay durumu ve makbuz kolonlari ekle
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS durum VARCHAR(20) DEFAULT 'bekliyor';
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS makbuz_url TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS red_sebebi TEXT;

-- Mevcut kayitlari onaylandi olarak isaretle
UPDATE public.payments SET durum = 'onaylandi' WHERE durum IS NULL;

-- Indeks ekle
CREATE INDEX IF NOT EXISTS idx_payments_durum ON public.payments(durum);
