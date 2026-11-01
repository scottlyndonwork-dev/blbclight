-- Private storage buckets. Files are served through short-lived signed URLs
-- created on the server after a permission check.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('member-photos', 'member-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('finance-attachments', 'finance-attachments', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  ('church-assets', 'church-assets', false, 2097152, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Member photos
create policy "member photos: read" on storage.objects for select to authenticated
  using (bucket_id = 'member-photos' and (select public.has_permission('members.read')));
create policy "member photos: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'member-photos' and (select public.has_permission('members.write')));
create policy "member photos: replace" on storage.objects for update to authenticated
  using (bucket_id = 'member-photos' and (select public.has_permission('members.write')))
  with check (bucket_id = 'member-photos' and (select public.has_permission('members.write')));
create policy "member photos: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'member-photos' and (select public.has_permission('members.write')));

-- Finance attachments (no updates; deletion only for draft transactions is
-- enforced on the attachment row, the file is removed afterwards).
create policy "finance attachments: read" on storage.objects for select to authenticated
  using (bucket_id = 'finance-attachments' and (select public.has_permission('finance.read')));
create policy "finance attachments: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'finance-attachments' and (select public.has_permission('finance.write')));
create policy "finance attachments: delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'finance-attachments'
    and (select public.has_permission('finance.write'))
    and not exists (select 1 from public.financial_attachments a where a.storage_path = name)
  );

-- Church assets (logo, signatures): readable by staff.
create policy "church assets: read" on storage.objects for select to authenticated
  using (bucket_id = 'church-assets');
create policy "church assets: write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'church-assets'
    and (select public.has_any_permission(array['settings.manage', 'certificates.templates']))
  );
create policy "church assets: replace" on storage.objects for update to authenticated
  using (bucket_id = 'church-assets' and (select public.has_any_permission(array['settings.manage', 'certificates.templates'])))
  with check (bucket_id = 'church-assets' and (select public.has_any_permission(array['settings.manage', 'certificates.templates'])));
create policy "church assets: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'church-assets' and (select public.has_any_permission(array['settings.manage', 'certificates.templates'])));
