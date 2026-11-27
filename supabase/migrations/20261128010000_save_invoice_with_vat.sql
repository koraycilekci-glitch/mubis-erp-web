alter table public.efatura_faturalar add column if not exists doviz_kur numeric;

create or replace function public.efatura_kdv_yenile(p_fatura_id bigint, p_detay jsonb)
returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not (public.is_super_admin() or public.is_staff()) then
    raise exception 'Fatura yazma yetkisi yok' using errcode = '42501';
  end if;
  if jsonb_typeof(p_detay) is distinct from 'array' or jsonb_array_length(p_detay) = 0 then
    raise exception 'Geçerli KDV satırı bulunamadı' using errcode = '22023';
  end if;
  perform 1 from public.efatura_faturalar where id = p_fatura_id for update;
  if not found then
    raise exception 'Fatura bulunamadı veya düzenleme yetkisi yok' using errcode = '42501';
  end if;
  delete from public.efatura_kdv_detay where fatura_id = p_fatura_id;
  insert into public.efatura_kdv_detay (fatura_id, oran, matrah, kdv)
  select p_fatura_id, detay.oran, detay.matrah, detay.kdv
  from jsonb_to_recordset(p_detay) as detay(oran numeric, matrah numeric, kdv numeric);
end;
$$;

create or replace function public.efatura_kdvli_kaydet(p_kayitlar jsonb)
returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  girdi jsonb;
  fatura public.efatura_faturalar;
  fatura_id bigint;
  kayit_sayisi integer := 0;
begin
  if not (public.is_super_admin() or public.is_staff()) then
    raise exception 'Fatura yazma yetkisi yok' using errcode = '42501';
  end if;
  if jsonb_typeof(p_kayitlar) is distinct from 'array' or jsonb_array_length(p_kayitlar) > 100 then
    raise exception 'Geçersiz fatura partisi' using errcode = '22023';
  end if;
  for girdi in select value from jsonb_array_elements(p_kayitlar)
    order by value->>'client_id', value->>'yon', value->>'tur', value->>'fatura_uuid'
  loop
    fatura := jsonb_populate_record(null::public.efatura_faturalar, girdi);
    insert into public.efatura_faturalar as mevcut (
      client_id, yon, tur, fatura_turu, fatura_uuid, fatura_no, tarih, karsi_vkn, karsi_unvan,
      tutar, matrah, kdv, para_birimi, doviz_kur, pdf_url, xml_url, html_url, sorgu_ts
    ) values (
      fatura.client_id, fatura.yon, fatura.tur, coalesce(fatura.fatura_turu, ''), fatura.fatura_uuid,
      coalesce(fatura.fatura_no, ''), fatura.tarih, coalesce(fatura.karsi_vkn, ''), coalesce(fatura.karsi_unvan, ''),
      fatura.tutar, fatura.matrah, fatura.kdv, coalesce(fatura.para_birimi, 'TRY'), fatura.doviz_kur,
      coalesce(fatura.pdf_url, ''), coalesce(fatura.xml_url, ''), coalesce(fatura.html_url, ''), coalesce(fatura.sorgu_ts, now())
    ) on conflict (client_id, yon, tur, fatura_uuid) do update set
      fatura_turu = coalesce(nullif(excluded.fatura_turu, ''), mevcut.fatura_turu),
      fatura_no = coalesce(nullif(excluded.fatura_no, ''), mevcut.fatura_no),
      tarih = coalesce(excluded.tarih, mevcut.tarih),
      karsi_vkn = coalesce(nullif(excluded.karsi_vkn, ''), mevcut.karsi_vkn),
      karsi_unvan = coalesce(nullif(excluded.karsi_unvan, ''), mevcut.karsi_unvan),
      tutar = coalesce(excluded.tutar, mevcut.tutar),
      matrah = coalesce(excluded.matrah, mevcut.matrah),
      kdv = coalesce(excluded.kdv, mevcut.kdv),
      para_birimi = coalesce(nullif(fatura.para_birimi, ''), mevcut.para_birimi),
      doviz_kur = coalesce(excluded.doviz_kur, mevcut.doviz_kur),
      pdf_url = coalesce(nullif(excluded.pdf_url, ''), mevcut.pdf_url),
      xml_url = coalesce(nullif(excluded.xml_url, ''), mevcut.xml_url),
      html_url = coalesce(nullif(excluded.html_url, ''), mevcut.html_url),
      sorgu_ts = excluded.sorgu_ts
    returning mevcut.id into fatura_id;
    if girdi ? 'kdv_detay' then
      perform public.efatura_kdv_yenile(fatura_id, girdi->'kdv_detay');
    end if;
    kayit_sayisi := kayit_sayisi + 1;
  end loop;
  return kayit_sayisi;
end;
$$;

revoke all on function public.efatura_kdv_yenile(bigint, jsonb) from public, anon;
revoke all on function public.efatura_kdvli_kaydet(jsonb) from public, anon;
grant execute on function public.efatura_kdv_yenile(bigint, jsonb) to authenticated;
grant execute on function public.efatura_kdvli_kaydet(jsonb) to authenticated;
notify pgrst, 'reload schema';
