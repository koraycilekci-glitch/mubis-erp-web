begin;

alter table public.accounting_fees
  add column if not exists aylik_tarifeler jsonb not null default '{}'::jsonb,
  add column if not exists tasdik_tarifeleri jsonb not null default '{}'::jsonb;

alter table public.accounting_fees enable row level security;

create policy accounting_fees_staff_insert on public.accounting_fees as restrictive
  for insert to authenticated with check (public.is_super_admin() or (public.is_staff() and public.can_access_client(client_id)));
create policy accounting_fees_staff_update on public.accounting_fees as restrictive
  for update to authenticated
  using (public.is_super_admin() or (public.is_staff() and public.can_access_client(client_id)))
  with check (public.is_super_admin() or (public.is_staff() and public.can_access_client(client_id)));
create policy accounting_fees_staff_delete on public.accounting_fees as restrictive
  for delete to authenticated using (public.is_super_admin() or (public.is_staff() and public.can_access_client(client_id)));
revoke insert, update, delete on public.accounting_fees from anon;

create or replace function public.muhasebe_tarifesi_kaydet(
  p_client_id bigint,
  p_aylik_donem text default null,
  p_aylik numeric default null,
  p_tasdik_yili integer default null,
  p_tasdik numeric default null,
  p_onceki numeric default null,
  p_notlar text default null,
  p_ucret_var boolean default null
) returns public.accounting_fees
language plpgsql security invoker set search_path = '' as $$
declare
  kayit public.accounting_fees;
begin
  if not coalesce(public.is_super_admin() or (public.is_staff() and public.can_access_client(p_client_id)), false) then
    raise exception 'Muhasebe ücreti düzenleme yetkisi yok' using errcode = '42501';
  end if;
  if (p_aylik_donem is null) <> (p_aylik is null)
     or (p_tasdik_yili is null) <> (p_tasdik is null)
     or p_aylik_donem !~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])$'
     or p_tasdik_yili not between 1000 and 9999
     or p_aylik < 0 or p_tasdik < 0 or p_onceki < 0
     or p_aylik::text in ('NaN', 'Infinity', '-Infinity')
     or p_tasdik::text in ('NaN', 'Infinity', '-Infinity')
     or p_onceki::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Geçersiz ücret veya tarife dönemi' using errcode = '22023';
  end if;

  insert into public.accounting_fees as fee
    (client_id, aylik_tarifeler, tasdik_tarifeleri, onceki_donem_borc, notlar, muhasebe_ucreti_var, updated_at)
  values (
    p_client_id,
    case when p_aylik is null then '{}'::jsonb else jsonb_build_object(p_aylik_donem, round(p_aylik, 2)) end,
    case when p_tasdik is null then '{}'::jsonb else jsonb_build_object(p_tasdik_yili::text, round(p_tasdik, 2)) end,
    coalesce(round(p_onceki, 2), 0), coalesce(p_notlar, ''), coalesce(p_ucret_var, true), now()
  )
  on conflict (client_id) do update set
    aylik_tarifeler = fee.aylik_tarifeler || excluded.aylik_tarifeler,
    tasdik_tarifeleri = fee.tasdik_tarifeleri || excluded.tasdik_tarifeleri,
    onceki_donem_borc = coalesce(round(p_onceki, 2), fee.onceki_donem_borc),
    notlar = coalesce(p_notlar, fee.notlar),
    muhasebe_ucreti_var = coalesce(p_ucret_var, fee.muhasebe_ucreti_var),
    updated_at = excluded.updated_at
  returning * into kayit;
  return kayit;
end;
$$;

revoke all on function public.muhasebe_tarifesi_kaydet(bigint, text, numeric, integer, numeric, numeric, text, boolean) from public, anon;
grant execute on function public.muhasebe_tarifesi_kaydet(bigint, text, numeric, integer, numeric, numeric, text, boolean) to authenticated;

commit;
