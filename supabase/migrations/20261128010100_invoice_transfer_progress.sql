create table if not exists public.fatura_aktarim_durumu (
  client_id integer not null references public.clients(id) on delete cascade,
  yil smallint not null check (yil between 2000 and 9999),
  ay smallint not null check (ay between 1 and 12),
  tur text not null check (tur in ('efatura', 'earsiv', 'esmm', 'utts')),
  yon text not null check (yon in ('alis', 'satis')),
  durum jsonb not null default '{}'::jsonb check (jsonb_typeof(durum) = 'object'),
  lease_id uuid,
  lease_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (client_id, yil, ay, tur, yon)
);

alter table public.fatura_aktarim_durumu enable row level security;
revoke all on public.fatura_aktarim_durumu from public, anon, authenticated;
grant select, insert, update on public.fatura_aktarim_durumu to authenticated;

create policy fatura_aktarim_ofis on public.fatura_aktarim_durumu for all to authenticated
using (
  exists (select 1 from public.clients c where c.id = client_id
    and (public.is_super_admin() or (public.is_staff() and c.office_id = public.my_office_id())))
)
with check (
  exists (select 1 from public.clients c where c.id = client_id
    and (public.is_super_admin() or (public.is_staff() and c.office_id = public.my_office_id())))
);

notify pgrst, 'reload schema';
