-- roles-permissions.md P-06 to P-12, the publishing constraint (schema.md §5, BR-LST-001/003/007),
-- BR-AVL-006 and search_listings (UC-001, BR-SRC-003, BR-TRU-003, AC-001-5, AC-001-7).
-- Places are in Tasmania so the local seed (around Perth) never lands inside a search here.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

insert into public.suburbs (id, name, state, lat, lng, timezone, is_city) values
  (70001, 'Hobart', 'TAS', -42.8821, 147.3272, 'Australia/Hobart', true),
  (70002, 'Sandy Bay', 'TAS', -42.8960, 147.3240, 'Australia/Hobart', false),
  (70003, 'Launceston', 'TAS', -41.4332, 147.1441, 'Australia/Hobart', true);

-- Hana hosts (ready profile, confirmed phone), Sam searches (ready), Nia has no ready profile.
insert into auth.users (id, email, email_confirmed_at, phone, phone_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'hana@example.com', now(), '61400000001', now()),
  ('00000000-0000-0000-0000-0000000000b2', 'sam@example.com', now(), null, null),
  ('00000000-0000-0000-0000-0000000000b3', 'nia@example.com', now(), null, null);
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'Hana', 70001, 'test', now()),
  ('00000000-0000-0000-0000-0000000000b2', 'Sam', 70001, 'test', now()),
  ('00000000-0000-0000-0000-0000000000b3', 'Nia', null, null, null);

-- ----- P-07 create -----
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select lives_ok(
  $$insert into public.listings (id, owner_id, title, suburb_id, place_type, bathroom, weekly_price,
      bills_included, bond, furnished, availability_type, available_from)
    values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000b1',
      'Quiet room near the bay', 70002, 'private_room', 'own', 280, true, 560, true, 'from_date', '2026-01-01')$$,
  'P-07 a member with a ready profile creates a draft'
);
select throws_ok(
  $$insert into public.listings (owner_id, title, status) values ('00000000-0000-0000-0000-0000000000b1', 'Straight to live', 'active')$$,
  '42501', null, 'P-07 a new listing cannot start active'
);
select throws_ok(
  $$insert into public.listings (owner_id, title) values ('00000000-0000-0000-0000-0000000000b2', 'Not mine at all')$$,
  '42501', null, 'P-07 a member cannot create a listing for someone else'
);
select lives_ok(
  $$insert into public.listing_private (listing_id, address_line, lat, lng)
    values ('00000000-0000-0000-0000-00000000c001', '1 Example St', -42.8970, 147.3250)$$,
  'P-11 the owner saves the exact address'
);
select lives_ok(
  $$insert into public.listing_photos (listing_id, storage_path, position, width, height) values
    ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c001/a.jpg', 0, 1600, 1200),
    ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c001/b.jpg', 1, 1600, 1200)$$,
  'P-12 the owner adds photos'
);
select throws_ok(
  $$insert into public.listing_photos (listing_id, storage_path, position, width, height)
    values ('00000000-0000-0000-0000-00000000c001', 'elsewhere/c.jpg', 2, 1600, 1200)$$,
  '23514', null, 'BR-PRV-002 a photo lives in its listing folder'
);
select throws_ok(
  $$update public.listings set status = 'active' where id = '00000000-0000-0000-0000-00000000c001'$$,
  '42501', null, 'P-09 the owner cannot set active without publish_listing'
);
select lives_ok(
  $$update public.listings set title = 'Quiet room by the bay' where id = '00000000-0000-0000-0000-00000000c001'$$,
  'P-08 the owner edits the draft'
);
select throws_ok(
  $$update public.listings set hidden_reason = 'x' where id = '00000000-0000-0000-0000-00000000c001'$$,
  '42501', null, 'P-10 only an admin writes the hidden reason'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}';
select throws_ok(
  $$insert into public.listings (owner_id, title) values ('00000000-0000-0000-0000-0000000000b3', 'No profile yet')$$,
  '42501', null, 'P-07 a member without a ready profile cannot create a listing'
);
reset role;

