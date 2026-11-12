create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, role, temp_password, office_id)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', ''), 'musteri', false, null)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop policy if exists profiles_insert on public.profiles;

create or replace function public.protect_profile_authorization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' and not public.is_super_admin() and (
    new.id is distinct from old.id or
    new.role is distinct from old.role or
    new.office_id is distinct from old.office_id or
    new.client_id is distinct from old.client_id or
    new.permissions is distinct from old.permissions
  ) then
    raise exception 'Profil yetki alanları değiştirilemez' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_authorization on public.profiles;
create trigger protect_profile_authorization
before update on public.profiles
for each row execute function public.protect_profile_authorization();

create or replace function public.protect_client_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' and not public.is_staff() and (
    new.id is distinct from old.id or
    new.office_id is distinct from old.office_id or
    new.auth_user_id is distinct from old.auth_user_id
  ) then
    raise exception 'Müşteri ilişki alanları değiştirilemez' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_client_ownership on public.clients;
create trigger protect_client_ownership
before update on public.clients
for each row execute function public.protect_client_ownership();

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
