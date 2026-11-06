-- Outcome question (#33): pending_outcome_questions, mark_outcome_asked (UC-052, NTF-005), the
-- answer from the email and from the conversation (UC-007) and P-25. AC-052-1, AC-007-1, AC-007-2,
-- BR-MAIL-003.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

insert into public.suburbs (id, name, state, lat, lng, timezone) values
  (973602, 'Karratha', 'WA', -20.7364, 116.8463, 'Australia/Perth');
-- 33a0 host · 33a1..33a5 seekers
insert into auth.users (id, email, email_confirmed_at, created_at)
  select ('00000000-0000-0000-0000-0000000033a' || i)::uuid, 'outcome' || i || '@example.com', now(), now() - interval '60 days'
  from generate_series(0, 5) i;
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at)
  select id, 'O' || right(id::text, 1), 973602, 'test', now() from auth.users where id::text like '00000000-0000-0000-0000-0000000033a%';
insert into public.listings (id, owner_id, title, suburb_id, place_type, bathroom, weekly_price,
    bills_included, bond, furnished, availability_type, available_from, accuracy_declared_at)
  values ('00000000-0000-0000-0000-0000000033b1', '00000000-0000-0000-0000-0000000033a0', 'Karratha room', 973602,
    'private_room', 'own', 250, true, 500, true, 'from_date', current_date - 40, now());

