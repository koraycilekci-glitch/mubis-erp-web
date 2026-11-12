drop policy if exists "write client-documents" on storage.objects;
drop policy if exists "update client-documents" on storage.objects;
drop policy if exists "delete client-documents" on storage.objects;
drop policy if exists storage_client_insert on storage.objects;
drop policy if exists storage_client_select on storage.objects;

create policy storage_client_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'client-documents' and exists (
    select 1 from public.clients c
    where c.auth_user_id = auth.uid()
      and c.office_id is not null
      and strpos(storage.objects.name,
        case when c.office_id = 1 then '' else 'ofis_' || c.office_id::text || '/' end ||
        coalesce(nullif(c.vkn, ''), nullif(c.tc, ''), 'bilinmeyen') || '_' ||
        regexp_replace(regexp_replace(lower(translate(coalesce(nullif(c.name, ''), 'musteri'), 'çğıöşüÇĞIİÖŞÜ', 'cgiosuCGIIOSU')), '[[:space:]]+', '_', 'g'), '[^a-z0-9_]', '', 'g') || '/'
      ) = 1
  )
);

create policy storage_client_select on storage.objects
for select to authenticated using (
  bucket_id = 'client-documents' and exists (
    select 1 from public.clients c
    where c.auth_user_id = auth.uid()
      and c.office_id is not null
      and strpos(storage.objects.name,
        case when c.office_id = 1 then '' else 'ofis_' || c.office_id::text || '/' end ||
        coalesce(nullif(c.vkn, ''), nullif(c.tc, ''), 'bilinmeyen') || '_' ||
        regexp_replace(regexp_replace(lower(translate(coalesce(nullif(c.name, ''), 'musteri'), 'çğıöşüÇĞIİÖŞÜ', 'cgiosuCGIIOSU')), '[[:space:]]+', '_', 'g'), '[^a-z0-9_]', '', 'g') || '/'
      ) = 1
  )
);
