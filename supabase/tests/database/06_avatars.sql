-- roles-permissions.md P-30: profile photos. Only the owner writes in their own folder.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@example.com', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'ben@example.com', now());
insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'Ana'),
  ('00000000-0000-0000-0000-0000000000a2', 'Ben');

select ok((select public from storage.buckets where id = 'avatars'), 'schema.md §11 avatars are public by URL');
select is((select file_size_limit from storage.buckets where id = 'avatars')::int, 5242880, 'BR-PRV-002 photos up to 5 MB');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('avatars', '00000000-0000-0000-0000-0000000000a1/6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f.jpg', '00000000-0000-0000-0000-0000000000a1')$$,
  'P-30 owner uploads to their own folder'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('avatars', '00000000-0000-0000-0000-0000000000a2/6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e40.jpg', '00000000-0000-0000-0000-0000000000a1')$$,
  '42501', null, 'P-30 a user cannot upload into another folder'
);
select lives_ok(
  $$update public.profiles set photo_path = '00000000-0000-0000-0000-0000000000a1/6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f.jpg'
    where id = '00000000-0000-0000-0000-0000000000a1'$$,
  'P-04 owner points their profile at their own photo'
);
select throws_ok(
  $$update public.profiles set photo_path = '00000000-0000-0000-0000-0000000000a2/6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e40.jpg'
    where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '23514', null, 'schema.md §11 a profile cannot point at someone else''s photo'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select is((select count(*) from storage.objects where bucket_id = 'avatars')::int, 0, 'P-30 a user cannot list another person''s photos');
reset role;
-- Storage blocks direct deletes in SQL, so the delete rule is checked on the policy itself.
select policy_cmd_is('storage', 'objects', 'P-30 avatars owner deletes in own folder', 'delete', 'P-30 there is a delete rule');
select policy_roles_are('storage', 'objects', 'P-30 avatars owner deletes in own folder', array['authenticated'], 'P-30 only signed-in owners delete');

set local role anon;
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('avatars', 'x/6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e41.jpg')$$,
  '42501', null, 'P-30 a visitor cannot upload'
);
reset role;

select * from finish();
rollback;
