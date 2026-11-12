create table if not exists public.notification_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, notification_id)
);

create index if not exists notification_reads_user_id_idx
  on public.notification_reads (user_id);

alter table public.notification_reads enable row level security;

drop policy if exists notification_reads_select_own on public.notification_reads;
create policy notification_reads_select_own
  on public.notification_reads for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists notification_reads_insert_own on public.notification_reads;
create policy notification_reads_insert_own
  on public.notification_reads for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists notification_reads_update_own on public.notification_reads;
create policy notification_reads_update_own
  on public.notification_reads for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notification_reads_delete_own on public.notification_reads;
create policy notification_reads_delete_own
  on public.notification_reads for delete
  to authenticated
  using (user_id = auth.uid());
