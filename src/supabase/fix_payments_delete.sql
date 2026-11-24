-- payments tablosunda office_id NULL olan eski kayitlarin silinemesi sorunu icin
-- RLS politikasini guncelle: office_id NULL olan kayitlar da admin/personel tarafindan yonetilebilsin.

DROP POLICY IF EXISTS payments_office_all ON public.payments;

CREATE POLICY payments_office_all
ON public.payments FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'personel')
      AND (p.office_id = public.payments.office_id OR public.payments.office_id IS NULL)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'personel')
      AND (p.office_id = public.payments.office_id OR public.payments.office_id IS NULL)
  )
);

-- Eski kayitlarin office_id'sini kullanicinin office_id'siyle doldur (istege bagli, tek seferlik)
-- UPDATE public.payments SET office_id = (SELECT office_id FROM public.profiles WHERE id = auth.uid()) WHERE office_id IS NULL;