-- my_conversations, inquirer_card and mark_conversation_read (UC-023, UC-033, P-14, P-16,
-- BR-TRU-001, BR-TRU-003, AC-023-1, AC-023-2, AC-033-2, AC-033-4).
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into public.suburbs (id, name, state, lat, lng, timezone) values
  (973001, 'New Town', 'TAS', -42.8580, 147.3100, 'Australia/Hobart');
-- f1 host · f2 seeker · f3 someone else
insert into auth.users (id, email, email_confirmed_at, phone, phone_confirmed_at, created_at) values
  ('00000000-0000-0000-0000-0000000000f1', 'hostf@example.com', now(), '61400000004', now(), now() - interval '90 days'),
  ('00000000-0000-0000-0000-0000000000f2', 'seekerf@example.com', now(), '61400000005', now(), now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000000f3', 'otherf@example.com', now(), null, null, now() - interval '40 days');
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at, bio, work_type) values
  ('00000000-0000-0000-0000-0000000000f1', 'Ruth', 973001, 'test', now(), null, null),
  ('00000000-0000-0000-0000-0000000000f2', 'Kai', 973001, 'test', now(), 'Quiet, on site most of the month.', 'fifo'),
  ('00000000-0000-0000-0000-0000000000f3', 'Lee', 973001, 'test', now(), null, null);
insert into public.rosters (user_id, days_on, days_off, anchor_date)
  values ('00000000-0000-0000-0000-0000000000f2', 8, 6, '2026-11-02');

insert into public.listings (id, owner_id, title, suburb_id, public_lat, public_lng, place_type, bathroom,
    weekly_price, bills_included, bond, furnished, availability_type, available_from, accuracy_declared_at)
  values ('00000000-0000-0000-0000-00000000f301', '00000000-0000-0000-0000-0000000000f1', 'Sunny room near the rivulet', 973001,
    -42.8570, 147.3090, 'private_room', 'own', 250, true, 500, true, 'from_date', '2026-01-01', now());
insert into public.listing_private (listing_id, address_line, lat, lng)
  values ('00000000-0000-0000-0000-00000000f301', '9 Quiet Close', -42.8581, 147.3101);
insert into public.listing_photos (listing_id, storage_path, position, width, height)
  select '00000000-0000-0000-0000-00000000f301', '00000000-0000-0000-0000-00000000f301/' || i || '.jpg', i, 1600, 1200 from generate_series(0, 2) i;
update public.listings set status = 'active' where id = '00000000-0000-0000-0000-00000000f301';
-- The night of in + 3 is taken.
insert into public.listing_availability_exceptions (listing_id, night, available)
  values ('00000000-0000-0000-0000-00000000f301', current_date + 10, false);

create temp table t (k text primary key, v jsonb);
grant all on t to authenticated;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';
insert into t values ('conv', public.start_conversation('00000000-0000-0000-0000-00000000f301',
  'Hi Ruth, call me on 0412 345 678 if easier', current_date + 7, current_date + 14));
reset role;

-- ----- The list (P-14, AC-033-4) ----------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
select is((select count(*)::int from public.my_conversations()), 1, 'UC-023 the host sees the conversation in the inbox');
select is((select (role, other_name, listing_title, unread)::text from public.my_conversations()),
  ('host', 'Kai', 'Sunny room near the rivulet', true)::text, 'UC-023 the host row names Kai, the listing, and it is unread');
select is((select last_body from public.my_conversations()), 'Hi Ruth, call me on 0412 345 678 if easier',
  'AC-033-2 the message with a phone number arrives unchanged');
select is((select cover_path from public.my_conversations()), '00000000-0000-0000-0000-00000000f301/0.jpg', 'UC-023 the row carries the listing cover');
select is((select to_jsonb(c)::text ~ '(hostf@|seekerf@|61400000005|Quiet Close)' from public.my_conversations() c), false,
  'BR-TRU-003 the list carries no email, phone or address');

-- P-16: opening marks only the caller's side.
select public.mark_conversation_read((select (v ->> 'conversation_id')::uuid from t where k = 'conv'));
select is((select unread from public.my_conversations()), false, 'UC-033 opening the conversation marks it read for the host');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';
select is((select (role, other_name, unread, last_from_me)::text from public.my_conversations()),
  ('seeker', 'Ruth', false, true)::text, 'UC-033 the seeker row names Ruth; their own message is not unread');
select is(public.inquirer_card((select (v ->> 'conversation_id')::uuid from t where k = 'conv')), null,
  'BR-TRU-001 only the host gets the card');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f3","role":"authenticated"}';
select is((select count(*)::int from public.my_conversations()), 0, 'AC-033-4 someone else has no conversations');
select is((select count(*)::int from public.messages where conversation_id = (select (v ->> 'conversation_id')::uuid from t where k = 'conv')), 0,
  'AC-033-4 asking for the messages by id returns nothing');
select is(public.inquirer_card((select (v ->> 'conversation_id')::uuid from t where k = 'conv')), null,
  'AC-033-4 nor the card');
select public.mark_conversation_read((select (v ->> 'conversation_id')::uuid from t where k = 'conv'));
reset role;
select is((select host_read_at is not null and seeker_read_at is not null from public.conversations
  where id = (select (v ->> 'conversation_id')::uuid from t where k = 'conv')), true, 'P-16 an outsider changes no read mark');

set local role anon;
select throws_ok($$ select * from public.my_conversations() $$, '42501', null, 'P-14 a visitor has no inbox');
reset role;

-- ----- The card (BR-TRU-001, AC-023-1, AC-023-2) -------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
insert into t values ('card', public.inquirer_card((select (v ->> 'conversation_id')::uuid from t where k = 'conv')));
select is((select v ->> 'display_name' from t where k = 'card'), 'Kai', 'AC-023-1 the card has the name');
select is((select (v ->> 'base_suburb', v ->> 'work_type', v ->> 'bio')::text from t where k = 'card'),
  ('New Town, TAS', 'fifo', 'Quiet, on site most of the month.')::text, 'AC-023-1 base suburb, work type and bio');
select is((select v -> 'roster_pattern' from t where k = 'card'), '{"days_on": 8, "days_off": 6}'::jsonb, 'AC-023-1 the roster pattern');
select is((select (v ->> 'email_verified', v ->> 'phone_verified', v ->> 'hosts_this_month')::text from t where k = 'card'),
  ('true', 'true', '1')::text, 'AC-023-1 verifications and activity');
select is((select v ->> 'nights' from t where k = 'card'), '1110111',
  'AC-023-2 the requested nights against the calendar today: in + 3 is taken');
select is((select v::text ~ '(hostf@|seekerf@|61400000005|Quiet Close|-42\.8581)' from t where k = 'card'), false,
  'AC-023-1 the card never has email, phone or address');
reset role;

-- BR-ACC-007: a deleted account is a null name in the list and no card.
delete from auth.users where id = '00000000-0000-0000-0000-0000000000f2';
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
select is((select other_name from public.my_conversations()), null, 'UC-023 E1 the person who deleted their account has no name');
reset role;

select * from finish();
rollback;
