-- admin_reports, admin_read_conversation, admin_act and moderation_actions (UC-040, BR-ADM-001,
-- BR-ADM-002, AC-040-1 to AC-040-4, P-14, P-17, P-22 to P-24).
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into public.suburbs (id, name, state, lat, lng, timezone) values
  (78001, 'Sorell', 'TAS', -42.7810, 147.5620, 'Australia/Hobart');
-- 51 host · 52 seeker · 53 admin
insert into auth.users (id, email, email_confirmed_at, phone, phone_confirmed_at, created_at, raw_app_meta_data) values
  ('00000000-0000-0000-0000-000000000051', 'hosta@example.com', now(), '61400000009', now(), now() - interval '90 days', '{}'),
  ('00000000-0000-0000-0000-000000000052', 'seekera@example.com', now(), null, null, now() - interval '30 days', '{}'),
  ('00000000-0000-0000-0000-000000000053', 'admina@example.com', now(), null, null, now() - interval '30 days', '{"role":"admin"}');
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at) values
  ('00000000-0000-0000-0000-000000000051', 'Lou', 78001, 'test', now()),
  ('00000000-0000-0000-0000-000000000052', 'Max', 78001, 'test', now()),
  ('00000000-0000-0000-0000-000000000053', 'Ned', 78001, 'test', now());

insert into public.listings (id, owner_id, title, suburb_id, public_lat, public_lng, place_type, bathroom,
    weekly_price, bills_included, bond, furnished, availability_type, available_from, accuracy_declared_at)
  values ('00000000-0000-0000-0000-000000005301', '00000000-0000-0000-0000-000000000051', 'Cosy room by the bay', 78001,
    -42.7820, 147.5630, 'private_room', 'own', 210, true, 420, true, 'from_date', '2026-01-01', now());
insert into public.listing_private (listing_id, address_line, lat, lng)
  values ('00000000-0000-0000-0000-000000005301', '6 Bay Rd', -42.7811, 147.5621);
insert into public.listing_photos (listing_id, storage_path, position, width, height)
  select '00000000-0000-0000-0000-000000005301', '00000000-0000-0000-0000-000000005301/' || i || '.jpg', i, 1600, 1200 from generate_series(0, 2) i;
update public.listings set status = 'active' where id = '00000000-0000-0000-0000-000000005301';

create temp table t (k text primary key, v jsonb);
grant all on t to authenticated;

