-- House rules check in the base (#23): BR-LST-005, BR-LST-006, through publish_listing and straight
-- writes to listings. The word lists themselves are held to core/text-checks.js by 26_discrimination_parity.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into public.suburbs (id, name, state, lat, lng, timezone) values
  (972301, 'Exmouth', 'WA', -21.9310, 114.1280, 'Australia/Perth');
insert into auth.users (id, email, email_confirmed_at, phone, phone_confirmed_at) values
  ('00000000-0000-0000-0000-0000000023a1', 'host23@example.com', now(), '61400000023', now());
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at, listing_limit) values
  ('00000000-0000-0000-0000-0000000023a1', 'Kai', 972301, 'test', now(), 10);

-- b1 rule that excludes · b2 own item that excludes · b3 rule asking for a transfer · b4 inclusive
insert into public.listings (id, owner_id, title, suburb_id, place_type, bathroom, weekly_price,
    bills_included, bond, furnished, availability_type, available_from, other_rules, custom_items)
  select ('00000000-0000-0000-0000-0000000023b' || i)::uuid, '00000000-0000-0000-0000-0000000023a1', 'Room by the gulf ' || i, 972301,
    'private_room', 'own', 250, true, 500, true, 'from_date', current_date, r, c
  from (values
    (1, 'Christians welcome, no Muslims', '{}'::text[]),
    (2, 'Quiet after 9pm', '{Girls only}'::text[]),
    (3, 'Pay the bond upfront by bank transfer', '{}'::text[]),
    (4, 'All nationalities and religions welcome. LGBTQ friendly household', '{Gym in the garage}'::text[])
  ) v(i, r, c);
insert into public.listing_private (listing_id, address_line, lat, lng)
  select id, '1 Gulf St', -21.9311, 114.1281 from public.listings where owner_id = '00000000-0000-0000-0000-0000000023a1';
insert into public.listing_photos (listing_id, storage_path, position, width, height)
  select l.id, l.id || '/' || i || '.jpg', i, 1600, 1200
  from public.listings l, generate_series(0, 2) i where l.owner_id = '00000000-0000-0000-0000-0000000023a1';

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000023a1","role":"authenticated"}';
select is(public.publish_listing('00000000-0000-0000-0000-0000000023b1', true),
  '{"ok": false, "reason": "missing", "missing": ["house_rules"]}'::jsonb,
  'BR-LST-005 a rule that excludes by religion is not published');
select is(public.publish_listing('00000000-0000-0000-0000-0000000023b2', true) -> 'missing', '["house_rules"]'::jsonb,
  'BR-LST-006 nor an own item that excludes by gender');
select is(public.publish_listing('00000000-0000-0000-0000-0000000023b3', true) -> 'missing', '["house_rules"]'::jsonb,
  'BR-LST-005 nor a rule asking for money up front (BR-MSG-008 check)');
select is(public.publish_listing('00000000-0000-0000-0000-0000000023b4', true) ->> 'ok', 'true',
  'BR-LST-005 inclusive wording goes live');
select is((select status from public.listings where id = '00000000-0000-0000-0000-0000000023b1'), 'draft',
  'the turned down listing stays a draft');

-- Once live, the host can't write an excluding rule in either, not even through the API.
select throws_ok($$update public.listings set other_rules = 'Aussies only please' where id = '00000000-0000-0000-0000-0000000023b4'$$,
  '23514', 'Listing is not ready to publish: house_rules', 'BR-LST-005 a live listing cannot take an excluding rule');
select throws_ok($$update public.listings set custom_items = '{No guys}' where id = '00000000-0000-0000-0000-0000000023b4'$$,
  '23514', 'Listing is not ready to publish: house_rules', 'BR-LST-006 nor an excluding own item');
select lives_ok($$update public.listings set other_rules = 'No smoking inside, quiet after 10pm' where id = '00000000-0000-0000-0000-0000000023b4'$$,
  'an ordinary rule is saved');
reset role;

select * from finish();
rollback;
