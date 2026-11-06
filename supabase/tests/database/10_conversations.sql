-- start_conversation, conversations, messages and blocks (schema.md §7, §8 and §10, UC-004,
-- P-14 to P-20, BR-ACC-003, BR-MSG-001/002/003/006/007, BR-TRU-004, BR-LST-008).
begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

insert into public.suburbs (id, name, state, lat, lng, timezone) values
  (972001, 'Battery Point', 'TAS', -42.8890, 147.3320, 'Australia/Hobart');
-- e1 host · e2 seeker (account a month old) · e3 new seeker · e4 outsider · e5 no Terms yet
-- e6 email not confirmed · e7 suspended
insert into auth.users (id, email, email_confirmed_at, phone, phone_confirmed_at, created_at) values
  ('00000000-0000-0000-0000-0000000000e1', 'host@example.com', now(), '61400000003', now(), now() - interval '60 days'),
  ('00000000-0000-0000-0000-0000000000e2', 'seeker@example.com', now(), null, null, now() - interval '30 days'),
  ('00000000-0000-0000-0000-0000000000e3', 'new@example.com', now(), null, null, now()),
  ('00000000-0000-0000-0000-0000000000e4', 'other@example.com', now(), null, null, now() - interval '30 days'),
  ('00000000-0000-0000-0000-0000000000e5', 'noterms@example.com', now(), null, null, now()),
  ('00000000-0000-0000-0000-0000000000e6', 'unconfirmed@example.com', null, null, null, now()),
  ('00000000-0000-0000-0000-0000000000e7', 'suspended@example.com', now(), null, null, now() - interval '30 days');
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at, listing_limit) values
  ('00000000-0000-0000-0000-0000000000e1', 'Hana', 972001, 'test', now(), 20),
  ('00000000-0000-0000-0000-0000000000e2', 'Sam', 972001, 'test', now(), 5),
  ('00000000-0000-0000-0000-0000000000e3', 'Noa', 972001, 'test', now(), 5),
  ('00000000-0000-0000-0000-0000000000e4', 'Ola', 972001, 'test', now(), 5),
  ('00000000-0000-0000-0000-0000000000e6', 'Uma', 972001, 'test', now(), 5),
  ('00000000-0000-0000-0000-0000000000e7', 'Zed', 972001, 'test', now(), 5);
insert into public.profiles (id, display_name, base_suburb_id) values
  ('00000000-0000-0000-0000-0000000000e5', 'Tim', 972001);
update public.profiles set status = 'suspended' where id = '00000000-0000-0000-0000-0000000000e7';
insert into public.rosters (user_id, days_on, days_off, anchor_date)
  values ('00000000-0000-0000-0000-0000000000e2', 14, 7, '2026-11-02');

-- Twelve active listings of e1 (ids ...e201 to ...e212); e212 is then paused.
insert into public.listings (id, owner_id, title, suburb_id, public_lat, public_lng, place_type, bathroom,
    weekly_price, bills_included, bond, furnished, availability_type, available_from, accuracy_declared_at)
  select ('00000000-0000-0000-0000-00000000e' || (200 + i))::uuid, '00000000-0000-0000-0000-0000000000e1', 'Cottage ' || i, 972001,
    -42.8880, 147.3310, 'private_room', 'own', 240, true, 480, true, 'from_date', '2026-01-01', now()
  from generate_series(1, 12) i;
insert into public.listing_private (listing_id, address_line, lat, lng)
  select id, '3 Hidden Row', -42.8891, 147.3321 from public.listings where owner_id = '00000000-0000-0000-0000-0000000000e1';
insert into public.listing_photos (listing_id, storage_path, position, width, height)
  select l.id, l.id || '/' || i || '.jpg', i, 1600, 1200
  from public.listings l, generate_series(0, 2) i where l.owner_id = '00000000-0000-0000-0000-0000000000e1';
update public.listings set status = 'active' where owner_id = '00000000-0000-0000-0000-0000000000e1';
update public.listings set status = 'paused' where id = '00000000-0000-0000-0000-00000000e212';

create temp table t (k text primary key, v jsonb);
grant all on t to authenticated;

-- ----- Who can start one -----------------------------------------------------------------------
set local role anon;
select throws_ok($$ select public.start_conversation('00000000-0000-0000-0000-00000000e201', 'Hi', current_date + 7, current_date + 14) $$,
  '42501', null, 'AC-004-1 a visitor cannot send without an account');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e5","role":"authenticated"}';
