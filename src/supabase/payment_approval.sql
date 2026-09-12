-- payments tablosu zaten varsa durum kolonlarini ekle
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS odeme_kanali VARCHAR(30);
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS durum VARCHAR(20) DEFAULT 'onaylandi';
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS makbuz_url TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS red_sebebi TEXT;

-- Mevcut manuel odemeler onayli, eski online odemeler bekliyor
UPDATE public.payments SET durum = 'onaylandi' WHERE durum IS NULL AND odeme_kanali IS NULL;
UPDATE public.payments SET durum = 'bekliyor' WHERE durum IS NULL AND odeme_kanali IN ('paytr','odeal');

-- notifications tablosuna route ve metadata kolonlari ekle (yoksa)
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS route TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS audience VARCHAR(30);

CREATE INDEX IF NOT EXISTS idx_payments_durum ON public.payments(durum);
CREATE INDEX IF NOT EXISTS idx_payments_client_id_durum ON public.payments(client_id, durum);
