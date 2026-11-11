-- The daily cleanup (BR-PRV-003, infrastructure.md §4): cleanup_run, cleanup_orphan_files, the
-- moderation log's only exception (BR-ADM-001) and delete_account's analytics and email log
-- (schema.md analytics_events.user_id). Retroactive risk review, 11/11.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into public.suburbs (id, name, state, lat, lng, timezone) values
  (973801, 'Tom Price', 'WA', -22.6939, 117.7932, 'Australia/Perth');
-- 38a1 host · 38a2 seeker
insert into auth.users (id, email, email_confirmed_at, phone, phone_confirmed_at, created_at) values
  ('00000000-0000-0000-0000-0000000038a1', 'host38@example.com', now(), '61400000038', now(), now() - interval '400 days'),
  ('00000000-0000-0000-0000-0000000038a2', 'seeker38@example.com', now(), null, null, now() - interval '400 days');
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at, photo_path) values
  ('00000000-0000-0000-0000-0000000038a1', 'Cy', 973801, 'test', now(), '00000000-0000-0000-0000-0000000038a1/00000000-0000-0000-0000-0000000038f1.jpg'),
  ('00000000-0000-0000-0000-0000000038a2', 'Di', 973801, 'test', now(), null);

-- b1 removed 100 days ago · b2 removed 10 days ago · b3 active · b4 removed 100 days ago, with an
-- open report about its conversation
insert into public.listings (id, owner_id, title, suburb_id, public_lat, public_lng, place_type, bathroom, weekly_price,
    bills_included, bond, furnished, availability_type, available_from, accuracy_declared_at)
  select ('00000000-0000-0000-0000-0000000038b' || i)::uuid, '00000000-0000-0000-0000-0000000038a1', 'Room ' || i, 973801,
    -22.6940, 117.7933, 'private_room', 'own', 240, true, 480, true, 'from_date', current_date - 200, now()
  from generate_series(1, 4) i;
insert into public.listing_private (listing_id, address_line, lat, lng)
  select ('00000000-0000-0000-0000-0000000038b' || i)::uuid, i || ' Iron St', -22.6939, 117.7932 from generate_series(1, 4) i;
insert into public.listing_photos (listing_id, storage_path, position, width, height)
  select ('00000000-0000-0000-0000-0000000038b' || i)::uuid, '00000000-0000-0000-0000-0000000038b' || i || '/' || p || '.jpg', p, 1600, 1200
  from generate_series(1, 4) i, generate_series(0, 2) p;
update public.listings set status = 'active' where id::text like '00000000-0000-0000-0000-0000000038b%';
update public.listings set status = 'removed' where id in ('00000000-0000-0000-0000-0000000038b1', '00000000-0000-0000-0000-0000000038b2', '00000000-0000-0000-0000-0000000038b4');
update public.listings set removed_at = now() - interval '100 days' where id in ('00000000-0000-0000-0000-0000000038b1', '00000000-0000-0000-0000-0000000038b4');
update public.listings set removed_at = now() - interval '10 days' where id = '00000000-0000-0000-0000-0000000038b2';
insert into public.conversations (id, listing_id, seeker_id, host_id, stay_from, stay_to, created_at, last_message_at)
  values ('00000000-0000-0000-0000-0000000038c1', '00000000-0000-0000-0000-0000000038b1', '00000000-0000-0000-0000-0000000038a2',
    '00000000-0000-0000-0000-0000000038a1', current_date - 150, current_date - 143, now() - interval '160 days', now() - interval '160 days'),
  ('00000000-0000-0000-0000-0000000038c4', '00000000-0000-0000-0000-0000000038b4', '00000000-0000-0000-0000-0000000038a2',
    '00000000-0000-0000-0000-0000000038a1', current_date - 150, current_date - 143, now() - interval '160 days', now() - interval '160 days');
insert into public.listing_availability_exceptions (listing_id, night, available) values
  ('00000000-0000-0000-0000-0000000038b3', current_date - 10, false),
  ('00000000-0000-0000-0000-0000000038b3', current_date + 10, false);
update public.listings set calendar_confirmed_at = now() - interval '40 days' where id = '00000000-0000-0000-0000-0000000038b3';

-- Reports: r1 closed 3 years ago · r2 closed last month · r3 open since 3 years ago. Written as
-- they would be after years of use, so without the insert trigger (it needs a signed-in member).
set local session_replication_role = replica;
insert into public.reports (id, reporter_id, target_type, target_id, reason, details, status, closed_at, created_at) values
  ('00000000-0000-0000-0000-0000000038e1', '00000000-0000-0000-0000-0000000038a2', 'user', '00000000-0000-0000-0000-0000000038a1', 'scam', 'Asked for a bond by transfer', 'closed', now() - interval '3 years', now() - interval '3 years 1 day'),
  ('00000000-0000-0000-0000-0000000038e2', '00000000-0000-0000-0000-0000000038a2', 'user', '00000000-0000-0000-0000-0000000038a1', 'spam', 'Same message twice', 'closed', now() - interval '1 month', now() - interval '2 months'),
  ('00000000-0000-0000-0000-0000000038e3', '00000000-0000-0000-0000-0000000038a2', 'user', '00000000-0000-0000-0000-0000000038a1', 'other', 'Still looking', 'open', null, now() - interval '3 years'),
  ('00000000-0000-0000-0000-0000000038e4', '00000000-0000-0000-0000-0000000038a2', 'conversation', '00000000-0000-0000-0000-0000000038c4', 'unsafe', 'Read this one', 'open', null, now() - interval '5 days');