select is(public.start_conversation('00000000-0000-0000-0000-00000000e201', 'Hi', current_date + 7, current_date + 14),
  '{"ok": false, "reason": "profile", "missing": ["terms"]}'::jsonb, 'AC-004-3 without Terms the inquiry is not sent');
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e6","role":"authenticated"}';
select is(public.start_conversation('00000000-0000-0000-0000-00000000e201', 'Hi', current_date + 7, current_date + 14) -> 'missing',
  '["emailVerified"]'::jsonb, 'BR-ACC-003 the email has to be verified');
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e7","role":"authenticated"}';
select is(public.start_conversation('00000000-0000-0000-0000-00000000e201', 'Hi', current_date + 7, current_date + 14) ->> 'reason',
  'suspended', 'BR-MSG-006 a suspended account cannot send');
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
select is(public.start_conversation('00000000-0000-0000-0000-00000000e201', 'Hi', current_date + 7, current_date + 14) ->> 'reason',
  'owner', 'BR-LST-008 the host cannot message their own listing');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
select is(public.start_conversation('00000000-0000-0000-0000-00000000e212', 'Hi', current_date + 7, current_date + 14) ->> 'reason',
  'inactive', 'UC-004 E1 a paused listing takes no new inquiry');
select is(public.start_conversation('00000000-0000-0000-0000-0000000000ff', 'Hi', current_date + 7, current_date + 14) ->> 'reason',
  'inactive', 'UC-004 E1 a missing listing takes no inquiry');
select is(public.start_conversation('00000000-0000-0000-0000-00000000e201', '   ', current_date + 7, current_date + 14) ->> 'reason',
  'empty', 'BR-MSG-003 an empty message is not sent');
select is(public.start_conversation('00000000-0000-0000-0000-00000000e201', repeat('a', 1001), current_date + 7, current_date + 14) ->> 'reason',
  'tooLong', 'BR-MSG-003 more than 1000 characters is not sent');
select is(public.start_conversation('00000000-0000-0000-0000-00000000e201', 'Hi', null, null) ->> 'reason',
  'dates', 'BR-MSG-002 the inquiry needs its dates');
select is(public.start_conversation('00000000-0000-0000-0000-00000000e201', 'Hi', current_date - 3, current_date + 4) ->> 'reason',
  'dates', 'BR-MSG-002 move-in cannot be in the past');
select is(public.start_conversation('00000000-0000-0000-0000-00000000e201', 'Hi', current_date + 9, current_date + 9) ->> 'reason',
  'dates', 'BR-MSG-002 move-out comes after move-in');
reset role;

-- ----- The inquiry and the second message (BR-MSG-001/002, AC-004-5) ---------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
insert into t values ('first', public.start_conversation('00000000-0000-0000-0000-00000000e201',
  '  Hi Hana, is the room free for my R&R?  ', current_date + 7, current_date + 14));
select is((select v ->> 'ok' from t where k = 'first'), 'true', 'UC-004 the first inquiry is sent');
select is((select v ->> 'appended' from t where k = 'first'), 'false', 'BR-MSG-001 the first inquiry creates the conversation');
select is((select (stay_from, stay_to, roster_summary)::text from public.conversations where id = (select (v ->> 'conversation_id')::uuid from t where k = 'first')),
  (current_date + 7, current_date + 14, '14:7 roster')::text, 'BR-MSG-002 the conversation keeps the dates and the roster summary');
select is((select (kind, body, stay_from, stay_to)::text from public.messages where conversation_id = (select (v ->> 'conversation_id')::uuid from t where k = 'first')),
  ('inquiry', 'Hi Hana, is the room free for my R&R?', current_date + 7, current_date + 14)::text, 'BR-MSG-002 the inquiry carries its dates, trimmed');
insert into t values ('second', public.start_conversation('00000000-0000-0000-0000-00000000e201', 'Or a week later?', current_date + 14, current_date + 21));
select is((select v -> 'conversation_id' from t where k = 'second'), (select v -> 'conversation_id' from t where k = 'first'),
  'AC-004-5 a second message on the same listing joins the same conversation');
select is((select v ->> 'appended' from t where k = 'second'), 'true', 'UC-004 A1 the answer says it was added');
select is((select count(*)::int from public.messages where conversation_id = (select (v ->> 'conversation_id')::uuid from t where k = 'first')), 2,
  'AC-004-5 both messages are in the conversation');
select is((select stay_from from public.conversations where id = (select (v ->> 'conversation_id')::uuid from t where k = 'first')), current_date + 14,
  'schema.md §7 the conversation keeps the dates of the latest inquiry');
reset role;

