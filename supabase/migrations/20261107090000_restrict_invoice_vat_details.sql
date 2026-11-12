alter table public.efatura_kdv_detay enable row level security;
revoke all on table public.efatura_kdv_detay from anon;

drop policy if exists kdv_detay_okuma on public.efatura_kdv_detay;
drop policy if exists kdv_detay_yazma on public.efatura_kdv_detay;

create policy kdv_detay_okuma on public.efatura_kdv_detay
for select to authenticated using (
  exists (select 1 from public.efatura_faturalar f where f.id = efatura_kdv_detay.fatura_id)
);

create policy kdv_detay_yazma on public.efatura_kdv_detay
for insert to authenticated with check (
  (public.is_super_admin() or public.is_staff()) and
  exists (select 1 from public.efatura_faturalar f where f.id = efatura_kdv_detay.fatura_id)
);

create policy kdv_detay_guncelleme on public.efatura_kdv_detay
for update to authenticated using (
  (public.is_super_admin() or public.is_staff()) and
  exists (select 1 from public.efatura_faturalar f where f.id = efatura_kdv_detay.fatura_id)
) with check (
  (public.is_super_admin() or public.is_staff()) and
  exists (select 1 from public.efatura_faturalar f where f.id = efatura_kdv_detay.fatura_id)
);

create policy kdv_detay_silme on public.efatura_kdv_detay
for delete to authenticated using (
  (public.is_super_admin() or public.is_staff()) and
  exists (select 1 from public.efatura_faturalar f where f.id = efatura_kdv_detay.fatura_id)
);
