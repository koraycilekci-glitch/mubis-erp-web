alter policy "write client-documents" on storage.objects to authenticated;
alter policy "update client-documents" on storage.objects to authenticated;
alter policy "delete client-documents" on storage.objects to authenticated;
alter policy "write client-expenses" on storage.objects to authenticated;
alter policy "delete client-expenses" on storage.objects to authenticated;
alter policy "write client-z-reports" on storage.objects to authenticated;
alter policy "delete client-z-reports" on storage.objects to authenticated;
