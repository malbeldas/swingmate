-- Profile photos (schema.md §11, roles-permissions.md P-30, BR-PRV-002).
-- Public by URL; only the owner uploads, replaces or deletes, inside their own folder
-- {user_id}/{uuid}.jpg. The browser re-encodes the photo to JPEG without EXIF before upload.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "P-30 avatars owner reads own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "P-30 avatars owner uploads to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "P-30 avatars owner replaces in own folder" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "P-30 avatars owner deletes in own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- profiles.photo_path can only point inside the owner's own folder.
alter table public.profiles
  add constraint profiles_photo_path_own_folder
  check (photo_path is null or photo_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.(jpg|webp)$'));
