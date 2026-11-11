-- notification_log keeps every send of the emails that go again about the same thing (NTF-003,
-- NTF-006, NTF-007) and still refuses a second send of the ones that go once (notifications.md
-- rule 7, BR-MAIL-001). Retroactive risk review, 11/11.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into public.suburbs (id, name, state, lat, lng, timezone) values
  (977101, 'Sandy Bay', 'TAS', -42.9000, 147.3300, 'Australia/Hobart');
insert into auth.users (id, email, email_confirmed_at, phone, phone_confirmed_at, created_at) values
  ('00000000-0000-0000-0000-0000000036a1', 'logrepeat@example.com', now(), '61400036001', now(), now() - interval '120 days');
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at) values
  ('00000000-0000-0000-0000-0000000036a1', 'Lou', 977101, 'test', now());
insert into public.listings (id, owner_id, title, suburb_id, public_lat, public_lng, place_type, bathroom,
    weekly_price, bills_included, bond, furnished, availability_type, available_from, accuracy_declared_at)
  values ('00000000-0000-0000-0000-0000000036b1', '00000000-0000-0000-0000-0000000036a1', 'Room by the river', 977101,
    -42.9010, 147.3310, 'private_room', 'own', 230, true, 460, true, 'from_date', '2026-01-01', now());
insert into public.listing_private (listing_id, address_line, lat, lng)
  values ('00000000-0000-0000-0000-0000000036b1', '9 River St', -42.9001, 147.3301);
insert into public.listing_photos (listing_id, storage_path, position, width, height)
  select '00000000-0000-0000-0000-0000000036b1', '00000000-0000-0000-0000-0000000036b1/' || i || '.jpg', i, 1600, 1200 from generate_series(0, 2) i;
update public.listings set status = 'active' where id = '00000000-0000-0000-0000-0000000036b1';
update public.listings set calendar_confirmed_at = now() - interval '70 days' where id = '00000000-0000-0000-0000-0000000036b1';

-- ----- The emails that go again ---------------------------------------------------------------
insert into public.notification_log (user_id, template, ref_id, status, created_at)
  values ('00000000-0000-0000-0000-0000000036a1', 'NTF-003', '00000000-0000-0000-0000-0000000036c1', 'sent', now() - interval '2 hours');
select lives_ok($$insert into public.notification_log (user_id, template, ref_id, status)
    values ('00000000-0000-0000-0000-0000000036a1', 'NTF-003', '00000000-0000-0000-0000-0000000036c1', 'sent')$$,
  'NTF-003 a second email about the same conversation is logged');

insert into public.notification_log (user_id, template, ref_id, status, created_at)
  values ('00000000-0000-0000-0000-0000000036a1', 'NTF-007', '00000000-0000-0000-0000-0000000036d1', 'sent', now() - interval '1 day');
select lives_ok($$insert into public.notification_log (user_id, template, ref_id, status)
    values ('00000000-0000-0000-0000-0000000036a1', 'NTF-007', '00000000-0000-0000-0000-0000000036d1', 'sent')$$,
  'NTF-007 the next day''s digest of the same alert is logged');

-- NTF-006: the first check went 40 days ago, so the listing is due again.
insert into public.notification_log (user_id, template, ref_id, status, created_at)
  values ('00000000-0000-0000-0000-0000000036a1', 'NTF-006', '00000000-0000-0000-0000-0000000036b1', 'sent', now() - interval '40 days');
select ok(exists (select 1 from jsonb_array_elements(public.pending_calendar_checks()) r
    where r ->> 'listing_id' = '00000000-0000-0000-0000-0000000036b1'),
  'NTF-006 30 days after the first check, the listing is due again');
select lives_ok($$insert into public.notification_log (user_id, template, ref_id, status)
    values ('00000000-0000-0000-0000-0000000036a1', 'NTF-006', '00000000-0000-0000-0000-0000000036b1', 'sent')$$,
  'NTF-006 the second check about the same listing is logged');
select ok(not exists (select 1 from jsonb_array_elements(public.pending_calendar_checks()) r
    where r ->> 'listing_id' = '00000000-0000-0000-0000-0000000036b1'),
  'NTF-006 once the second check is logged, the listing is not emailed again the next day');

-- ----- The emails that go once ------------------------------------------------------------------
insert into public.notification_log (user_id, template, ref_id, status)
  values ('00000000-0000-0000-0000-0000000036a1', 'NTF-009', '00000000-0000-0000-0000-0000000036e1', 'sent');
select throws_ok($$insert into public.notification_log (user_id, template, ref_id, status)
    values ('00000000-0000-0000-0000-0000000036a1', 'NTF-009', '00000000-0000-0000-0000-0000000036e1', 'sent')$$,
  '23505', null, 'BR-MAIL-001 the same report email can''t be logged twice for the same admin');
select lives_ok($$insert into public.notification_log (user_id, template, ref_id, status)
    values ('00000000-0000-0000-0000-0000000036a1', 'NTF-009', '00000000-0000-0000-0000-0000000036e1', 'failed')$$,
  'notifications.md rule 6 failed tries are still logged');

select * from finish();
rollback;