-- c1 is 15 days old · c2 is 10 days old · c3 was already asked · c4 is 25 days old ·
-- c5's seeker deleted their account (UC-052 E1)
insert into public.conversations (id, listing_id, seeker_id, host_id, stay_from, stay_to, created_at, last_message_at, outcome_asked_at) values
  ('00000000-0000-0000-0000-0000000033c1', '00000000-0000-0000-0000-0000000033b1', '00000000-0000-0000-0000-0000000033a1', '00000000-0000-0000-0000-0000000033a0', current_date + 10, current_date + 17, now() - interval '15 days', now() - interval '14 days', null),
  ('00000000-0000-0000-0000-0000000033c2', '00000000-0000-0000-0000-0000000033b1', '00000000-0000-0000-0000-0000000033a2', '00000000-0000-0000-0000-0000000033a0', current_date + 10, current_date + 17, now() - interval '10 days', now() - interval '10 days', null),
  ('00000000-0000-0000-0000-0000000033c3', '00000000-0000-0000-0000-0000000033b1', '00000000-0000-0000-0000-0000000033a3', '00000000-0000-0000-0000-0000000033a0', current_date + 10, current_date + 17, now() - interval '15 days', now() - interval '15 days', now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000033c4', '00000000-0000-0000-0000-0000000033b1', '00000000-0000-0000-0000-0000000033a4', '00000000-0000-0000-0000-0000000033a0', current_date + 10, current_date + 17, now() - interval '25 days', now() - interval '25 days', null),
  ('00000000-0000-0000-0000-0000000033c5', '00000000-0000-0000-0000-0000000033b1', null, '00000000-0000-0000-0000-0000000033a0', current_date + 10, current_date + 17, now() - interval '15 days', now() - interval '15 days', null);
-- The host's reply in c1, the last message before the question.
insert into public.messages (conversation_id, sender_id, kind, body)
  values ('00000000-0000-0000-0000-0000000033c1', '00000000-0000-0000-0000-0000000033a0', 'text', 'Sure, come and see it');
update public.conversations set last_message_at = now() - interval '14 days', host_read_at = now(), seeker_read_at = now()
  where id = '00000000-0000-0000-0000-0000000033c1';

-- ----- UC-052: who is asked ---------------------------------------------------------------------
select results_eq($$select (r ->> 'conversation_id')::uuid from jsonb_array_elements(public.pending_outcome_questions()) r
    where r ->> 'conversation_id' like '00000000-0000-0000-0000-0000000033c%'$$,
  $$values ('00000000-0000-0000-0000-0000000033c1'::uuid)$$,
  'AC-052-1 only the conversation on day 14, never asked; not a younger one, an asked one, a very old one or one whose seeker left (E1)');
select is((select r ->> 'seeker_email' from jsonb_array_elements(public.pending_outcome_questions()) r
    where r ->> 'conversation_id' = '00000000-0000-0000-0000-0000000033c1'), 'outcome1@example.com',
  'to the person who searched, with their email for the Edge Function');
select is((select r ->> 'host_name' from jsonb_array_elements(public.pending_outcome_questions()) r
    where r ->> 'conversation_id' = '00000000-0000-0000-0000-0000000033c1'), 'O0', 'and who they messaged');

insert into public.notification_log (user_id, template, ref_id, status)
  select '00000000-0000-0000-0000-0000000033a1', 'NTF-005', '00000000-0000-0000-0000-0000000033c1', 'failed' from generate_series(1, 3);
select is((select count(*)::int from jsonb_array_elements(public.pending_outcome_questions()) r
    where r ->> 'conversation_id' = '00000000-0000-0000-0000-0000000033c1'), 0, 'three failed emails and it stops');
delete from public.notification_log where ref_id = '00000000-0000-0000-0000-0000000033c1';

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000033a1","role":"authenticated"}';
select throws_ok($$select public.pending_outcome_questions()$$, '42501', null, 'only the Edge Function reads the batch');
select throws_ok($$select public.mark_outcome_asked('00000000-0000-0000-0000-0000000033c1')$$, '42501', null, 'or marks a conversation as asked');
select throws_ok($$select public.answer_outcome_from_email('00000000-0000-0000-0000-0000000033c1', 'found_here')$$, '42501', null,
  'and only the outcome Edge Function answers from the email');
reset role;

-- ----- UC-052: the question in the conversation -----------------------------------------------------
select ok(public.mark_outcome_asked('00000000-0000-0000-0000-0000000033c1'), 'BR-MAIL-003 marking it as asked');
select ok((select outcome_asked_at is not null from public.conversations where id = '00000000-0000-0000-0000-0000000033c1'),
  'records when it was asked');
select is((select body from public.messages where conversation_id = '00000000-0000-0000-0000-0000000033c1' and kind = 'system'),
  'Did you find a place through SwingMate?', 'the same question appears in the conversation, from SwingMate');
select is((select sender_id from public.messages where conversation_id = '00000000-0000-0000-0000-0000000033c1' and kind = 'system'),
  null::uuid, 'from nobody');
select ok((select last_message_at < now() - interval '13 days' from public.conversations where id = '00000000-0000-0000-0000-0000000033c1'),
  'it doesn''t move the conversation up: the email is the notice');
select is((select count(*)::int from public.analytics_events where name = 'outcome_asked'
    and props ->> 'conversation_id' = '00000000-0000-0000-0000-0000000033c1'), 1, 'UC-052 records outcome_asked');
select ok(not public.mark_outcome_asked('00000000-0000-0000-0000-0000000033c1'), 'AC-007-2 a second time does nothing');
select is((select count(*)::int from public.messages where conversation_id = '00000000-0000-0000-0000-0000000033c1' and kind = 'system'), 1,
  'and the question appears once');
select is((select count(*)::int from jsonb_array_elements(public.pending_outcome_questions()) r
    where r ->> 'conversation_id' = '00000000-0000-0000-0000-0000000033c1'), 0, 'AC-052-1 never asked again');
select ok(not public.mark_outcome_asked('00000000-0000-0000-0000-0000000033c5'), 'E1 nor in a conversation whose seeker left');
select is((select count(*)::int from jsonb_array_elements(public.pending_message_emails(now() + interval '1 hour')) r
    where r ->> 'conversation_id' = '00000000-0000-0000-0000-0000000033c1'), 0, 'the question never goes out as a new-message email (NTF-003)');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000033a0","role":"authenticated"}';
select is((select last_body from public.my_conversations() where id = '00000000-0000-0000-0000-0000000033c1'), 'Sure, come and see it',
  'the host''s inbox doesn''t show the question');
select is((select unread from public.my_conversations() where id = '00000000-0000-0000-0000-0000000033c1'), false, 'nor marks it unread');
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000033a1","role":"authenticated"}';
select is((select last_body from public.my_conversations() where id = '00000000-0000-0000-0000-0000000033c1'),
  'Did you find a place through SwingMate?', 'the seeker''s does');
reset role;

-- ----- UC-007: the answer ------------------------------------------------------------------------
select is(public.answer_outcome_from_email('00000000-0000-0000-0000-0000000033c1', 'found_here') ->> 'ok', 'true',
  'AC-007-1 answering from the email');
select is((select answer || '/' || source from public.outcome_responses where conversation_id = '00000000-0000-0000-0000-0000000033c1'),
  'found_here/email', 'saved for that conversation, from the email');
select is(public.answer_outcome_from_email('00000000-0000-0000-0000-0000000033c1', 'found_here') ->> 'ok', 'true', 'the same tap twice is fine');
select is((select count(*)::int from public.analytics_events where name = 'outcome_answered'
    and props = '{"conversation_id": "00000000-0000-0000-0000-0000000033c1", "answer": "found_here", "source": "email"}'::jsonb), 1,
  'and counts once in outcome_answered');
select is(public.answer_outcome_from_email('00000000-0000-0000-0000-0000000033c2', 'found_here') ->> 'reason', 'not_asked',
  'a conversation that wasn''t asked takes no answer');
select is(public.answer_outcome_from_email('00000000-0000-0000-0000-0000000033c1', 'maybe') ->> 'reason', 'answer', 'nor an unknown answer');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000033a1","role":"authenticated"}';
select is(public.answer_outcome('00000000-0000-0000-0000-0000000033c1', 'not_yet') ->> 'answer', 'not_yet',
  'UC-007 A1 the person who searched changes it in the conversation');
select is((select answer || '/' || source from public.outcome_responses where conversation_id = '00000000-0000-0000-0000-0000000033c1'),
  'not_yet/chat', 'P-25 and reads their own answer');
select throws_ok($$insert into public.outcome_responses (conversation_id, answer, source, answered_at)
    values ('00000000-0000-0000-0000-0000000033c1', 'found_here', 'chat', now())$$, '42501', null,
  'P-25 nobody writes the table directly');
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000033a0","role":"authenticated"}';
select is(public.answer_outcome('00000000-0000-0000-0000-0000000033c1', 'found_here') ->> 'reason', 'not_found',
  'P-25 the host can''t answer for them');
select is((select count(*)::int from public.outcome_responses), 0, 'nor read the answer');
reset role;

select * from finish();
rollback;
