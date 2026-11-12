alter table public.efatura_faturalar enable row level security;

drop policy if exists efatura_faturalar_select_policy on public.efatura_faturalar;
drop policy if exists efatura_faturalar_insert_policy on public.efatura_faturalar;
drop policy if exists efatura_faturalar_update_policy on public.efatura_faturalar;
drop policy if exists efatura_faturalar_delete_policy on public.efatura_faturalar;

create policy efatura_faturalar_select_policy on public.efatura_faturalar
for select to authenticated using (
  exists (
    select 1 from public.clients c
    where c.id = efatura_faturalar.client_id
      and (public.is_super_admin() or (public.is_staff() and c.office_id = public.my_office_id()) or c.auth_user_id = auth.uid())
  )
);

create policy efatura_faturalar_insert_policy on public.efatura_faturalar
for insert to authenticated with check (
  exists (
    select 1 from public.clients c
    where c.id = efatura_faturalar.client_id
      and (public.is_super_admin() or (public.is_staff() and c.office_id = public.my_office_id()))
  )
);

create policy efatura_faturalar_update_policy on public.efatura_faturalar
for update to authenticated using (
  exists (
    select 1 from public.clients c
    where c.id = efatura_faturalar.client_id
      and (public.is_super_admin() or (public.is_staff() and c.office_id = public.my_office_id()))
  )
) with check (
  exists (
    select 1 from public.clients c
    where c.id = efatura_faturalar.client_id
      and (public.is_super_admin() or (public.is_staff() and c.office_id = public.my_office_id()))
  )
);

create policy efatura_faturalar_delete_policy on public.efatura_faturalar
for delete to authenticated using (
  exists (
    select 1 from public.clients c
    where c.id = efatura_faturalar.client_id
      and (public.is_super_admin() or (public.is_staff() and c.office_id = public.my_office_id()))
  )
);
