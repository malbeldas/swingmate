-- Publishing a listing (#13): publish_listing and my_listing, UC-020 step 7, BR-LST-001,
-- BR-LST-003, BR-LST-007, BR-AVL-006, P-09, P-11.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into public.suburbs (id, name, state, lat, lng, timezone) values
  (71301, 'Kalamunda', 'WA', -31.9740, 116.0580, 'Australia/Perth');
-- 13a1 host, phone and email confirmed · 13a2 another member · 13a3 host with no phone
insert into auth.users (id, email, email_confirmed_at, phone, phone_confirmed_at) values
  ('00000000-0000-0000-0000-0000000013a1', 'host13@example.com', now(), '61400000013', now()),
  ('00000000-0000-0000-0000-0000000013a2', 'other13@example.com', now(), null, null),
  ('00000000-0000-0000-0000-0000000013a3', 'nophone13@example.com', now(), null, null);
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at) values
  ('00000000-0000-0000-0000-0000000013a1', 'Hana', 71301, 'test', now()),
  ('00000000-0000-0000-0000-0000000013a2', 'Otto', 71301, 'test', now()),
  ('00000000-0000-0000-0000-0000000013a3', 'Nell', 71301, 'test', now());

-- A complete draft for 13a1 and a half-finished one for 13a3, written the way the wizard writes them.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000013a1","role":"authenticated"}';
insert into public.listings (id, owner_id, title, suburb_id, place_type, bathroom, weekly_price,
    bills_included, bond, furnished, availability_type, available_from)
  values ('00000000-0000-0000-0000-0000000013b1', '00000000-0000-0000-0000-0000000013a1', 'Room in the hills', 71301,
    'private_room', 'own', 260, true, 520, true, 'from_date', '2026-01-01');
insert into public.listing_private (listing_id, address_line, lat, lng)
  values ('00000000-0000-0000-0000-0000000013b1', '3 Hidden Rd', -31.9741, 116.0581);
insert into public.listing_photos (listing_id, storage_path, position, width, height)
  select '00000000-0000-0000-0000-0000000013b1', '00000000-0000-0000-0000-0000000013b1/' || i || '.jpg', i, 1600, 1200
  from generate_series(0, 2) i;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000013a3","role":"authenticated"}';
insert into public.listings (id, owner_id, title, suburb_id)
  values ('00000000-0000-0000-0000-0000000013b3', '00000000-0000-0000-0000-0000000013a3', 'Half a draft', 71301);

-- ----- Who may publish --------------------------------------------------------------------------
select throws_ok(
  $$update public.listings set status = 'active' where id = '00000000-0000-0000-0000-0000000013b3'$$,
  '42501', null, 'P-09 the browser cannot set a listing to active');
select throws_ok(
  $$update public.listings set accuracy_declared_at = now() where id = '00000000-0000-0000-0000-0000000013b3'$$,
  '42501', null, 'BR-LST-003 nor write the accuracy statement');
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000013a2","role":"authenticated"}';
select is(public.publish_listing('00000000-0000-0000-0000-0000000013b1', true) ->> 'reason', 'not_found',
  'P-09 another member cannot publish someone else''s listing');
select is(public.my_listing('00000000-0000-0000-0000-0000000013b1'), null,
  'P-11 nor read its draft and address');
reset role;
set local role anon;
select throws_ok($$select public.publish_listing('00000000-0000-0000-0000-0000000013b1', true)$$,
  '42501', null, 'a visitor cannot call publish_listing');
select throws_ok($$select public.my_listing('00000000-0000-0000-0000-0000000013b1')$$,
  '42501', null, 'nor my_listing');
reset role;

-- ----- What is missing --------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000013a3","role":"authenticated"}';
select is(public.publish_listing('00000000-0000-0000-0000-0000000013b3', true),
  '{"ok": false, "reason": "missing", "missing": ["public_circle", "place_type", "bathroom", "weekly_price", "bills_included", "bond", "furnished", "availability", "address", "photos", "verified_contact"]}'::jsonb,
  'BR-LST-001 a half-finished draft names every field it still needs, the verified phone too');
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000013a1","role":"authenticated"}';
select is(public.publish_listing('00000000-0000-0000-0000-0000000013b1', false),
  '{"ok": false, "reason": "missing", "missing": ["accuracy_declared_at"]}'::jsonb,
  'BR-LST-003 a draft does not go live without the accuracy statement');
