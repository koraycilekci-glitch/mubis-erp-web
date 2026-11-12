ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS calisma_izni_baslangic date,
  ADD COLUMN IF NOT EXISTS calisma_izni_bitis date;

CREATE TABLE IF NOT EXISTS public.employee_work_permit_reminders (
  employee_id bigint NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  permit_expiry_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, permit_expiry_date)
);

ALTER TABLE public.employee_work_permit_reminders ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.notify_work_permit_expiry(
  p_employee_id bigint,
  p_client_id bigint,
  p_employee_name text,
  p_permit_expiry_date date,
  p_days_remaining integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_office_id bigint;
BEGIN
  SELECT office_id INTO v_office_id FROM public.clients WHERE id = p_client_id;
  INSERT INTO public.employee_work_permit_reminders (employee_id, permit_expiry_date)
  VALUES (p_employee_id, p_permit_expiry_date)
  ON CONFLICT (employee_id, permit_expiry_date) DO NOTHING;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.notifications (
    client_id, type, title, message, route, metadata, audience, is_read, okundu
  ) VALUES
  (
    p_client_id::integer,
    'work_permit_expiry',
    'Çalışma izni bitişi yaklaşıyor',
    format('%s adlı çalışanın çalışma izni %s tarihinde sona eriyor. Kalan gün: %s.', p_employee_name, to_char(p_permit_expiry_date, 'DD.MM.YYYY'), p_days_remaining),
    NULL,
    jsonb_build_object('employee_id', p_employee_id, 'office_id', v_office_id, 'permit_expiry_date', p_permit_expiry_date, 'days_remaining', p_days_remaining),
    'admin',
    false,
    false
  ),
  (
    p_client_id::integer,
    'work_permit_expiry',
    'Çalışma izni bitişi yaklaşıyor',
    format('%s adlı çalışanın çalışma izni %s tarihinde sona eriyor. Kalan gün: %s.', p_employee_name, to_char(p_permit_expiry_date, 'DD.MM.YYYY'), p_days_remaining),
    NULL,
    jsonb_build_object('employee_id', p_employee_id, 'office_id', v_office_id, 'permit_expiry_date', p_permit_expiry_date, 'days_remaining', p_days_remaining),
    'client',
    false,
    false
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_work_permit_expiry(bigint, bigint, text, date, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_work_permit_expiry(bigint, bigint, text, date, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