-- ----- P-06 / P-11 / P-12 reading -----
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
select is((select count(*) from public.listings)::int, 0, 'P-06 another member does not read listings from the table');
select is((select count(*) from public.listing_private)::int, 0, 'P-11 another member does not read the address');
select is((select count(*) from public.listing_photos)::int, 0, 'P-12 another member does not read photo rows');
select throws_ok(
  $$insert into public.listing_photos (listing_id, storage_path, position, width, height)
    values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c001/z.jpg', 5, 10, 10)$$,
  '42501', null, 'P-12 another member cannot add photos to my listing'
);
select is(public.listing_nights('00000000-0000-0000-0000-00000000c001', '2026-11-01', 7), null,
  'P-06 listing_nights says nothing about someone else''s draft');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated","app_metadata":{"role":"admin"}}';
select is((select count(*) from public.listing_private)::int, 0, 'P-11 admins do not read the address');
reset role;

set local role anon;
select throws_ok($$select id from public.listings$$, '42501', null, 'P-06 anon cannot read the table');
reset role;

-- ----- Publishing constraint -----
update public.listings set accuracy_declared_at = now(), public_lat = -42.8950, public_lng = 147.3230
  where id = '00000000-0000-0000-0000-00000000c001';
select throws_ok(
  $$update public.listings set status = 'active' where id = '00000000-0000-0000-0000-00000000c001'$$,
  '23514', 'Listing is not ready to publish: photos', 'BR-LST-001 publishing needs 3 photos'
);
insert into public.listing_photos (listing_id, storage_path, position, width, height)
  values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c001/c.jpg', 2, 1600, 1200);
update auth.users set phone_confirmed_at = null where id = '00000000-0000-0000-0000-0000000000b1';
select throws_ok(
  $$update public.listings set status = 'active' where id = '00000000-0000-0000-0000-00000000c001'$$,
  '23514', 'Listing is not ready to publish: verified_contact', 'BR-LST-003 publishing needs a confirmed phone'
);
update auth.users set phone_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000000b1';
select lives_ok(
  $$update public.listings set status = 'active', published_at = now() where id = '00000000-0000-0000-0000-00000000c001'$$,
  'BR-LST-001 a complete listing goes active'
);

-- A far listing (Launceston) and a draft next door, both from Hana.
insert into public.listings (id, owner_id, title, suburb_id, public_lat, public_lng, place_type, bathroom,
    weekly_price, bills_included, bond, furnished, availability_type, available_from, accuracy_declared_at)
  values
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000b1', 'Room in Launceston', 70003,
    -41.4340, 147.1450, 'private_room', 'shared', 200, true, 400, true, 'from_date', '2026-01-01', now()),
  ('00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-0000000000b1', 'Draft in Hobart', 70001,
    -42.8830, 147.3280, 'private_room', 'shared', 200, true, 400, true, 'from_date', '2026-01-01', now());
insert into public.listing_private (listing_id, address_line, lat, lng) values
  ('00000000-0000-0000-0000-00000000c002', '2 Example St', -41.4335, 147.1445);
insert into public.listing_photos (listing_id, storage_path, position, width, height)
  select '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000c002/' || i || '.jpg', i, 10, 10
  from generate_series(0, 2) i;
update public.profiles set listing_limit = 1 where id = '00000000-0000-0000-0000-0000000000b1';
select throws_ok(
  $$update public.listings set status = 'active' where id = '00000000-0000-0000-0000-00000000c002'$$,
  '23514', 'Listing limit reached', 'BR-LST-007 the listing limit holds'
);
update public.profiles set listing_limit = 5 where id = '00000000-0000-0000-0000-0000000000b1';
update public.listings set status = 'active' where id = '00000000-0000-0000-0000-00000000c002';

