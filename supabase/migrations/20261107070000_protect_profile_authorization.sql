create or replace function public.prevent_direct_profile_authorization_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated' and (
    new.id is distinct from old.id or
    new.office_id is distinct from old.office_id or
    new.client_id is distinct from old.client_id or
    new.permissions is distinct from old.permissions or
    new.mukellef is distinct from old.mukellef
  ) then
    raise exception 'Profil yetki alanları doğrudan değiştirilemez' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_direct_profile_authorization_change on public.profiles;
create trigger prevent_direct_profile_authorization_change
before update on public.profiles
for each row execute function public.prevent_direct_profile_authorization_change();

alter policy profiles_insert on public.profiles
with check (
  id = auth.uid() and
  role = 'client' and
  office_id is null and
  client_id is null and
  coalesce(permissions, '{}'::jsonb) = '{}'::jsonb and
  coalesce(mukellef, false) = false
);
