-- The public circle and listing photos (#19): BR-LST-004, BR-TRU-003, AC-003-2, P-11, P-29,
-- SEC-15, SEC-17, SEC-18.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

create function pg_temp.km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371.0088 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))))
$$;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000019a1', 'host19@example.com', now()),
  ('00000000-0000-0000-0000-0000000019a2', 'other19@example.com', now()),
  ('00000000-0000-0000-0000-0000000019a3', 'admin19@example.com', now());
insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000019a1', 'Host'),
  ('00000000-0000-0000-0000-0000000019a2', 'Other'),
  ('00000000-0000-0000-0000-0000000019a3', 'Admin');
insert into public.listings (id, owner_id, title) values
  ('00000000-0000-0000-0000-0000000019b1', '00000000-0000-0000-0000-0000000019a1', 'Room near the lake'),
  ('00000000-0000-0000-0000-0000000019b2', '00000000-0000-0000-0000-0000000019a2', 'Someone else''s room');

-- ----- The circle is drawn by the base, not the browser -----------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000019a1","role":"authenticated"}';

select throws_ok(
  $$insert into public.listing_private (listing_id, address_line, lat, lng, offset_km, offset_bearing)
    values ('00000000-0000-0000-0000-0000000019b1', '12 Private St', -32.3290, 115.8310, 0.1, 0)$$,
  '42501', null, 'BR-LST-004 the browser cannot choose the offset');
select lives_ok(
  $$insert into public.listing_private (listing_id, address_line, lat, lng)
    values ('00000000-0000-0000-0000-0000000019b1', '12 Private St', -32.3290, 115.8310)$$,
  'P-11 the owner saves the exact address');
select throws_ok(
  $$update public.listings set public_lat = -32.3290, public_lng = 115.8310 where id = '00000000-0000-0000-0000-0000000019b1'$$,
  '42501', null, 'BR-LST-004 the browser cannot move the circle onto the house');
select throws_ok(
  $$update public.listing_private set offset_km = 0.1 where listing_id = '00000000-0000-0000-0000-0000000019b1'$$,
  '42501', null, 'BR-LST-004 nor change the offset afterwards');
select throws_ok(
  $$select public.unit_random()$$, '42501', null, 'the random source is not callable from the browser');
reset role;

select ok(
  (select pg_temp.km(p.lat, p.lng, l.public_lat, l.public_lng) between 0.1 - 1e-9 and 0.5
     from public.listings l join public.listing_private p on p.listing_id = l.id
    where l.id = '00000000-0000-0000-0000-0000000019b1'),
  'AC-003-2 the circle centre is less than 500 m from the address');
select ok(
  (select (l.public_lat, l.public_lng) <> (p.lat, p.lng)
     from public.listings l join public.listing_private p on p.listing_id = l.id
    where l.id = '00000000-0000-0000-0000-0000000019b1'),
  'AC-003-2 and it is not the address');

create temp table before_fix as
  select l.public_lat, l.public_lng, p.offset_km, p.offset_bearing
  from public.listings l join public.listing_private p on p.listing_id = l.id
  where l.id = '00000000-0000-0000-0000-0000000019b1';
grant select on before_fix to authenticated;

-- ----- Saving the address again ---------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000019a1","role":"authenticated"}';
update public.listing_private set address_line = '12 Private Street' where listing_id = '00000000-0000-0000-0000-0000000019b1';
select ok(
  (select (l.public_lat, l.public_lng) = (b.public_lat, b.public_lng)
     from public.listings l, before_fix b where l.id = '00000000-0000-0000-0000-0000000019b1'),
  'BR-LST-004 rewording the address leaves the circle where it was');
-- The host corrects the pin by about 2 km.
update public.listing_private set lat = -32.3110, lng = 115.8310 where listing_id = '00000000-0000-0000-0000-0000000019b1';
reset role;

select ok(
  (select (p.offset_km, p.offset_bearing) = (b.offset_km, b.offset_bearing)
     from public.listing_private p, before_fix b where p.listing_id = '00000000-0000-0000-0000-0000000019b1'),
  'BR-LST-004 the offset is drawn once and kept when the address changes');