set local session_replication_role = origin;
insert into public.moderation_actions (id, admin_id, action, target_type, target_id, report_id, note, created_at) values
  ('00000000-0000-0000-0000-0000000038d1', '00000000-0000-0000-0000-0000000038a2', 'warn_user', 'user', '00000000-0000-0000-0000-0000000038a1', '00000000-0000-0000-0000-0000000038e1', 'Warned about the bond', now() - interval '3 years'),
  ('00000000-0000-0000-0000-0000000038d2', '00000000-0000-0000-0000-0000000038a2', 'dismiss', 'user', '00000000-0000-0000-0000-0000000038a1', '00000000-0000-0000-0000-0000000038e2', 'Nothing to do', now() - interval '1 month');
insert into public.phone_code_events (phone_hash, user_id, kind, created_at) values
  ('old', '00000000-0000-0000-0000-0000000038a2', 'sent', now() - interval '3 days'),
  ('new', '00000000-0000-0000-0000-0000000038a2', 'sent', now() - interval '1 hour');

-- Storage: the photos of b1 and b3, a wizard upload nobody saved (old and fresh), and the avatar.
insert into storage.objects (bucket_id, name, created_at)
  select 'listing-photos', '00000000-0000-0000-0000-0000000038b' || i || '/' || p || '.jpg', now() - interval '120 days'
  from unnest(array[1, 3]) i, generate_series(0, 2) p;
insert into storage.objects (bucket_id, name, created_at) values
  ('listing-photos', '00000000-0000-0000-0000-0000000038b9/draft.jpg', now() - interval '3 days'),
  ('listing-photos', '00000000-0000-0000-0000-0000000038b9/today.jpg', now() - interval '1 hour'),
  ('avatars', '00000000-0000-0000-0000-0000000038a1/00000000-0000-0000-0000-0000000038f1.jpg', now() - interval '30 days'),
  ('avatars', '00000000-0000-0000-0000-0000000038a1/00000000-0000-0000-0000-0000000038f0.jpg', now() - interval '30 days');

-- ----- Only the cleanup function calls them ------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.cleanup_run(timestamptz)', 'execute'), 'a member can''t run the cleanup');
select ok(not has_function_privilege('anon', 'public.cleanup_orphan_files(timestamptz, int)', 'execute'), 'a visitor can''t list files');

create temp table t (k text primary key, v jsonb);
insert into t values ('run', public.cleanup_run());

-- ----- BR-PRV-003: removed listings after 90 days ------------------------------------------------
select ok(not exists (select 1 from public.listings where id = '00000000-0000-0000-0000-0000000038b1'),
  'BR-PRV-003 a listing removed 100 days ago is deleted');
select ok(not exists (select 1 from public.conversations where id = '00000000-0000-0000-0000-0000000038c1'), 'with its conversations');
select ok(not exists (select 1 from public.listing_photos where listing_id = '00000000-0000-0000-0000-0000000038b1'), 'and its photo rows');
select ok(exists (select 1 from public.listings where id = '00000000-0000-0000-0000-0000000038b2'), 'one removed 10 days ago stays');
select ok(exists (select 1 from public.listings where id = '00000000-0000-0000-0000-0000000038b3'), 'an active one stays');
select ok(exists (select 1 from public.conversations where id = '00000000-0000-0000-0000-0000000038c4'),
  'BR-ACC-007 BR-ADM-002 one with an open report about its conversation waits, so the admin can still read it');

-- ----- Past exceptions ----------------------------------------------------------------------------
select is((select array_agg(night - current_date) from public.listing_availability_exceptions where listing_id = '00000000-0000-0000-0000-0000000038b3'),
  array[10], 'infrastructure.md §4 a past exception is deleted and a future one stays');
select ok((select calendar_confirmed_at from public.listings where id = '00000000-0000-0000-0000-0000000038b3') < now() - interval '39 days',
  'BR-AVL-006 deleting past nights doesn''t count as the host updating the calendar, so NTF-006 still asks');

-- ----- BR-PRV-003: reports and the moderation log after 2 years -------------------------------------
select is((select row(reporter_id, target_id, details)::text from public.reports where id = '00000000-0000-0000-0000-0000000038e1'),
  row(null::uuid, '00000000-0000-0000-0000-000000000000'::uuid, null::text)::text,
  'BR-PRV-003 a report closed 3 years ago loses who reported, who was reported and the text');
