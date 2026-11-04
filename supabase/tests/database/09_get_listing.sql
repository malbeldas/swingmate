-- get_listing (schema.md §10, UC-003, P-06, BR-LST-002, BR-TRU-002/003, AC-003-1).
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into public.suburbs (id, name, state, lat, lng, timezone) values
  (71001, 'Sandy Bay', 'TAS', -42.8960, 147.3240, 'Australia/Hobart');
insert into auth.users (id, email, email_confirmed_at, phone, phone_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000d1', 'gus@example.com', now(), '61400000002', now()),
  ('00000000-0000-0000-0000-0000000000d2', 'ivy@example.com', now(), null, null);
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at) values
  ('00000000-0000-0000-0000-0000000000d1', 'Gus', 71001, 'test', now()),
  ('00000000-0000-0000-0000-0000000000d2', 'Ivy', 71001, 'test', now());
insert into public.rosters (user_id, days_on, days_off, anchor_date)
  values ('00000000-0000-0000-0000-0000000000d1', 8, 6, '2026-11-02');

insert into public.listings (id, owner_id, title, suburb_id, public_lat, public_lng, place_type, bathroom,
    weekly_price, bills_included, bond, furnished, availability_type, available_from, accuracy_declared_at)
  select ('00000000-0000-0000-0000-00000000d10' || i)::uuid, '00000000-0000-0000-0000-0000000000d1', 'Room by the river ' || i, 71001,
    -42.8950, 147.3230, 'private_room', 'own', 260, true, 520, true, 'from_date', '2026-01-01', now()
  from generate_series(1, 4) i;
insert into public.listing_private (listing_id, address_line, lat, lng)
  select id, '7 Secret Lane', -42.8971, 147.3251 from public.listings where owner_id = '00000000-0000-0000-0000-0000000000d1';
insert into public.listing_photos (listing_id, storage_path, position, width, height)
  select l.id, l.id || '/' || i || '.jpg', i, 1600, 1200
  from public.listings l, generate_series(0, 2) i where l.owner_id = '00000000-0000-0000-0000-0000000000d1';
-- 1 active, 2 paused, 3 hidden, 4 stays a draft.
update public.listings set status = 'active' where id::text like '%d10_' and id::text not like '%d104';
update public.listings set status = 'paused' where id = '00000000-0000-0000-0000-00000000d102';
update public.listings set status = 'hidden', hidden_reason = 'Test' where id = '00000000-0000-0000-0000-00000000d103';

set local role anon;
select is(public.get_listing('00000000-0000-0000-0000-00000000d101') ->> 'title', 'Room by the river 1', 'UC-003 anyone opens an active listing');
select is(char_length(public.get_listing('00000000-0000-0000-0000-00000000d101') ->> 'nights'), 84, 'BR-AVL-004 the detail has 84 nights');
select is(jsonb_array_length(public.get_listing('00000000-0000-0000-0000-00000000d101') -> 'photos'), 3, 'UC-003 the gallery has every photo');
select is(public.get_listing('00000000-0000-0000-0000-00000000d101')::text like '%Secret Lane%', false,
  'AC-003-1 the exact address never travels');
-- The public centre is now drawn at random near the address (BR-LST-004), so its digits can start
-- like the address's: compare the numbers, not the text.
select is(
  (select public.get_listing('00000000-0000-0000-0000-00000000d101')::text ~ '(gus@example|61400000002)'
       or (g ->> 'public_lat')::double precision = -42.8971 or (g ->> 'public_lng')::double precision = 147.3251
       or g::text ~ '"lat"|"lng"'
     from (select public.get_listing('00000000-0000-0000-0000-00000000d101') as g) x),
  false, 'BR-TRU-003 no exact coordinates, email or phone');
select is(public.get_listing('00000000-0000-0000-0000-00000000d101') -> 'host' ->> 'phone_verified', 'true', 'BR-TRU-002 phone verified host');
select is(public.get_listing('00000000-0000-0000-0000-00000000d101') -> 'host' -> 'roster_pattern', '{"days_on": 8, "days_off": 6}'::jsonb,
  'BR-TRU-002 the host roster pattern, never its dates');
select is(public.get_listing('00000000-0000-0000-0000-00000000d102') ->> 'status', 'paused', 'AC-003-4 a paused listing still opens by link');
select is(public.get_listing('00000000-0000-0000-0000-00000000d103'), null, 'UC-003 E1 a hidden listing is gone for others');
select is(public.get_listing('00000000-0000-0000-0000-00000000d104'), null, 'UC-003 E1 a draft is gone for others');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select is(public.get_listing('00000000-0000-0000-0000-00000000d104') ->> 'is_owner', 'true', 'BR-LST-008 the owner sees their own draft');
update public.listings set status = 'removed' where id = '00000000-0000-0000-0000-00000000d101';
select is(public.get_listing('00000000-0000-0000-0000-00000000d101'), null, 'UC-003 E1 a removed listing is gone, even for its owner');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated","app_metadata":{"role":"admin"}}';
select is(public.get_listing('00000000-0000-0000-0000-00000000d103') ->> 'status', 'hidden', 'P-10 an admin still opens a hidden listing');
reset role;

update public.profiles set status = 'suspended' where id = '00000000-0000-0000-0000-0000000000d1';
set local request.jwt.claims to '';
set local role anon;
select is(public.get_listing('00000000-0000-0000-0000-00000000d102'), null, 'A suspended host''s listings are gone for others');
reset role;

select * from finish();
rollback;
