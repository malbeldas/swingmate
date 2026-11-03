-- reports, set_conversation_block and blocked_by_me (UC-034, BR-TRU-005, BR-MSG-006, AC-034-1,
-- AC-034-2, P-20, P-21, P-22, SEC-12).
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into public.suburbs (id, name, state, lat, lng, timezone) values
  (75001, 'Lindisfarne', 'TAS', -42.8480, 147.3600, 'Australia/Hobart');
-- 81 host · 82 seeker · 83 outsider · 84 admin
insert into auth.users (id, email, email_confirmed_at, phone, phone_confirmed_at, created_at, raw_app_meta_data) values
  ('00000000-0000-0000-0000-000000000081', 'hostb@example.com', now(), '61400000007', now(), now() - interval '90 days', '{}'),
  ('00000000-0000-0000-0000-000000000082', 'seekerb@example.com', now(), null, null, now() - interval '30 days', '{}'),
  ('00000000-0000-0000-0000-000000000083', 'otherb@example.com', now(), null, null, now() - interval '30 days', '{}'),
  ('00000000-0000-0000-0000-000000000084', 'adminb@example.com', now(), null, null, now() - interval '30 days', '{"role":"admin"}');
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at) values
  ('00000000-0000-0000-0000-000000000081', 'Bea', 75001, 'test', now()),
  ('00000000-0000-0000-0000-000000000082', 'Cal', 75001, 'test', now()),
  ('00000000-0000-0000-0000-000000000083', 'Dee', 75001, 'test', now()),
  ('00000000-0000-0000-0000-000000000084', 'Eve', 75001, 'test', now());

insert into public.listings (id, owner_id, title, suburb_id, public_lat, public_lng, place_type, bathroom,
    weekly_price, bills_included, bond, furnished, availability_type, available_from, accuracy_declared_at)
  values ('00000000-0000-0000-0000-000000008301', '00000000-0000-0000-0000-000000000081', 'Room with a view', 75001,
    -42.8490, 147.3610, 'private_room', 'own', 230, true, 460, true, 'from_date', '2026-01-01', now());
insert into public.listing_private (listing_id, address_line, lat, lng)
  values ('00000000-0000-0000-0000-000000008301', '2 Hill Rd', -42.8481, 147.3601);
insert into public.listing_photos (listing_id, storage_path, position, width, height)
  select '00000000-0000-0000-0000-000000008301', '00000000-0000-0000-0000-000000008301/' || i || '.jpg', i, 1600, 1200 from generate_series(0, 2) i;
update public.listings set status = 'active' where id = '00000000-0000-0000-0000-000000008301';

create temp table t (k text primary key, v jsonb);
grant all on t to authenticated;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000082","role":"authenticated"}';
insert into t values ('conv', public.start_conversation('00000000-0000-0000-0000-000000008301',
  'Hi Bea, is it free next swing?', current_date + 7, current_date + 14));
reset role;
insert into t select 'id', to_jsonb((v ->> 'conversation_id')) from t where k = 'conv';

-- ----- Report (P-21, AC-034-2) ------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000082","role":"authenticated"}';
select lives_ok($$ insert into public.reports (target_type, target_id, reason, details)
    values ('listing', '00000000-0000-0000-0000-000000008301', 'scam', '  Asked for the bond by PayID  ') $$,
  'AC-034-2 a member reports a listing with a reason and a detail');