select is((select row(target_type, reason, status)::text from public.reports where id = '00000000-0000-0000-0000-0000000038e1'),
  row('user', 'scam', 'closed')::text, 'and keeps what kind of report it was');
select is((select details from public.reports where id = '00000000-0000-0000-0000-0000000038e2'), 'Same message twice', 'a report closed last month is kept');
select is((select details from public.reports where id = '00000000-0000-0000-0000-0000000038e3'), 'Still looking', 'BR-ACC-007 an open report is kept, however old');
select is((select row(admin_id, target_id, note)::text from public.moderation_actions where id = '00000000-0000-0000-0000-0000000038d1'),
  row('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'Anonymised')::text,
  'BR-PRV-003 a moderation entry from 3 years ago is anonymised');
select is((select note from public.moderation_actions where id = '00000000-0000-0000-0000-0000000038d2'), 'Nothing to do', 'a recent one is kept');
select throws_ok($$update public.moderation_actions set note = 'Changed' where id = '00000000-0000-0000-0000-0000000038d2'$$,
  '42501', 'The moderation log cannot be changed', 'BR-ADM-001 the log still can''t be edited');
insert into public.moderation_actions (id, admin_id, action, target_type, target_id, note, created_at) values
  ('00000000-0000-0000-0000-0000000038d3', '00000000-0000-0000-0000-0000000038a2', 'dismiss', 'user', '00000000-0000-0000-0000-0000000038a1', 'Old and kept', now() - interval '3 years');
select throws_ok($$update public.moderation_actions set admin_id = '00000000-0000-0000-0000-000000000000', target_id = '00000000-0000-0000-0000-000000000000', note = 'Anonymised'
    where id = '00000000-0000-0000-0000-0000000038d3'$$,
  '42501', 'The moderation log cannot be changed', 'BR-ADM-001 outside the cleanup, even anonymising an old entry is refused');
select throws_ok($$delete from public.moderation_actions where id = '00000000-0000-0000-0000-0000000038d1'$$,
  '42501', 'The moderation log cannot be changed', 'BR-ADM-001 nor deleted, even an anonymised entry');

select is((select array_agg(phone_hash) from public.phone_code_events where user_id = '00000000-0000-0000-0000-0000000038a2'),
  array['new'], 'phone code events older than 2 days go even if nobody verifies a phone');
select is((select v from t where k = 'run'),
  '{"listings": 1, "exceptions": 1, "reports": 1, "moderation_actions": 1, "phone_code_events": 1}'::jsonb, 'the run reports what it did');
select is(current_setting('swingmate.retention', true) || current_setting('swingmate.cleanup', true), 'offoff',
  'and leaves both flags off');

-- ----- Files nobody points to ------------------------------------------------------------------------
select is((select jsonb_agg(f ->> 'path' order by f ->> 'path') from jsonb_array_elements(public.cleanup_orphan_files()) f),
  jsonb_build_array('00000000-0000-0000-0000-0000000038a1/00000000-0000-0000-0000-0000000038f0.jpg',
    '00000000-0000-0000-0000-0000000038b1/0.jpg', '00000000-0000-0000-0000-0000000038b1/1.jpg', '00000000-0000-0000-0000-0000000038b1/2.jpg',
    '00000000-0000-0000-0000-0000000038b9/draft.jpg'),
  'schema.md §11 the purged listing''s photos, an old avatar and an unsaved upload; not live photos, the avatar in use or today''s upload');

-- ----- delete_account: analytics and the email log -------------------------------------------------
insert into t values ('session', to_jsonb(gen_random_uuid())), ('ref', to_jsonb(gen_random_uuid()));
insert into public.analytics_events (name, session_id, user_id, props)
  values ('landing_viewed', (select (v #>> '{}')::uuid from t where k = 'session'), '00000000-0000-0000-0000-0000000038a2', '{"page": "search", "src": "direct"}');
insert into public.notification_log (user_id, template, ref_id, status)
  values ('00000000-0000-0000-0000-0000000038a2', 'NTF-007', (select (v #>> '{}')::uuid from t where k = 'ref'), 'sent');
select is(public.delete_account('00000000-0000-0000-0000-0000000038a2'), '{"ok": true}'::jsonb, 'AC-035-1 the account is deleted');
select is((select count(*)::int from public.analytics_events where user_id = '00000000-0000-0000-0000-0000000038a2'), 0,
  'schema.md their analytics events no longer point to them');
select is((select count(*)::int from public.analytics_events where session_id = (select (v #>> '{}')::uuid from t where k = 'session') and user_id is null), 1,
  'and stay as anonymous ones');
select is((select count(*)::int from public.notification_log where ref_id = (select (v #>> '{}')::uuid from t where k = 'ref') and user_id is null), 1,
  'the email log keeps the email without saying who it went to');

select * from finish();
rollback;
