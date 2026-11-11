-- admin_search, admin_person, admin_listing and admin_moderate (UC-041, AC-041-1, BR-ADM-001,
-- BR-ADM-004, P-23).
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

insert into public.suburbs (id, name, state, lat, lng, timezone) values
  (978101, 'Swansea', 'TAS', -42.1240, 148.0750, 'Australia/Hobart');
-- 61 host · 62 seeker · 63 admin · 64 another admin
insert into auth.users (id, email, email_confirmed_at, phone, phone_confirmed_at, created_at, raw_app_meta_data) values
  ('00000000-0000-0000-0000-000000000061', 'oyster.host@example.com', now(), '61400000061', now(), now() - interval '90 days', '{"provider":"email"}'),
  ('00000000-0000-0000-0000-000000000062', 'pip_seeker@example.com', now(), null, null, now() - interval '30 days', '{"provider":"email"}'),
  ('00000000-0000-0000-0000-000000000063', 'admin.one@example.com', now(), null, null, now() - interval '30 days', '{"role":"admin"}'),
  ('00000000-0000-0000-0000-000000000064', 'admin.two@example.com', now(), null, null, now() - interval '30 days', '{"role":"admin"}');
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at) values
  ('00000000-0000-0000-0000-000000000061', 'Odile', 978101, 'test', now()),
  ('00000000-0000-0000-0000-000000000062', 'Pip', 978101, 'test', now()),
  ('00000000-0000-0000-0000-000000000063', 'Una', 978101, 'test', now()),
  ('00000000-0000-0000-0000-000000000064', 'Vik', 978101, 'test', now());

insert into public.listings (id, owner_id, title, suburb_id, public_lat, public_lng, place_type, bathroom,
    weekly_price, bills_included, bond, furnished, availability_type, available_from, accuracy_declared_at)
  values ('00000000-0000-0000-0000-000000006101', '00000000-0000-0000-0000-000000000061', 'Oyster Bay cottage room', 978101,
    -42.1250, 148.0760, 'private_room', 'own', 230, true, 460, true, 'from_date', '2026-01-01', now());
insert into public.listing_private (listing_id, address_line, lat, lng)
  values ('00000000-0000-0000-0000-000000006101', '9 Esplanade', -42.1241, 148.0751);
insert into public.listing_photos (listing_id, storage_path, position, width, height)
  select '00000000-0000-0000-0000-000000006101', '00000000-0000-0000-0000-000000006101/' || i || '.jpg', i, 1600, 1200 from generate_series(0, 2) i;
update public.listings set status = 'active' where id = '00000000-0000-0000-0000-000000006101';

create temp table t (k text primary key, v jsonb);
grant all on t to authenticated;

-- Pip writes to Odile with a sentence that must never reach the admin search (AC-041-1), and
-- reports her.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000062","role":"authenticated"}';
select public.start_conversation('00000000-0000-0000-0000-000000006101', 'Secret plan: Oyster Bay pickup at dawn', current_date + 7, current_date + 14);
insert into public.reports (target_type, target_id, reason) values ('user', '00000000-0000-0000-0000-000000000061', 'unsafe');

-- Members can't use any of it.
select throws_ok($$select public.admin_search('Oyster')$$, '42501', 'admins only', 'BR-ADM-004 a member cannot search');
select throws_ok($$select public.admin_person('00000000-0000-0000-0000-000000000061')$$, '42501', 'admins only', 'BR-ADM-004 a member cannot open a record');
select throws_ok($$select public.admin_listing('00000000-0000-0000-0000-000000006101')$$, '42501', 'admins only',
  'BR-ADM-004 a member cannot open a listing record');
select throws_ok($$select public.admin_moderate('user', '00000000-0000-0000-0000-000000000062', 'grant_admin', 'Make me admin')$$,
  '42501', 'admins only', 'BR-ADM-004 a member cannot give themselves the admin role');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000063","role":"authenticated","app_metadata":{"role":"admin"}}';

-- Search (UC-041 step 1).
insert into t values ('s1', public.admin_search('oyster'));
insert into t values ('s2', public.admin_search('Swansea'));
insert into t values ('s3', public.admin_search('pip_'));
insert into t values ('s4', public.admin_search('%'));
select is((select jsonb_array_length(v -> 'people') from t where k = 's1'), 1, 'UC-041 a person is found by email');
select is((select v -> 'people' -> 0 ->> 'display_name' from t where k = 's1'), 'Odile', 'UC-041 the email match is Odile');
select is((select (v -> 'people' -> 0 ->> 'open_reports')::int from t where k = 's1'), 1, 'UC-041 the result counts her open reports');
select is((select v -> 'listings' -> 0 ->> 'title' from t where k = 's1'), 'Oyster Bay cottage room', 'UC-041 a listing is found by title');
select is((select v -> 'listings' -> 0 ->> 'title' from t where k = 's2'), 'Oyster Bay cottage room', 'UC-041 a listing is found by suburb');
select is((select v -> 'people' -> 0 ->> 'display_name' from t where k = 's3'), 'Pip', 'UC-041 underscores are matched literally');
select is((select jsonb_array_length(v -> 'people') + jsonb_array_length(v -> 'listings') from t where k = 's4'), 0,
  'UC-041 a lone % matches nothing (fewer than 2 characters)');