select lives_ok(format($$ insert into public.reports (target_type, target_id, reason)
    values ('conversation', %L, 'unsafe') $$, (select v #>> '{}' from t where k = 'id')),
  'AC-034-2 a participant reports the conversation');
select lives_ok($$ insert into public.reports (target_type, target_id, reason)
    values ('user', '00000000-0000-0000-0000-000000000081', 'offensive') $$,
  'AC-034-2 a member reports a person');
select is((select count(*)::int from public.reports), 0, 'P-22 the person who reported does not see the queue');
select throws_ok($$ insert into public.reports (target_type, target_id, reason) values ('listing', '00000000-0000-0000-0000-000000008301', 'rude') $$,
  '23514', null, 'BR-TRU-005 the reason comes from the list');
select throws_ok(format($$ insert into public.reports (target_type, target_id, reason, details) values ('listing', '00000000-0000-0000-0000-000000008301', 'other', %L) $$, repeat('x', 501)),
  '23514', null, 'BR-TRU-005 the detail is up to 500 characters');
select throws_ok($$ insert into public.reports (target_type, target_id, reason) values ('listing', '00000000-0000-0000-0000-00000000dead', 'fake') $$,
  '22023', 'target', 'BR-TRU-005 only an object that exists');
select throws_ok($$ insert into public.reports (target_type, target_id, reason) values ('user', '00000000-0000-0000-0000-000000000082', 'spam') $$,
  '22023', 'target', 'BR-TRU-005 nobody reports themselves');
select throws_ok($$ insert into public.reports (target_type, target_id, reason, status) values ('user', '00000000-0000-0000-0000-000000000081', 'spam', 'closed') $$,
  '42501', null, 'P-21 the web cannot set the status');
select throws_ok($$ insert into public.reports (reporter_id, target_type, target_id, reason) values ('00000000-0000-0000-0000-000000000083', 'user', '00000000-0000-0000-0000-000000000081', 'spam') $$,
  '42501', null, 'P-21 nobody reports in someone else''s name');
reset role;

-- BR-ADM-002, T-10: someone outside the conversation cannot open it to admins by reporting it.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000083","role":"authenticated"}';
select throws_ok(format($$ insert into public.reports (target_type, target_id, reason) values ('conversation', %L, 'unsafe') $$,
    (select v #>> '{}' from t where k = 'id')),
  '22023', 'target', 'BR-ADM-002 only its participants report a conversation');
reset role;

set local role anon;
select throws_ok($$ insert into public.reports (target_type, target_id, reason) values ('listing', '00000000-0000-0000-0000-000000008301', 'scam') $$,
  '42501', null, 'UC-034 a visitor is asked to sign up before reporting');
reset role;

-- The queue as an admin sees it (P-22).
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000084","role":"authenticated","app_metadata":{"role":"admin"}}';
select is((select count(*)::int from public.reports where status = 'open'), 3, 'AC-034-2 the three reports are in the admin queue, open');
select is((select (reporter_id, reason, details)::text from public.reports where target_type = 'listing'),
  ('00000000-0000-0000-0000-000000000082', 'scam', 'Asked for the bond by PayID')::text,
  'AC-034-2 with who reported, the reason and the trimmed detail');
select is((select count(*)::int from public.reports where created_at is not null and target_id is not null), 3,
  'AC-034-2 with date and object reported');
reset role;

-- SEC-12: 20 reports in 24 hours, then no more.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000083","role":"authenticated"}';
insert into public.reports (target_type, target_id, reason)
  select 'listing', '00000000-0000-0000-0000-000000008301', 'spam' from generate_series(1, 19);
select lives_ok($$ insert into public.reports (target_type, target_id, reason) values ('listing', '00000000-0000-0000-0000-000000008301', 'spam') $$,
  'SEC-12 the 20th report of the day goes in');
select throws_ok($$ insert into public.reports (target_type, target_id, reason) values ('listing', '00000000-0000-0000-0000-000000008301', 'spam') $$,
  '54000', 'tooMany', 'SEC-12 the 21st is refused');
reset role;

-- ----- Block (P-20, AC-034-1, BR-MSG-006) -------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000081","role":"authenticated"}';
select is(public.set_conversation_block((select (v #>> '{}')::uuid from t where k = 'id'), true), true,
  'AC-034-1 the host blocks the seeker from the conversation');
select is((select blocked_by_me from public.my_conversations()), true, 'UC-034 the host sees that they blocked');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000082","role":"authenticated"}';
select throws_ok(format($$ insert into public.messages (conversation_id, sender_id, kind, body)
    values (%L, '00000000-0000-0000-0000-000000000082', 'text', 'Hello?') $$, (select v #>> '{}' from t where k = 'id')),
  '42501', 'blocked', 'AC-034-1 the blocked person cannot send messages');
select is((select blocked_by_me from public.my_conversations()), false, 'BR-MSG-006 the blocked person is not told');
select is(public.set_conversation_block((select (v #>> '{}')::uuid from t where k = 'id'), false), false,
  'P-20 blocking from a conversation only ever touches the caller''s own blocks');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000083","role":"authenticated"}';
select is(public.set_conversation_block((select (v #>> '{}')::uuid from t where k = 'id'), true), null,
  'P-20 someone else cannot block through a conversation that is not theirs');
reset role;

-- A2: unblocking lets them write again.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000081","role":"authenticated"}';
select public.set_conversation_block((select (v #>> '{}')::uuid from t where k = 'id'), false);
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000082","role":"authenticated"}';
select lives_ok(format($$ insert into public.messages (conversation_id, sender_id, kind, body)
    values (%L, '00000000-0000-0000-0000-000000000082', 'text', 'Hello again') $$, (select v #>> '{}' from t where k = 'id')),
  'UC-034 A2 after unblocking, the person can write again');
reset role;
select is((select count(*)::int from public.blocks where blocker_id = '00000000-0000-0000-0000-000000000081'), 0,
  'UC-034 A2 the block is gone');

select * from finish();
rollback;
