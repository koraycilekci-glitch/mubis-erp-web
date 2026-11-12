create or replace function public.prevent_direct_profile_role_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated' and new.role is distinct from old.role then
    raise exception 'Profil rolü doğrudan değiştirilemez' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_direct_profile_role_change on public.profiles;
create trigger prevent_direct_profile_role_change
before update on public.profiles
for each row execute function public.prevent_direct_profile_role_change();

alter policy profiles_insert on public.profiles
with check (id = auth.uid() and role = 'client');
