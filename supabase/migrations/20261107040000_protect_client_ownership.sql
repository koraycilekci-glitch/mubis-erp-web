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
