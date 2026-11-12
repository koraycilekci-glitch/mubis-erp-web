alter table public.fatura_hesap_kurallari enable row level security;
revoke all on table public.fatura_hesap_kurallari from anon;

drop policy if exists fatura_kurallari_okuma on public.fatura_hesap_kurallari;
drop policy if exists fatura_kurallari_yazma on public.fatura_hesap_kurallari;

create policy fatura_kurallari_okuma on public.fatura_hesap_kurallari
for select to authenticated using (
  exists (
    select 1 from public.clients c
    where c.id = fatura_hesap_kurallari.client_id
      and (public.is_super_admin() or (public.is_staff() and c.office_id = public.my_office_id()) or c.auth_user_id = auth.uid())
  )
);

create policy fatura_kurallari_yazma on public.fatura_hesap_kurallari
for all to authenticated using (
  exists (
    select 1 from public.clients c
    where c.id = fatura_hesap_kurallari.client_id
      and (public.is_super_admin() or (public.is_staff() and c.office_id = public.my_office_id()))
  )
) with check (
  exists (
    select 1 from public.clients c
    where c.id = fatura_hesap_kurallari.client_id
      and (public.is_super_admin() or (public.is_staff() and c.office_id = public.my_office_id()))
  )
);
