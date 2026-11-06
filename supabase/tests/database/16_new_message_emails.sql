-- pending_message_emails and notification_preferences (UC-050, BR-MAIL-001, NTF-003, AC-050-1,
-- AC-050-2, P-13). Messages get created_at = now() from the trigger, so "10 minutes later" is p_now.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into public.suburbs (id, name, state, lat, lng, timezone) values
  (977001, 'Kingston', 'TAS', -42.9760, 147.3080, 'Australia/Hobart');
-- 61 host · 62 seeker · 63 someone else
insert into auth.users (id, email, email_confirmed_at, phone, phone_confirmed_at, created_at) values
  ('00000000-0000-0000-0000-000000000061', 'hostm@example.com', now(), '61400000008', now(), now() - interval '90 days'),
  ('00000000-0000-0000-0000-000000000062', 'seekerm@example.com', now(), null, null, now() - interval '30 days'),
  ('00000000-0000-0000-0000-000000000063', 'otherm@example.com', now(), null, null, now() - interval '30 days');
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at) values
  ('00000000-0000-0000-0000-000000000061', 'Ida', 977001, 'test', now()),
  ('00000000-0000-0000-0000-000000000062', 'Jai', 977001, 'test', now()),
  ('00000000-0000-0000-0000-000000000063', 'Kit', 977001, 'test', now());

insert into public.listings (id, owner_id, title, suburb_id, public_lat, public_lng, place_type, bathroom,
    weekly_price, bills_included, bond, furnished, availability_type, available_from, accuracy_declared_at)
  values ('00000000-0000-0000-0000-000000006301', '00000000-0000-0000-0000-000000000061', 'Room near the beach', 977001,
    -42.9770, 147.3090, 'private_room', 'own', 220, true, 440, true, 'from_date', '2026-01-01', now());
insert into public.listing_private (listing_id, address_line, lat, lng)
  values ('00000000-0000-0000-0000-000000006301', '4 Sand St', -42.9761, 147.3081);
insert into public.listing_photos (listing_id, storage_path, position, width, height)
  select '00000000-0000-0000-0000-000000006301', '00000000-0000-0000-0000-000000006301/' || i || '.jpg', i, 1600, 1200 from generate_series(0, 2) i;
update public.listings set status = 'active' where id = '00000000-0000-0000-0000-000000006301';

create temp table t (k text primary key, v jsonb);
grant all on t to authenticated;

-- The seeker sends the inquiry and two more lines straight after (AC-050-1).
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000062","role":"authenticated"}';
insert into t values ('conv', public.start_conversation('00000000-0000-0000-0000-000000006301',
  'Hi Ida, is the room free? Call me on 0412 000 111', current_date + 7, current_date + 14));
insert into public.messages (conversation_id, sender_id, kind, body)
  select (v ->> 'conversation_id')::uuid, '00000000-0000-0000-0000-000000000062', 'text', m
  from t, unnest(array['I work 8:6 at the port', 'Parking would be great']) m where k = 'conv';
reset role;

insert into t values ('later', to_jsonb(public.pending_message_emails(now() + interval '11 minutes')));
select is((select jsonb_array_length(v) from t where k = 'later'), 1, 'AC-050-1 three messages in a row make one email');
select is((select v -> 0 ->> 'recipient_email' from t where k = 'later'), 'hostm@example.com', 'NTF-003 it goes to the host');
select is((select v -> 0 -> 'messages' from t where k = 'later'),
  '["Hi Ida, is the room free? Call me on 0412 000 111", "I work 8:6 at the port", "Parking would be great"]'::jsonb,
  'AC-050-1 with the three messages in order, as written (BR-MSG-004)');
select is((select (v -> 0 ->> 'is_inquiry', v -> 0 ->> 'sender_name', v -> 0 ->> 'recipient_role', length(v -> 0 ->> 'nights'))::text from t where k = 'later'),
  ('true', 'Jai', 'host', 7)::text, 'NTF-003 the first inquiry carries the sender, the role and the 7 nights for the fit line');
select is((select v::text ~ '(seekerm@|61400000008|Sand St)' from t where k = 'later'), false,
  'NTF-003 AC-3 nothing private about the sender or the address');
select is(jsonb_array_length(public.pending_message_emails(now() + interval '5 minutes')), 0,
  'BR-MAIL-001 nothing before 10 minutes');
select is(jsonb_array_length(public.pending_message_emails(now() + interval '8 days')), 0,
  'UC-050 messages older than a week are left alone');

-- BR-MAIL-001: after an email to the host about this conversation, nothing more for an hour.
insert into public.notification_log (user_id, template, ref_id, status)
  select '00000000-0000-0000-0000-000000000061', 'NTF-003', (v ->> 'conversation_id')::uuid, 'sent' from t where k = 'conv';
select is(jsonb_array_length(public.pending_message_emails(now() + interval '11 minutes')), 0,
  'BR-MAIL-001 one email per conversation per hour');
select is(jsonb_array_length(public.pending_message_emails(now() + interval '61 minutes')), 1,
  'BR-MAIL-001 after the hour, the still unread messages go in the next email');
delete from public.notification_log;

-- A1, AC-4: with the emails off, the first inquiry still goes.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000061","role":"authenticated"}';
insert into public.notification_preferences (new_messages) values (false);
reset role;
select is(jsonb_array_length(public.pending_message_emails(now() + interval '11 minutes')), 1,
  'BR-MAIL-001 a new inquiry is always emailed, even with the emails off');

-- AC-050-2: once the host has read them, no email.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000061","role":"authenticated"}';
select public.mark_conversation_read((select (v ->> 'conversation_id')::uuid from t where k = 'conv'));
insert into public.messages (conversation_id, sender_id, kind, body)
  select (v ->> 'conversation_id')::uuid, '00000000-0000-0000-0000-000000000061', 'text', 'Yes it is free' from t where k = 'conv';
reset role;
-- In one transaction every now() is the same instant: put the seeker's last read before the reply.
update public.conversations set seeker_read_at = now() - interval '1 hour'
  where id = (select (v ->> 'conversation_id')::uuid from t where k = 'conv');
insert into t values ('reply', to_jsonb(public.pending_message_emails(now() + interval '11 minutes')));
select is((select jsonb_array_length(v) from t where k = 'reply'), 1, 'AC-050-2 the messages the host read are not emailed');
select is((select (v -> 0 ->> 'recipient_email', v -> 0 ->> 'is_inquiry', v -> 0 ->> 'nights')::text from t where k = 'reply'),
  ('seekerm@example.com', 'false', null)::text, 'NTF-003 the reply goes to the seeker, as a follow-up');

-- A1: the seeker switches them off, and a reply is not an inquiry.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000062","role":"authenticated"}';
insert into public.notification_preferences (new_messages) values (false);
select is((select count(*)::int from public.notification_preferences), 1, 'P-13 each person reads only their own settings');
select throws_ok($$ insert into public.notification_preferences (user_id, new_messages) values ('00000000-0000-0000-0000-000000000063', false) $$,
  '42501', null, 'P-13 nobody changes someone else''s settings');
select throws_ok($$ select public.pending_message_emails() $$, '42501', null, 'only the Edge Function reads the batch');
reset role;
select is(jsonb_array_length(public.pending_message_emails(now() + interval '11 minutes')), 0,
  'AC-4 with the emails off, a follow-up message is not emailed');

select * from finish();
rollback;
