-- NTF-005 follows the reminders setting (BR-MAIL-005): pending_outcome_questions says whether the
-- email may go out (email_on); the conversation is still in the batch so the question is asked in it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into public.suburbs (id, name, state, lat, lng, timezone) values
  (973902, 'Karratha', 'WA', -20.7364, 116.8463, 'Australia/Perth');
-- 39a0 host · 39a1 seeker with no preferences row · 39a2 seeker with reminders off
insert into auth.users (id, email, email_confirmed_at, created_at)
  select ('00000000-0000-0000-0000-0000000039a' || i)::uuid, 'optout' || i || '@example.com', now(), now() - interval '60 days'
  from generate_series(0, 2) i;
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at)
  select id, 'P' || right(id::text, 1), 973902, 'test', now() from auth.users where id::text like '00000000-0000-0000-0000-0000000039a%';
insert into public.listings (id, owner_id, title, suburb_id, place_type, bathroom, weekly_price,
    bills_included, bond, furnished, availability_type, available_from, accuracy_declared_at)
  values ('00000000-0000-0000-0000-0000000039b1', '00000000-0000-0000-0000-0000000039a0', 'Karratha room', 973902,
    'private_room', 'own', 250, true, 500, true, 'from_date', current_date - 40, now());
insert into public.conversations (id, listing_id, seeker_id, host_id, stay_from, stay_to, created_at, last_message_at) values
  ('00000000-0000-0000-0000-0000000039c1', '00000000-0000-0000-0000-0000000039b1', '00000000-0000-0000-0000-0000000039a1', '00000000-0000-0000-0000-0000000039a0', current_date + 10, current_date + 17, now() - interval '15 days', now() - interval '15 days'),
  ('00000000-0000-0000-0000-0000000039c2', '00000000-0000-0000-0000-0000000039b1', '00000000-0000-0000-0000-0000000039a2', '00000000-0000-0000-0000-0000000039a0', current_date + 10, current_date + 17, now() - interval '15 days', now() - interval '15 days');
insert into public.notification_preferences (user_id, reminders) values ('00000000-0000-0000-0000-0000000039a2', false);

select is((select (r ->> 'email_on')::boolean from jsonb_array_elements(public.pending_outcome_questions()) r
    where r ->> 'conversation_id' = '00000000-0000-0000-0000-0000000039c1'), true,
  'BR-MAIL-005 no preferences row means the email goes out');
select is((select (r ->> 'email_on')::boolean from jsonb_array_elements(public.pending_outcome_questions()) r
    where r ->> 'conversation_id' = '00000000-0000-0000-0000-0000000039c2'), false,
  'BR-MAIL-005 with reminders off the email does not go out');
select is((select count(*)::int from jsonb_array_elements(public.pending_outcome_questions()) r
    where r ->> 'conversation_id' = '00000000-0000-0000-0000-0000000039c2'), 1,
  'UC-052 but the conversation is still in the batch, so the question is asked in it');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000039a2","role":"authenticated"}';
select throws_ok($$select public.pending_outcome_questions()$$, '42501', null, 'only the Edge Function reads the batch');
reset role;

select * from finish();
rollback;
