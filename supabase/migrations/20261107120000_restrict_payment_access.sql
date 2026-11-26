begin;

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'payments'
      and policyname not in ('payments_all', 'payments_office_all', 'payments_superadmin_all', 'payments_client_select', 'payments_staff_manage')
  ) then
    raise exception 'payments tablosunda beklenmeyen politikalar var; geçiş durduruldu';
  end if;
end;
$$;

alter table public.payments enable row level security;

update public.payments p
set office_id = c.office_id
from public.clients c
where p.client_id = c.id and p.office_id is null and c.office_id is not null;

drop policy if exists payments_all on public.payments;
drop policy if exists payments_office_all on public.payments;
drop policy if exists payments_superadmin_all on public.payments;
drop policy if exists payments_client_select on public.payments;
drop policy if exists payments_staff_manage on public.payments;

create policy payments_staff_manage on public.payments
for all to authenticated
using (
  public.is_super_admin() or (
    public.is_staff() and exists (
      select 1 from public.clients c
      where c.id = payments.client_id
        and c.office_id = public.my_office_id()
        and (payments.office_id is null or payments.office_id = c.office_id)
    )
  )
)
with check (
  public.is_super_admin() or (
    public.is_staff() and exists (
      select 1 from public.clients c
      where c.id = payments.client_id
        and c.office_id = public.my_office_id()
        and (payments.office_id is null or payments.office_id = c.office_id)
    )
  )
);

create policy payments_client_select on public.payments
for select to authenticated using (
  exists (
    select 1 from public.clients c
    where c.id = payments.client_id and c.auth_user_id = auth.uid()
  )
);

commit;