-- The seeker writes, the host answers asking for money; the seeker reports the conversation and
-- the listing twice (A1).
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000052","role":"authenticated"}';
insert into t values ('conv', public.start_conversation('00000000-0000-0000-0000-000000005301', 'Is it free?', current_date + 7, current_date + 14));
reset role;
insert into t select 'id', to_jsonb(v ->> 'conversation_id') from t where k = 'conv';
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000051","role":"authenticated"}';
insert into public.messages (conversation_id, sender_id, kind, body)
  select (v #>> '{}')::uuid, '00000000-0000-0000-0000-000000000051', 'text', 'Send the bond by PayID first' from t where k = 'id';
reset role;

-- An admin cannot read it before there is a report (AC-040-2).
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000053","role":"authenticated","app_metadata":{"role":"admin"}}';
select throws_ok(format($$ select public.admin_read_conversation(%L) $$, (select v #>> '{}' from t where k = 'id')),
  '42501', 'no open report', 'AC-040-2 an admin cannot read a conversation without an open report');
select is((select count(*)::int from public.conversations), 0, 'P-14 an admin has no direct read of conversations');
select is((select count(*)::int from public.messages), 0, 'P-17 nor of messages');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000052","role":"authenticated"}';
insert into public.reports (target_type, target_id, reason, details)
  select 'conversation', (v #>> '{}')::uuid, 'scam', 'Wants the bond before I see it' from t where k = 'id';
insert into public.reports (target_type, target_id, reason) values
  ('listing', '00000000-0000-0000-0000-000000005301', 'scam'),
  ('listing', '00000000-0000-0000-0000-000000005301', 'fake');
reset role;
-- In one transaction every now() is the same instant: date the conversation report first.
update public.reports set created_at = now() - interval '2 hours' where target_type = 'conversation';

-- ----- Who can use the panel --------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000052","role":"authenticated"}';
select throws_ok($$ select public.admin_reports() $$, '42501', null, 'P-22 a member cannot see the queue');
select throws_ok(format($$ select public.admin_read_conversation(%L) $$, (select v #>> '{}' from t where k = 'id')),
  '42501', 'admins only', 'BR-ADM-002 nor read conversations as an admin');
select throws_ok($$ select public.admin_act((select id from public.reports limit 1), 'dismiss', 'nothing here') $$,
  '42501', null, 'BR-ADM-001 nor act on reports');
reset role;

-- ----- The queue and reading (UC-040 steps 1 and 2) ---------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000053","role":"authenticated","app_metadata":{"role":"admin"}}';
insert into t values ('queue', public.admin_reports());
select is((select jsonb_array_length(v) from t where k = 'queue'), 3, 'UC-040 the three open reports are in the queue');
select is((select v -> 0 ->> 'target_type' from t where k = 'queue'), 'conversation', 'UC-040 oldest first');
select is((select (v -> 0 ->> 'target_label', v -> 0 ->> 'person_name', v -> 0 ->> 'reporter_name', v -> 0 ->> 'details')::text from t where k = 'queue'),
  ('Conversation about Cosy room by the bay', 'Lou', 'Max', 'Wants the bond before I see it')::text,
  'UC-040 with the object, the person reported, who reported and the detail');
select is((select v::text ~ '(hosta@|seekera@|61400000009|Bay Rd)' from t where k = 'queue'), false,
  'BR-TRU-003 the queue carries no email, phone or address');

insert into t values ('read', public.admin_read_conversation((select (v #>> '{}')::uuid from t where k = 'id')));
select is((select jsonb_array_length(v) from t where k = 'read'), 2, 'BR-ADM-002 with an open report the admin reads it');
select is((select (e ->> 'sender', e ->> 'risk_flag')::text from t, jsonb_array_elements(v) e where k = 'read' and e ->> 'body' like 'Send the bond%'), ('host', 'true')::text,
  'UC-040 each message says who sent it and carries the risk flag');
select is((select count(*)::int from public.moderation_actions where action = 'read_conversation'), 1,
  'BR-ADM-002 the read is logged');

-- ----- Acting (AC-040-1, A1, AC-040-3) ----------------------------------------------------------
select is(public.admin_act((select id from public.reports where target_type = 'listing' order by created_at limit 1), 'hide_listing', '  '),
  '{"ok": false, "reason": "note"}'::jsonb, 'AC-040-1 no action without a note');
select is((select status from public.listings where id = '00000000-0000-0000-0000-000000005301'), 'active',
  'AC-040-1 and nothing was applied');
select is(public.admin_act((select id from public.reports where target_type = 'listing' order by created_at limit 1), 'read_conversation', 'Not a real action'),
  '{"ok": false, "reason": "action"}'::jsonb, 'BR-ADM-001 the action must fit the object');
select is(public.admin_act((select id from public.reports where target_type = 'listing' order by created_at limit 1), 'hide_listing', 'Stolen photos, asks for money'),
  '{"ok": true, "closed": 2}'::jsonb, 'UC-040 A1 hiding closes both reports of the listing');
select is((select (status, hidden_reason)::text from public.listings where id = '00000000-0000-0000-0000-000000005301'),
  ('hidden', 'Stolen photos, asks for money')::text, 'AC-040-3 the listing is hidden with the note');
reset role;

select is((select count(*)::int from public.search_listings(-42.78, 147.56, 50, current_date) s where s.id = '00000000-0000-0000-0000-000000005301'), 0,
  'AC-040-3 it leaves the search at once');
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is(public.get_listing('00000000-0000-0000-0000-000000005301', null), null, 'AC-040-3 and its direct link');
reset role;

-- ----- Suspending (AC-040-4) --------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000053","role":"authenticated","app_metadata":{"role":"admin"}}';
select is(public.admin_act((select id from public.reports where target_type = 'conversation'), 'suspend_user', 'Asked for money before a visit'),
  '{"ok": true, "closed": 1}'::jsonb, 'UC-040 suspending from the conversation report');
select is((select status from public.profiles where id = '00000000-0000-0000-0000-000000000051'), 'suspended',
  'UC-040 the suspended person is the one who did not report');
select is((select count(*)::int from public.moderation_actions where action <> 'read_conversation' and char_length(note) >= 3), 2,
  'BR-ADM-001 every action is in the log with its note');
select is(public.admin_act((select id from public.reports where target_type = 'conversation'), 'dismiss', 'Again'),
  '{"ok": false, "reason": "closed"}'::jsonb, 'UC-040 a closed report takes no more actions');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000051","role":"authenticated"}';
select throws_ok(format($$ insert into public.messages (conversation_id, sender_id, kind, body) values (%L, '00000000-0000-0000-0000-000000000051', 'text', 'Hello?') $$,
    (select v #>> '{}' from t where k = 'id')),
  '42501', 'suspended', 'AC-040-4 a suspended account cannot send messages');
select throws_ok($$ insert into public.listings (owner_id, title, suburb_id, public_lat, public_lng, place_type, bathroom,
    weekly_price, bills_included, bond, furnished, availability_type, available_from)
  values ('00000000-0000-0000-0000-000000000051', 'Another room', 78001, -42.78, 147.56, 'private_room', 'own', 200, true, 400, true, 'from_date', '2026-01-01') $$,
  '42501', null, 'AC-040-4 nor create a listing to publish');
reset role;

-- P-24: the log cannot be changed, not even by the table owner.
select throws_ok($$ update public.moderation_actions set note = 'changed' $$, '42501', null, 'P-24 nobody edits the log');
select throws_ok($$ delete from public.moderation_actions $$, '42501', null, 'P-24 nobody deletes from the log');

select * from finish();
rollback;
