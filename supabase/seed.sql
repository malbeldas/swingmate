-- Local and CI only (BR-TRU-006, engineering-constitution.md §8). Never loaded into production.
-- A handful of suburbs so the profile step works before the ABS import (INT-006) exists.
-- Ids are placeholders, not ABS SAL codes; the import replaces this table.
insert into public.suburbs (id, name, state, postcode, lat, lng, timezone, is_city) values
  (90001, 'Perth', 'WA', '6000', -31.9523, 115.8613, 'Australia/Perth', true),
  (90002, 'Baldivis', 'WA', '6171', -32.3322, 115.8270, 'Australia/Perth', false),
  (90003, 'Rockingham', 'WA', '6168', -32.2810, 115.7300, 'Australia/Perth', false),
  (90004, 'Mandurah', 'WA', '6210', -32.5269, 115.7217, 'Australia/Perth', true),
  (90005, 'Karratha', 'WA', '6714', -20.7364, 116.8463, 'Australia/Perth', true),
  (90006, 'Kalgoorlie', 'WA', '6430', -30.7490, 121.4660, 'Australia/Perth', true),
  (90007, 'Port Hedland', 'WA', '6721', -20.3106, 118.6060, 'Australia/Perth', true),
  (90008, 'Joondalup', 'WA', '6027', -31.7448, 115.7661, 'Australia/Perth', false)
on conflict (id) do nothing;

-- Example listings for the search E2E tests (tests/e2e/search.spec.js). Local and CI only: never
-- loaded into production (BR-TRU-006). Dates are relative to the day the seed runs, in Perth.
-- Nobody can sign in as this host: it has no password.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'seed-host@example.test', now(), '61400000999', now(), '{"provider":"email","providers":["email"]}', '{}')
on conflict (id) do nothing;
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at, listing_limit)
values ('00000000-0000-0000-0000-00000000e001', 'Seed Host', 90002, 'seed', now(), 10)
on conflict (id) do nothing;

do $$
declare
  today date := (now() at time zone 'Australia/Perth')::date;
  host uuid := '00000000-0000-0000-0000-00000000e001';
  l record;
begin
  -- id, suburb, title, type, bathroom, price, offset from the suburb centre, rule, status
  for l in
    select * from (values
      ('00000000-0000-0000-0000-00000000f001'::uuid, 90002, 'Seed: room free every night', 'private_room', 'own', 250, 0.004, 'from_date', 'active'),
      ('00000000-0000-0000-0000-00000000f002'::uuid, 90003, 'Seed: entire place, one night taken', 'entire_place', 'own', 420, 0.003, 'from_date', 'active'),
      ('00000000-0000-0000-0000-00000000f003'::uuid, 90002, 'Seed: room free for half the stay', 'private_room', 'shared', 300, -0.004, 'ranges', 'active'),
      ('00000000-0000-0000-0000-00000000f004'::uuid, 90002, 'Seed: room free most of the stay', 'private_room', 'ensuite', 280, 0.006, 'ranges', 'active'),
      ('00000000-0000-0000-0000-00000000f005'::uuid, 90004, 'Seed: room in Mandurah', 'private_room', 'shared', 230, 0.002, 'from_date', 'active'),
      ('00000000-0000-0000-0000-00000000f006'::uuid, 90005, 'Seed: room in Karratha', 'private_room', 'shared', 350, 0.002, 'from_date', 'active'),
      ('00000000-0000-0000-0000-00000000f007'::uuid, 90002, 'Seed: draft never shown', 'private_room', 'own', 100, 0.001, 'from_date', 'draft')
    ) as t(id, suburb, title, place_type, bathroom, price, offset_deg, rule, status)
  loop
    insert into public.listings (id, owner_id, title, suburb_id, public_lat, public_lng, place_type, bathroom,
        weekly_price, bills_included, bond, furnished, availability_type, available_from, accuracy_declared_at)
      select l.id, host, l.title, s.id, s.lat + l.offset_deg, s.lng + l.offset_deg, l.place_type, l.bathroom,
        l.price, true, l.price * 2, true, l.rule, case when l.rule = 'from_date' then today - 30 end, now()
      from public.suburbs s where s.id = l.suburb
    on conflict (id) do nothing;
    insert into public.listing_private (listing_id, address_line, lat, lng)
      select l.id, 'Seed address', s.lat, s.lng from public.suburbs s where s.id = l.suburb
    on conflict (listing_id) do nothing;
    insert into public.listing_photos (listing_id, storage_path, position, width, height)
      select l.id, l.id || '/seed-' || i || '.jpg', i, 1600, 1200 from generate_series(0, 2) i
    on conflict do nothing;
  end loop;

  -- A 14-night stay from today + 7 (tests/e2e/search.spec.js):
  --   f001 free all 14 → Great; f002 one night taken → Good; f004 free 10 of 14 → Partial;
  --   f003 free 7 of 14 → Poor, never shown.
  insert into public.listing_availability_exceptions (listing_id, night, available)
    values ('00000000-0000-0000-0000-00000000f002', today + 10, false)
  on conflict do nothing;
  insert into public.listing_availability_ranges (listing_id, start_night, end_exclusive) values
    ('00000000-0000-0000-0000-00000000f003', today + 7, today + 14),
    ('00000000-0000-0000-0000-00000000f004', today + 7, today + 17);

  update public.listings set status = 'active', published_at = now()
    where owner_id = host and id <> '00000000-0000-0000-0000-00000000f007' and status = 'draft';
end $$;