select is(public.admin_search('Ui') -> 'people', '[]'::jsonb, 'UC-041 a search with no match returns empty lists');
select ok((select position('Secret plan' in v::text) = 0 from t where k = 's1'), 'AC-041-1 the search never carries message content');
select is(jsonb_array_length(public.admin_search('Secret plan') -> 'people') + jsonb_array_length(public.admin_search('Secret plan') -> 'listings'), 0,
  'AC-041-1 message text is not searchable');

-- Records (UC-041 step 2).
insert into t values ('odile', public.admin_person('00000000-0000-0000-0000-000000000061'));
select is((select v ->> 'email' from t where k = 'odile'), 'oyster.host@example.com', 'UC-041 the record shows the email');
select is((select v ->> 'phone_verified' from t where k = 'odile'), 'true', 'UC-041 the record says the phone is verified');
select ok((select position('61400000061' in v::text) = 0 and position('Esplanade' in v::text) = 0 from t where k = 'odile'),
  'BR-TRU-003 the record carries neither the phone number nor the address');
select ok((select position('Secret plan' in v::text) = 0 from t where k = 'odile'), 'AC-041-1 the record never carries message content');
select is((select v -> 'listings' -> 0 ->> 'title' from t where k = 'odile'), 'Oyster Bay cottage room', 'UC-041 the record lists her listings');
select is((select v -> 'reports' -> 0 ->> 'reason' from t where k = 'odile'), 'unsafe', 'UC-041 the record lists reports about her');
insert into t values ('cottage', public.admin_listing('00000000-0000-0000-0000-000000006101'));
select is((select v ->> 'owner_name' from t where k = 'cottage'), 'Odile', 'UC-041 the listing record shows its host');
select ok((select position('Esplanade' in v::text) = 0 and position('Secret plan' in v::text) = 0 from t where k = 'cottage'),
  'AC-041-1 BR-TRU-003 the listing record carries neither the exact address nor message content');

-- Actions outside a report (UC-041 step 3).
select is(public.admin_moderate('user', '00000000-0000-0000-0000-000000000061', 'warn_user', ' '), '{"ok": false, "reason": "note"}'::jsonb,
  'BR-ADM-001 no action without a note');
select is(public.admin_moderate('user', '00000000-0000-0000-0000-000000000061', 'hide_listing', 'Wrong object'), '{"ok": false, "reason": "action"}'::jsonb,
  'BR-ADM-001 the action has to fit the object');
select is(public.admin_moderate('user', '00000000-0000-0000-0000-000000000061', 'suspend_user', 'Threatened a seeker on the phone'), '{"ok": true}'::jsonb,
  'UC-041 an admin suspends a person from her record');
select is(public.admin_moderate('user', '00000000-0000-0000-0000-000000000061', 'suspend_user', 'Twice'), '{"ok": false, "reason": "state"}'::jsonb,
  'UC-041 suspending twice is refused');
select is(public.admin_moderate('listing', '00000000-0000-0000-0000-000000006101', 'hide_listing', 'Host suspended'), '{"ok": true}'::jsonb,
  'UC-041 an admin hides a listing from its record');
select is(public.admin_moderate('listing', '00000000-0000-0000-0000-000000006101', 'unhide_listing', 'Reviewed, fine'), '{"ok": true}'::jsonb,
  'UC-041 and unhides it');
select is(public.admin_moderate('user', '00000000-0000-0000-0000-000000000061', 'unsuspend_user', 'Spoke with her, resolved'), '{"ok": true}'::jsonb,
  'UC-041 and lifts the suspension');
select is((select v -> 'log' -> 0 ->> 'admin_name' from (select public.admin_person('00000000-0000-0000-0000-000000000061') v) x), 'Una',
  'Issue #28 the log shows who did each action');
-- One transaction has one now(), so the order is checked in the unit tests (logEntries).
select set_eq(
  $$select e ->> 'action' as action, e ->> 'note' as note, (e ->> 'created_at') is not null as dated from jsonb_array_elements(public.admin_person('00000000-0000-0000-0000-000000000061') -> 'log') e$$,
  $$values ('unsuspend_user', 'Spoke with her, resolved', true), ('suspend_user', 'Threatened a seeker on the phone', true)$$,
  'Issue #28 the record shows each action with its date and note');

-- BR-ADM-004: the admin role.
select is(public.admin_moderate('user', '00000000-0000-0000-0000-000000000063', 'revoke_admin', 'Leaving myself'), '{"ok": false, "reason": "self"}'::jsonb,
  'BR-ADM-004 an admin cannot take away their own role');
select is(public.admin_moderate('user', '00000000-0000-0000-0000-000000000062', 'grant_admin', 'Pilot helper'), '{"ok": true}'::jsonb,
  'BR-ADM-004 an admin gives the role');
reset role;
select is((select raw_app_meta_data from auth.users where id = '00000000-0000-0000-0000-000000000062'),
  '{"role": "admin", "provider": "email"}'::jsonb, 'BR-ADM-004 the role lands in app_metadata, keeping the rest');
select is((select count(*)::int from public.moderation_actions where action = 'grant_admin' and target_id = '00000000-0000-0000-0000-000000000062'), 1,
  'BR-ADM-004 giving the role is logged');
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000064","role":"authenticated","app_metadata":{"role":"admin"}}';
select is(public.admin_moderate('user', '00000000-0000-0000-0000-000000000062', 'revoke_admin', 'Pilot over'), '{"ok": true}'::jsonb,
  'BR-ADM-004 another admin takes it away');

select * from finish();
rollback;
