-- Saved homes (#30): saved_listings and my_saved_listings. UC-005, AC-005-1, AC-005-2, P-13, BR-LST-002.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.suburbs (id, name, state, lat, lng, timezone) values
  (73001, 'Dampier', 'WA', -20.6630, 116.7100, 'Australia/Perth');
-- 30a1 host · 30a2 seeker · 30a3 another member
insert into auth.users (id, email, email_confirmed_at, phone, phone_confirmed_at) values
  ('00000000-0000-0000-0000-0000000030a1', 'host30@example.com', now(), '61400000030', now()),
  ('00000000-0000-0000-0000-0000000030a2', 'seeker30@example.com', now(), null, null),
  ('00000000-0000-0000-0000-0000000030a3', 'other30@example.com', now(), null, null);
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at) values
  ('00000000-0000-0000-0000-0000000030a1', 'Lou', 73001, 'test', now()),
  ('00000000-0000-0000-0000-0000000030a2', 'Mia', 73001, 'test', now()),
  ('00000000-0000-0000-0000-0000000030a3', 'Ned', 73001, 'test', now());

-- b1 live · b2 live, then hidden · b3 draft
insert into public.listings (id, owner_id, title, suburb_id, place_type, bathroom, weekly_price,
    bills_included, bond, furnished, availability_type, available_from)
  select ('00000000-0000-0000-0000-0000000030b' || i)::uuid, '00000000-0000-0000-0000-0000000030a1', 'Room near the wharf ' || i, 73001,
    'private_room', 'own', 270, true, 540, true, 'from_date', current_date
  from generate_series(1, 3) i;
insert into public.listing_private (listing_id, address_line, lat, lng)
  select id, '5 Wharf Rd', -20.6631, 116.7101 from public.listings where owner_id = '00000000-0000-0000-0000-0000000030a1';
insert into public.listing_photos (listing_id, storage_path, position, width, height)
  select l.id, l.id || '/' || i || '.jpg', i, 1600, 1200
  from public.listings l, generate_series(0, 2) i where l.owner_id = '00000000-0000-0000-0000-0000000030a1';
update public.listings set status = 'active', accuracy_declared_at = now()
  where id in ('00000000-0000-0000-0000-0000000030b1', '00000000-0000-0000-0000-0000000030b2');

-- ----- Saving -------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$insert into public.saved_listings (user_id, listing_id) values ('00000000-0000-0000-0000-0000000030a2', '00000000-0000-0000-0000-0000000030b1')$$,
  '42501', null, 'UC-005 a visitor cannot save without an account');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000030a2","role":"authenticated"}';
select lives_ok($$insert into public.saved_listings (user_id, listing_id) values ('00000000-0000-0000-0000-0000000030a2', '00000000-0000-0000-0000-0000000030b1')$$,
  'UC-005 the seeker saves a live listing');
select lives_ok($$insert into public.saved_listings (user_id, listing_id) values ('00000000-0000-0000-0000-0000000030a2', '00000000-0000-0000-0000-0000000030b2')$$,
  'and another');
select throws_ok($$insert into public.saved_listings (user_id, listing_id) values ('00000000-0000-0000-0000-0000000030a2', '00000000-0000-0000-0000-0000000030b3')$$,
  '42501', null, 'BR-LST-002 a draft cannot be saved');
select throws_ok($$insert into public.saved_listings (user_id, listing_id) values ('00000000-0000-0000-0000-0000000030a3', '00000000-0000-0000-0000-0000000030b1')$$,
  '42501', null, 'P-13 nobody saves for someone else');
select is((select count(*)::int from public.saved_listings), 2, 'P-13 the seeker reads their saved homes');
select is(jsonb_array_length(public.my_saved_listings()), 2, 'AC-005-1 "Saved homes" lists both');
select is(public.my_saved_listings() -> 0 ->> 'cover', '00000000-0000-0000-0000-0000000030b2/0.jpg', 'newest first, with its cover');
select ok(public.my_saved_listings()::text !~ 'Wharf Rd', 'BR-TRU-003 never the address');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000030a3","role":"authenticated"}';
select is((select count(*)::int from public.saved_listings), 0, 'P-13 another member reads none of them');
select is(public.my_saved_listings(), '[]'::jsonb, 'nor through my_saved_listings');
reset role;

-- ----- Status ------------------------------------------------------------------------------------
update public.listings set status = 'paused' where id = '00000000-0000-0000-0000-0000000030b1';
update public.listings set status = 'hidden', hidden_reason = 'Fake photos' where id = '00000000-0000-0000-0000-0000000030b2';
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000030a2","role":"authenticated"}';
select is((select x ->> 'status' from jsonb_array_elements(public.my_saved_listings()) x where x ->> 'id' = '00000000-0000-0000-0000-0000000030b1'),
  'paused', 'AC-005-2 a paused one shows with its status');
select is((select x - 'saved_at' from jsonb_array_elements(public.my_saved_listings()) x where x ->> 'id' = '00000000-0000-0000-0000-0000000030b2'),
  '{"id": "00000000-0000-0000-0000-0000000030b2", "title": "Room near the wharf 2", "status": "gone"}'::jsonb,
  'UC-005 E1 a hidden one shows as gone, with no photo, price or reason');
reset role;

select * from finish();
rollback;