select ok(
  (select abs(pg_temp.km(p.lat, p.lng, l.public_lat, l.public_lng) - p.offset_km) < 1e-6
     from public.listings l join public.listing_private p on p.listing_id = l.id
    where l.id = '00000000-0000-0000-0000-0000000019b1'),
  'BR-LST-004 the circle follows the corrected address by the same offset');
select ok(
  (select pg_temp.km(b.public_lat, b.public_lng, l.public_lat, l.public_lng) > 1.5
     from public.listings l, before_fix b where l.id = '00000000-0000-0000-0000-0000000019b1'),
  'BR-LST-004 so it never stays behind at the old address');

-- ----- Many draws ------------------------------------------------------------------------------
insert into public.listings (id, owner_id, title)
  select ('00000000-0000-0000-0019-' || lpad(i::text, 12, '0'))::uuid, '00000000-0000-0000-0000-0000000019a1', 'Draw ' || i
  from generate_series(1, 300) i;
insert into public.listing_private (listing_id, address_line, lat, lng)
  select ('00000000-0000-0000-0019-' || lpad(i::text, 12, '0'))::uuid, 'Draw St', -31.9523, 115.8613
  from generate_series(1, 300) i;
select is(
  (select count(*)::int from public.listings l join public.listing_private p on p.listing_id = l.id
    where l.title like 'Draw %'
      and pg_temp.km(p.lat, p.lng, l.public_lat, l.public_lng) >= 0.1 - 1e-9
      and pg_temp.km(p.lat, p.lng, l.public_lat, l.public_lng) < 0.5),
  300, 'AC-003-2 300 draws all land between 100 m and 500 m from the house');
select ok(
  (select count(distinct round(p.offset_bearing / 90)) >= 4 and count(distinct round(p.offset_km::numeric, 2)) > 20
     from public.listing_private p join public.listings l on l.id = p.listing_id where l.title like 'Draw %'),
  'BR-LST-004 the offsets spread over every direction and distance');

-- ----- Photos in Storage (P-29) -----------------------------------------------------------------
-- Supabase refuses a plain DELETE on storage.objects unless the Storage API marks the query as its
-- own; set that mark so the policies are what decides, as they do behind the API.
set local storage.allow_delete_query = 'true';
select ok((select public from storage.buckets where id = 'listing-photos'), 'schema.md §11 listing photos are public by URL');
select is((select file_size_limit from storage.buckets where id = 'listing-photos')::int, 5242880, 'SEC-15 up to 5 MB');
select is((select allowed_mime_types from storage.buckets where id = 'listing-photos'), array['image/jpeg', 'image/webp'],
  'SEC-15 and SEC-17 only JPEG or WebP');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000019a1","role":"authenticated"}';
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('listing-photos', '00000000-0000-0000-0000-0000000019b1/6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f.jpg', '00000000-0000-0000-0000-0000000019a1')$$,
  'P-29 the owner uploads a photo into their listing''s folder');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('listing-photos', '00000000-0000-0000-0000-0000000019b1/12 Private St.jpg', '00000000-0000-0000-0000-0000000019a1')$$,
  '42501', null, 'SEC-18 a file keeps a generated name, never its own');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('listing-photos', '00000000-0000-0000-0000-0000000019b2/6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e40.jpg', '00000000-0000-0000-0000-0000000019a1')$$,
  '42501', null, 'P-29 nobody uploads into someone else''s listing');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000019a2","role":"authenticated"}';
delete from storage.objects where bucket_id = 'listing-photos' and name like '00000000-0000-0000-0000-0000000019b1/%';
reset role;
select is((select count(*)::int from storage.objects where bucket_id = 'listing-photos' and name like '00000000-0000-0000-0000-0000000019b1/%'),
  1, 'P-29 nor deletes its photos');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000019a3","role":"authenticated","app_metadata":{"role":"admin"}}';
select lives_ok(
  $$delete from storage.objects where bucket_id = 'listing-photos' and name like '00000000-0000-0000-0000-0000000019b1/%'$$,
  'P-29 an admin removes a photo from any listing');
reset role;
select is((select count(*)::int from storage.objects where bucket_id = 'listing-photos' and name like '00000000-0000-0000-0000-0000000019b1/%'),
  0, 'P-29 and it is gone');

select * from finish();
rollback;