-- ----- Read access (P-14, P-17) ---------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
select is((select count(*)::int from public.messages), 2, 'P-17 the host reads the messages');
select is((select seeker_read_at is not null and host_read_at is null from public.conversations), true,
  'schema.md §10 the sender''s read mark moves, the host''s does not');
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e4","role":"authenticated"}';
select is((select count(*)::int from public.conversations), 0, 'P-14 someone else does not see the conversation');
select is((select count(*)::int from public.messages), 0, 'P-17 someone else does not see the messages');
reset role;
set local role anon;
select throws_ok($$ select count(*) from public.messages $$, '42501', null, 'P-17 a visitor reads no messages');
reset role;

-- ----- Writing (P-15, P-18, P-19) --------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e4","role":"authenticated"}';
select throws_ok($$ insert into public.conversations (listing_id, seeker_id, host_id, stay_from, stay_to)
    values ('00000000-0000-0000-0000-00000000e202', '00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000e1', current_date + 1, current_date + 2) $$,
  '42501', null, 'P-15 a conversation is created only through start_conversation');
select throws_ok(format($$ insert into public.messages (conversation_id, sender_id, kind, body) values (%L, %L, 'text', 'Hello') $$,
    (select v ->> 'conversation_id' from t where k = 'first'), '00000000-0000-0000-0000-0000000000e4'),
  '42501', null, 'P-18 someone else cannot write in the conversation');
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
select lives_ok(format($$ insert into public.messages (conversation_id, sender_id, kind, body) values (%L, %L, 'text', 'Yes, it is free') $$,
    (select v ->> 'conversation_id' from t where k = 'first'), '00000000-0000-0000-0000-0000000000e1'),
  'P-18 the host replies');
select is((select first_reply_at is not null from public.conversations), true, 'schema.md §10 the first reply is recorded');
select throws_ok(format($$ insert into public.messages (conversation_id, sender_id, kind, body, stay_from, stay_to) values (%L, %L, 'inquiry', 'x', current_date + 1, current_date + 2) $$,
    (select v ->> 'conversation_id' from t where k = 'first'), '00000000-0000-0000-0000-0000000000e1'),
  '42501', null, 'P-18 inquiries only come from start_conversation');
select throws_ok($$ update public.messages set body = 'edited' $$, '42501', null, 'P-19 messages are not edited');
select throws_ok($$ delete from public.messages $$, '42501', null, 'P-19 messages are not deleted');
reset role;

-- ----- Blocks (P-20, BR-MSG-006, UC-004 E3) -----------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2');
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
select is((select count(*)::int from public.blocks), 0, 'P-20 the blocked person never sees the block');
select is(public.start_conversation('00000000-0000-0000-0000-00000000e202', 'Hi', current_date + 7, current_date + 14) ->> 'reason',
  'blocked', 'UC-004 E3 a blocked person cannot start a conversation');
select throws_ok(format($$ insert into public.messages (conversation_id, sender_id, kind, body) values (%L, %L, 'text', 'Hello?') $$,
    (select v ->> 'conversation_id' from t where k = 'first'), '00000000-0000-0000-0000-0000000000e2'),
  '42501', 'blocked', 'BR-MSG-006 a blocked person cannot continue the conversation');
reset role;

-- ----- Host rule and daily limit (BR-TRU-004, BR-MSG-007) ---------------------------------------
update public.profiles set message_rule = 'phone' where id = '00000000-0000-0000-0000-0000000000e1';
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e4","role":"authenticated"}';
select is(public.start_conversation('00000000-0000-0000-0000-00000000e201', 'Hi', current_date + 7, current_date + 14) ->> 'reason',
  'phone', 'AC-004-6 without a verified mobile the host who asks for one gets no message');
reset role;
update public.profiles set message_rule = 'email' where id = '00000000-0000-0000-0000-0000000000e1';

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}';
select is((select count(*)::int from generate_series(201, 210) i
  where public.start_conversation(('00000000-0000-0000-0000-00000000e' || i)::uuid, 'Hi', current_date + 7, current_date + 14) ->> 'ok' = 'true'),
  10, 'BR-MSG-007 a new account starts 10 conversations in a day');
select is(public.start_conversation('00000000-0000-0000-0000-00000000e211', 'Hi', current_date + 7, current_date + 14) ->> 'reason',
  'dailyLimit', 'AC-004-7 a new account cannot start an 11th conversation that day');
select is(public.start_conversation('00000000-0000-0000-0000-00000000e201', 'One more thing', current_date + 7, current_date + 14) ->> 'ok',
  'true', 'BR-MSG-007 messages in an existing conversation have no limit');
reset role;

select * from finish();
rollback;
