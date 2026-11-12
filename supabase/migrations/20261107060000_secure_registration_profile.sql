create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, role, temp_password, office_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    'client',
    true,
    null
  )
  on conflict (id) do update set
    email = excluded.email;

  return new;
end;
$$;
