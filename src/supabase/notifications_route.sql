-- Bildirim tablosuna route/metadata/audience kolonlari ekle (yoksa)
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS route TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS audience VARCHAR(30);

-- audience varsayilan deger
UPDATE public.notifications SET audience = 'admin' WHERE audience IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_audience ON public.notifications(audience);
CREATE INDEX IF NOT EXISTS idx_notifications_route ON public.notifications(route);
