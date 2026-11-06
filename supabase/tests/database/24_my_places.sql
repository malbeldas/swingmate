-- My places (#14): my_listings, confirm_calendar, the host's status changes and night exceptions.
-- UC-022, AC-022-1, AC-022-2, AC-022-3, BR-LST-002, BR-AVL-002, BR-AVL-006, P-08, P-10, P-12.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into public.suburbs (id, name, state, lat, lng, timezone) values
  (971401, 'Kununurra', 'WA', -15.7790, 128.7390, 'Australia/Perth');
-- 14a1 host · 14a2 another member
insert into auth.users (id, email, email_confirmed_at, phone, phone_confirmed_at) values
  ('00000000-0000-0000-0000-0000000014a1', 'host14@example.com', now(), '61400000014', now()),
  ('00000000-0000-0000-0000-0000000014a2', 'other14@example.com', now(), null, null);
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at) values
  ('00000000-0000-0000-0000-0000000014a1', 'Huw', 971401, 'test', now()),
  ('00000000-0000-0000-0000-0000000014a2', 'Ola', 971401, 'test', now());

-- One live listing free from today, one draft and one hidden by an admin.
insert into public.listings (id, owner_id, title, suburb_id, place_type, bathroom, weekly_price,
    bills_included, bond, furnished, availability_type, available_from)
  values
  ('00000000-0000-0000-0000-0000000014b1', '00000000-0000-0000-0000-0000000014a1', 'Room by the river', 971401,
    'private_room', 'own', 230, true, 460, true, 'from_date', current_date - 30),
  ('00000000-0000-0000-0000-0000000014b2', '00000000-0000-0000-0000-0000000014a1', 'Half done', 971401,
    null, null, null, null, null, null, null, null),
  ('00000000-0000-0000-0000-0000000014b3', '00000000-0000-0000-0000-0000000014a1', 'Hidden room', 971401,
    'private_room', 'own', 230, true, 460, true, 'from_date', current_date - 30);
insert into public.listing_private (listing_id, address_line, lat, lng)
  select id, '4 River Rd', -15.7791, 128.7391 from public.listings where id in ('00000000-0000-0000-0000-0000000014b1', '00000000-0000-0000-0000-0000000014b3');
insert into public.listing_photos (listing_id, storage_path, position, width, height)
  select l, l || '/' || i || '.jpg', i, 1600, 1200
  from unnest(array['00000000-0000-0000-0000-0000000014b1', '00000000-0000-0000-0000-0000000014b3']::uuid[]) l, generate_series(0, 2) i;
update public.listings set status = 'active', accuracy_declared_at = now()
  where id in ('00000000-0000-0000-0000-0000000014b1', '00000000-0000-0000-0000-0000000014b3');
update public.listings set status = 'hidden', hidden_reason = 'Photos of another home'
  where id = '00000000-0000-0000-0000-0000000014b3';
update public.listings set calendar_confirmed_at = now() - interval '40 days' where id = '00000000-0000-0000-0000-0000000014b1';

-- ----- The list -----------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000014a1","role":"authenticated"}';
select is(jsonb_array_length(public.my_listings()), 3, 'UC-022 the host sees their listings, drafts and hidden ones too');
select is((select x ->> 'hidden_reason' from jsonb_array_elements(public.my_listings()) x where x ->> 'id' = '00000000-0000-0000-0000-0000000014b3'),
  'Photos of another home', 'UC-022 E1 and reads why it was hidden');
select is((select x ->> 'hidden_reason' from jsonb_array_elements(public.my_listings()) x where x ->> 'id' = '00000000-0000-0000-0000-0000000014b1'),
  null, 'a listing that is not hidden carries no admin note');
select is((select length(x ->> 'nights') from jsonb_array_elements(public.my_listings()) x where x ->> 'id' = '00000000-0000-0000-0000-0000000014b1'),
  84, 'BR-AVL-004 with its next 84 nights');
select is((select x ->> 'cover' from jsonb_array_elements(public.my_listings()) x where x ->> 'id' = '00000000-0000-0000-0000-0000000014b1'),
  '00000000-0000-0000-0000-0000000014b1/0.jpg', 'and its cover photo');
select ok(public.my_listings()::text !~ 'River Rd', 'BR-TRU-003 never the address');
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000014a2","role":"authenticated"}';
select is(public.my_listings(), '[]'::jsonb, 'P-08 someone else sees none of them');
select is(public.confirm_calendar('00000000-0000-0000-0000-0000000014b1') ->> 'reason', 'not_found', 'nor confirms their calendar');
reset role;
set local role anon;
select throws_ok($$select public.my_listings()$$, '42501', null, 'a visitor cannot call my_listings');
reset role;

-- ----- Calendar ------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000014a1","role":"authenticated"}';
select is(public.confirm_calendar('00000000-0000-0000-0000-0000000014b1') ->> 'ok', 'true', 'BR-AVL-006 "My calendar is up to date"');
reset role;
select ok((select calendar_confirmed_at > now() - interval '1 minute' from public.listings where id = '00000000-0000-0000-0000-0000000014b1'),
  'BR-AVL-006 sets the date "Calendar updated" shows');

create temp table t as select public.listing_today('00000000-0000-0000-0000-0000000014b1') as today;
grant select on t to authenticated;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000014a1","role":"authenticated"}';
insert into public.listing_availability_exceptions (listing_id, night, available)
  values ('00000000-0000-0000-0000-0000000014b1', (select today + 3 from t), false);
select is(substr(public.get_listing('00000000-0000-0000-0000-0000000014b1') ->> 'nights', 1, 5), '11101',
  'AC-022-1 a blocked night is Unavailable at once, in the same nights search and the detail read');

-- ----- Status -----------------------------------------------------------------------------------
update public.listings set status = 'paused' where id = '00000000-0000-0000-0000-0000000014b1';
select is((select count(*)::int from public.search_listings(-15.7790, 128.7390, 15, null) where id = '00000000-0000-0000-0000-0000000014b1'), 0,
  'AC-022-2 a paused listing leaves the search');
select is(public.get_listing('00000000-0000-0000-0000-0000000014b1') ->> 'status', 'paused', 'AC-022-2 and still opens by link with its status');
select is(public.publish_listing('00000000-0000-0000-0000-0000000014b1', false) ->> 'ok', 'true', 'UC-022 Resume');
update public.listings set status = 'filled' where id = '00000000-0000-0000-0000-0000000014b1';
select is(public.publish_listing('00000000-0000-0000-0000-0000000014b1', false) ->> 'ok', 'true', 'UC-022 a filled listing is reactivated');
select throws_ok($$update public.listings set status = 'active' where id = '00000000-0000-0000-0000-0000000014b3'$$,
  '42501', null, 'AC-022-3 a listing hidden by an admin cannot be reactivated by its host');
select is(public.publish_listing('00000000-0000-0000-0000-0000000014b3', true) ->> 'reason', 'status',
  'AC-022-3 not through Publish either');
reset role;

select * from finish();
rollback;
