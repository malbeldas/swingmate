-- The pilot funnel (#29): analytics_events, P-26, P-27, BR-ANL-001, BR-ANL-002, SEC-13 and
-- admin_metrics_weekly (observability.md §3).
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

-- The seed's own sign-ups and listings leave events too; start this test from none.
delete from public.analytics_events;


insert into public.suburbs (id, name, state, lat, lng, timezone) values
  (972901, 'Sandy Bay', 'TAS', -42.9010, 147.3290, 'Australia/Hobart');
-- 29a1 host · 29a2 seeker · 29a3 admin
insert into auth.users (id, email, email_confirmed_at, phone, phone_confirmed_at, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000029a1', 'host29@example.com', now(), '61400000029', now(), '{"provider":"email"}'),
  ('00000000-0000-0000-0000-0000000029a2', 'seeker29@example.com', now(), null, null, '{"provider":"google"}'),
  ('00000000-0000-0000-0000-0000000029a3', 'admin29@example.com', now(), null, null, '{"provider":"email","role":"admin"}');
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at) values
  ('00000000-0000-0000-0000-0000000029a1', 'Hal', 972901, 'test', now()),
  ('00000000-0000-0000-0000-0000000029a2', 'Sia', 972901, 'test', now()),
  ('00000000-0000-0000-0000-0000000029a3', 'Ada', 972901, 'test', now());

create temp table s (k text primary key, v uuid);
insert into s values ('tab', '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f'), ('busy', '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e50');
grant select on s to anon, authenticated;

-- ----- What the browser may write (P-26) -------------------------------------------------------
set local role anon;
select lives_ok(
  $$insert into public.analytics_events (name, session_id, props)
    values ('landing_viewed', (select v from s where k = 'tab'), '{"page": "search", "src": "direct"}')$$,
  'P-26 a visitor records what happens on screen');
select throws_ok(
  $$insert into public.analytics_events (name, session_id, props) values ('conversation_started', (select v from s where k = 'tab'), '{}')$$,
  '42501', null, 'P-26 but not the events the base records itself');
select throws_ok(
  $$insert into public.analytics_events (name, session_id, props) values ('page_scrolled', (select v from s where k = 'tab'), '{}')$$,
  '42501', null, 'SEC-13 nor a name outside the closed list');
select throws_ok(
  $$insert into public.analytics_events (name, session_id, user_id, props)
    values ('landing_viewed', (select v from s where k = 'tab'), '00000000-0000-0000-0000-0000000029a1', '{}')$$,
  '42501', null, 'BR-ANL-001 nor say who they are');
select throws_ok(
  $$insert into public.analytics_events (name, session_id, props)
    values ('client_error', (select v from s where k = 'tab'), '{"message": "failed for sia@example.com"}')$$,
  '23514', null, 'BR-ANL-002 an email is refused');
select throws_ok(
  $$insert into public.analytics_events (name, session_id, props)
    values ('client_error', (select v from s where k = 'tab'), '{"message": "bad number 0412 345 678"}')$$,
  '23514', null, 'BR-ANL-002 a phone number is refused');
select lives_ok(
  $$insert into public.analytics_events (name, session_id, props)
    values ('listing_viewed', (select v from s where k = 'tab'), '{"listing_id": "12345678-1234-4123-8123-123456789012", "fit_class": "full"}')$$,
  'BR-ANL-002 an id made only of digits is still an id');
select throws_ok(
  $$insert into public.analytics_events (name, session_id, props)
    values ('client_error', (select v from s where k = 'tab'), jsonb_build_object('message', repeat('x', 2100)))$$,
  '23514', null, 'SEC-13 props up to 2 KB');
select throws_ok(
  $$insert into public.analytics_events (name, session_id, props) values ('client_error', (select v from s where k = 'tab'), '["a"]')$$,
  '23514', null, 'SEC-13 props are a flat object');
select throws_ok($$select count(*) from public.analytics_events$$, '42501', null, 'P-27 a visitor reads nothing');
insert into public.analytics_events (name, session_id, props)
  select 'search_performed', (select v from s where k = 'busy'), '{"n_full": 0}' from generate_series(1, 305);
reset role;

select is((select count(*)::int from public.analytics_events where session_id = (select v from s where k = 'busy')), 300,
  'SEC-13 a tab that sends more than 300 events in an hour is ignored');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000029a2","role":"authenticated"}';
insert into public.analytics_events (name, session_id, props)
  values ('send_message_clicked', (select v from s where k = 'tab'), '{"logged_in": true}');
select is((select count(*)::int from public.analytics_events), 0, 'P-27 a member reads nothing either');
reset role;
select is((select user_id from public.analytics_events where name = 'send_message_clicked'),
  '00000000-0000-0000-0000-0000000029a2'::uuid, 'BR-ANL-001 the user id is the session''s, set by the base');

-- ----- What the base records (BR-ANL-001) -------------------------------------------------------
select is((select props from public.analytics_events where name = 'signup_completed' and user_id = '00000000-0000-0000-0000-0000000029a2'),
  '{"method": "google"}'::jsonb, 'BR-ANL-001 signup_completed when the email arrives confirmed, with its method');
select ok(exists (select 1 from public.analytics_events where name = 'phone_verified' and user_id = '00000000-0000-0000-0000-0000000029a1'),
  'BR-ANL-001 phone_verified');

insert into public.listings (id, owner_id, title, suburb_id, place_type, bathroom,
    weekly_price, bills_included, bond, furnished, availability_type, available_from, accuracy_declared_at)
  values ('00000000-0000-0000-0000-0000000029b1', '00000000-0000-0000-0000-0000000029a1', 'Room by the bay', 972901,
    'private_room', 'own', 240, true, 480, true, 'from_date', '2026-01-01', now());
insert into public.listing_private (listing_id, address_line, lat, lng)
  values ('00000000-0000-0000-0000-0000000029b1', '9 Quiet Lane', -42.9011, 147.3291);
insert into public.listing_photos (listing_id, storage_path, position, width, height)
  select '00000000-0000-0000-0000-0000000029b1', '00000000-0000-0000-0000-0000000029b1/' || i || '.jpg', i, 1600, 1200 from generate_series(0, 2) i;
select ok(exists (select 1 from public.analytics_events where name = 'listing_created'
  and props = '{"listing_id": "00000000-0000-0000-0000-0000000029b1"}'), 'BR-ANL-001 listing_created');
update public.listings set status = 'active' where id = '00000000-0000-0000-0000-0000000029b1';
select isnt((select published_at from public.listings where id = '00000000-0000-0000-0000-0000000029b1'), null,
  'schema.md §5 the first activation sets published_at');
select is((select props from public.analytics_events where name = 'listing_published' and props ->> 'listing_id' = '00000000-0000-0000-0000-0000000029b1'),
  '{"listing_id": "00000000-0000-0000-0000-0000000029b1", "availability_type": "from_date", "n_photos": 3}'::jsonb,
  'BR-ANL-001 listing_published with the availability type and photos');
update public.listings set status = 'paused' where id = '00000000-0000-0000-0000-0000000029b1';
update public.listings set status = 'active' where id = '00000000-0000-0000-0000-0000000029b1';
select is((select count(*)::int from public.analytics_events where name = 'listing_published' and props ->> 'listing_id' = '00000000-0000-0000-0000-0000000029b1'), 1,
  'BR-ANL-001 coming back from a pause is not a new publication');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000029a2","role":"authenticated"}';
create temp table c as
  select (public.start_conversation('00000000-0000-0000-0000-0000000029b1', 'Hi Hal, my number is 0412 345 678', current_date + 7, current_date + 14) ->> 'conversation_id')::uuid as id;
reset role;
select is((select props from public.analytics_events where name = 'conversation_started'),
  jsonb_build_object('conversation_id', (select id from c), 'listing_id', '00000000-0000-0000-0000-0000000029b1'),
  'BR-ANL-001 conversation_started');
select is((select props ->> 'role' from public.analytics_events where name = 'message_sent'), 'seeker',
  'BR-ANL-001 message_sent says who sent it');

update public.conversations set created_at = now() - interval '5 hours' where id = (select id from c);
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000029a1","role":"authenticated"}';
insert into public.messages (conversation_id, sender_id, kind, body)
  values ((select id from c), '00000000-0000-0000-0000-0000000029a1', 'text', 'Hi Sia, it is free.');
insert into public.messages (conversation_id, sender_id, kind, body)
  values ((select id from c), '00000000-0000-0000-0000-0000000029a1', 'text', 'Call me any time.');
insert into public.reports (target_type, target_id, reason) values ('conversation', (select id from c), 'spam');
insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-0000000029a1', '00000000-0000-0000-0000-0000000029a2');
reset role;
select is((select props ->> 'hours_to_reply' from public.analytics_events where name = 'first_reply_received'), '5.0',
  'BR-ANL-001 first_reply_received with the hours it took');
select is((select count(*)::int from public.analytics_events where name = 'first_reply_received'), 1, 'BR-ANL-001 only the first reply');
select is((select props from public.analytics_events where name = 'report_created'), '{"reason": "spam", "target_type": "conversation"}'::jsonb,
  'BR-ANL-001 report_created');
select ok(exists (select 1 from public.analytics_events where name = 'user_blocked'), 'BR-ANL-001 user_blocked');
select ok(not exists (select 1 from public.analytics_events
    where props::text ~ '(Hi Hal|0412|example\.com|Quiet Lane|Sia|Hal)'),
  'BR-ANL-002 no event carries message text, a phone number, an email, an address or a name');

-- ----- Weekly metrics (observability.md §3) -----------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000029a2","role":"authenticated"}';
select throws_ok($$select * from public.admin_metrics_weekly()$$, '42501', null, 'observability.md §3 only admins see the metrics');
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000029a3","role":"authenticated","app_metadata":{"role":"admin"}}';
select is((select count(*)::int from public.admin_metrics_weekly(8)), 8, 'observability.md §3 one row per week');
select is(
  (select row(visitors, signups, active_listings, searches, searches_with_fit, listing_views, send_clicks, conversations, replied_48h, median_reply_hours)::text
     from public.admin_metrics_weekly(8) order by week_start desc limit 1),
  row(1, 3, (select count(*)::int from public.listings where published_at is not null and status not in ('hidden', 'draft') and removed_at is null),
      300, 0, 1, 1, 1, 1, 5.0)::text,
  '#29 scenario 2 this week: visitors, sign-ups, active listings, searches, detail and Send, conversations and replies in 48 h');
select ok((select count(*) from public.analytics_events) > 300, 'P-27 an admin reads the events');
reset role;

select * from finish();
rollback;
