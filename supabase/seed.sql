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
-- The host signs in only in the local and CI auth, with the password in tests/e2e/auth-helpers.js
-- (SEED_HOST), so the inbox E2E can play the host (UC-023). The empty token columns are what
-- Supabase Auth expects of a user it did not create itself.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, phone, phone_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'seed-host@example.test', extensions.crypt('seed-host-local-only', extensions.gen_salt('bf')), now(), '61400000999', now(),
        '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000e001',
        '{"sub":"00000000-0000-0000-0000-00000000e001","email":"seed-host@example.test","email_verified":true}', 'email', now(), now(), now())
on conflict do nothing;
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at, listing_limit)
values ('00000000-0000-0000-0000-00000000e001', 'Seed Host', 90002, 'seed', now(), 10)
on conflict (id) do nothing;

-- An admin for the moderation E2E (UC-040), local and CI only, with the password in
-- tests/e2e/auth-helpers.js (SEED_ADMIN). In production the first admin is set by hand (BR-ADM-004).
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-00000000ad01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'seed-admin@example.test', extensions.crypt('seed-admin-local-only', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"],"role":"admin"}', '{}', now(), now(), '', '', '', '', '', '', '', '')
on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values ('00000000-0000-0000-0000-00000000ad01', '00000000-0000-0000-0000-00000000ad01', '00000000-0000-0000-0000-00000000ad01',
        '{"sub":"00000000-0000-0000-0000-00000000ad01","email":"seed-admin@example.test","email_verified":true}', 'email', now(), now(), now())
on conflict do nothing;
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at)
values ('00000000-0000-0000-0000-00000000ad01', 'Seed Admin', 90001, 'seed', now())
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
      ('00000000-0000-0000-0000-00000000f007'::uuid, 90002, 'Seed: draft never shown', 'private_room', 'own', 100, 0.001, 'from_date', 'draft'),
      ('00000000-0000-0000-0000-00000000f008'::uuid, 90002, 'Seed: paused by the host', 'private_room', 'own', 240, -0.002, 'from_date', 'paused')
    ) as t(id, suburb, title, place_type, bathroom, price, offset_deg, rule, status)
  loop
    insert into public.listings (id, owner_id, title, suburb_id, public_lat, public_lng, place_type, bathroom,
        weekly_price, bills_included, bond, furnished, availability_type, available_from, accuracy_declared_at)
      select l.id, host, l.title, s.id, s.lat + l.offset_deg, s.lng + l.offset_deg, l.place_type, l.bathroom,
        l.price, true, l.price * 2, true, l.rule, case when l.rule = 'from_date' then today - 30 end, now()
      from public.suburbs s where s.id = l.suburb
    on conflict (id) do nothing;
    insert into public.listing_private (listing_id, address_line, lat, lng)
      select l.id, 'Seed address 1 Private St', s.lat - 0.0031, s.lng + 0.0027 from public.suburbs s where s.id = l.suburb
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
    where owner_id = host and id not in ('00000000-0000-0000-0000-00000000f007', '00000000-0000-0000-0000-00000000f008') and status = 'draft';
  -- f008 is paused: not in the search, but its link opens with a label (AC-003-4).
  update public.listings set status = 'paused', published_at = now()
    where id = '00000000-0000-0000-0000-00000000f008' and status = 'draft';
end $$;