select is((select status::text from public.listings where id = '00000000-0000-0000-0000-0000000013b1'), 'draft',
  'BR-LST-001 and it stays a draft');

-- ----- The host's own draft (my_listing) -------------------------------------------------------
select is(public.my_listing('00000000-0000-0000-0000-0000000013b1') -> 'address',
  '{"line": "3 Hidden Rd", "lat": -31.9741, "lng": 116.0581}'::jsonb,
  'P-11 the owner reads back the exact address of their draft');
select is(jsonb_array_length(public.my_listing('00000000-0000-0000-0000-0000000013b1') -> 'photos'), 3,
  'UC-020 "Save and finish later" brings back the photos');
select ok(not (public.my_listing('00000000-0000-0000-0000-0000000013b1') -> 'listing' ? 'owner_id'),
  'my_listing leaves out the owner id and the admin note');

-- ----- Publishing --------------------------------------------------------------------------------
select is(public.publish_listing('00000000-0000-0000-0000-0000000013b1', true), '{"ok": true}'::jsonb,
  'UC-020 step 7 a complete draft with the statement is published');
reset role;
select is(
  (select row(status::text, accuracy_declared_at is not null, calendar_confirmed_at is not null, published_at is not null)::text
     from public.listings where id = '00000000-0000-0000-0000-0000000013b1'),
  row('active', true, true, true)::text,
  'BR-LST-003 BR-AVL-006 it is active, with the statement, the calendar confirmed and published_at');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000013a1","role":"authenticated"}';
select is(public.publish_listing('00000000-0000-0000-0000-0000000013b1', true), '{"ok": true}'::jsonb,
  'publishing twice is harmless');
update public.listings set status = 'paused' where id = '00000000-0000-0000-0000-0000000013b1';
select is(public.publish_listing('00000000-0000-0000-0000-0000000013b1', false), '{"ok": true}'::jsonb,
  'BR-LST-003 a paused listing comes back without making the statement again');
update public.listings set status = 'removed' where id = '00000000-0000-0000-0000-0000000013b1';
select is(public.publish_listing('00000000-0000-0000-0000-0000000013b1', true) ->> 'reason', 'status',
  'BR-LST-002 a removed listing does not go live from here');
reset role;

-- ----- Limit and suspension ---------------------------------------------------------------------
update public.listings set status = 'paused' where id = '00000000-0000-0000-0000-0000000013b1';
update public.profiles set listing_limit = 1 where id = '00000000-0000-0000-0000-0000000013a1';
insert into public.listings (id, owner_id, title, suburb_id, place_type, bathroom, weekly_price,
    bills_included, bond, furnished, availability_type, available_from)
  values ('00000000-0000-0000-0000-0000000013b2', '00000000-0000-0000-0000-0000000013a1', 'Second room', 71301,
    'private_room', 'shared', 200, true, 400, true, 'from_date', '2026-01-01');
insert into public.listing_private (listing_id, address_line, lat, lng)
  values ('00000000-0000-0000-0000-0000000013b2', '3 Hidden Rd', -31.9741, 116.0581);
insert into public.listing_photos (listing_id, storage_path, position, width, height)
  select '00000000-0000-0000-0000-0000000013b2', '00000000-0000-0000-0000-0000000013b2/' || i || '.jpg', i, 1600, 1200
  from generate_series(0, 2) i;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000013a1","role":"authenticated"}';
select is(public.publish_listing('00000000-0000-0000-0000-0000000013b2', true) ->> 'reason', 'limit',
  'BR-LST-007 a host at their limit is told so');
reset role;
update public.profiles set status = 'suspended', listing_limit = 5 where id = '00000000-0000-0000-0000-0000000013a1';
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000013a1","role":"authenticated"}';
select is(public.publish_listing('00000000-0000-0000-0000-0000000013b2', true) ->> 'reason', 'suspended',
  'BR-MSG-006 a suspended account cannot publish');
reset role;

select * from finish();
rollback;