-- ----- BR-AVL-006 -----
update public.listings set calendar_confirmed_at = now() - interval '40 days'
  where id = '00000000-0000-0000-0000-00000000c001';
insert into public.listing_availability_exceptions (listing_id, night, available)
  values ('00000000-0000-0000-0000-00000000c001', current_date + 3, false);
select is((select calendar_confirmed_at from public.listings where id = '00000000-0000-0000-0000-00000000c001'), now(),
  'BR-AVL-006 an exception confirms the calendar');

-- ----- search_listings -----
set local role anon;
select is(
  array(select id::text from public.search_listings(-42.8821, 147.3272, 15) where id::text like '00000000-0000-0000-0000-00000000c%'),
  array['00000000-0000-0000-0000-00000000c001'],
  'AC-001-5 search returns active listings inside the radius only, never drafts'
);
select is(
  array(select id::text from public.search_listings(-41.4332, 147.1441, 15) where id::text like '00000000-0000-0000-0000-00000000c%'),
  array['00000000-0000-0000-0000-00000000c002'],
  'AC-001-5 search works in any state'
);
select is(
  (select count(*) from public.search_listings(-12.4634, 130.8456, 50))::int, 0,
  'AC-001-7 a place without listings returns nothing'
);
select is(
  (select char_length(nights) from public.search_listings(-42.8821, 147.3272, 15) where id = '00000000-0000-0000-0000-00000000c001'),
  84, 'BR-AVL-004 search returns 84 nights'
);
select is(
  (select row(suburb_name, cover_path, host_name, host_phone_verified)::text
     from public.search_listings(-42.8821, 147.3272, 15) where id = '00000000-0000-0000-0000-00000000c001'),
  row('Sandy Bay', '00000000-0000-0000-0000-00000000c001/a.jpg', 'Hana', true)::text,
  'search returns the card fields: suburb, cover photo and host'
);
select throws_ok($$select * from public.search_listings(-42.8821, 147.3272, 60)$$, '22023', null,
  'BR-SRC-003 the radius goes up to 50 km');
select is(public.listing_nights('00000000-0000-0000-0000-00000000c001', current_date, 7) is not null, true,
  'listing_nights answers for an active listing');
reset role;

select is(
  array(select a.parameter_name::text
        from information_schema.parameters a
        join information_schema.routines r on r.specific_name = a.specific_name
        where r.routine_schema = 'public' and r.routine_name = 'search_listings' and a.parameter_mode = 'OUT'
        order by a.ordinal_position),
  array['id', 'title', 'suburb_name', 'state', 'place_type', 'bathroom', 'weekly_price', 'bills_included',
        'furnished', 'public_lat', 'public_lng', 'distance_km', 'cover_path', 'host_name', 'host_photo_path',
        'host_phone_verified', 'nights'],
  'BR-TRU-003 search returns no address, email, phone or roster'
);

-- ----- P-10 hide, and a suspended host leaves the search -----
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated","app_metadata":{"role":"admin"}}';
select throws_ok(
  $$update public.listings set status = 'hidden' where id = '00000000-0000-0000-0000-00000000c002'$$,
  '23514', null, 'P-10 hiding a listing needs a note'
);
select lives_ok(
  $$update public.listings set status = 'hidden', hidden_reason = 'Test note' where id = '00000000-0000-0000-0000-00000000c002'$$,
  'P-10 an admin hides a listing with a note'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select throws_ok(
  $$update public.listings set title = 'Back again please' where id = '00000000-0000-0000-0000-00000000c002'$$,
  '42501', null, 'P-08 the owner cannot edit a hidden listing'
);
reset role;

update public.profiles set status = 'suspended' where id = '00000000-0000-0000-0000-0000000000b1';
set local role anon;
select is(
  (select count(*) from public.search_listings(-42.8821, 147.3272, 15) where id::text like '00000000-0000-0000-0000-00000000c%')::int, 0,
  'A suspended host''s listings leave the search'
);
reset role;

select * from finish();
rollback;
