-- risk_flag on messages (BR-MSG-008, AC-033-2, AC-033-3, issue #23). The phrase-by-phrase parity
-- with core/text-checks.js is in 12_risk_parity.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into public.suburbs (id, name, state, lat, lng, timezone) values
  (74001, 'Sandy Bay', 'TAS', -42.9000, 147.3300, 'Australia/Hobart');
-- 91 host · 92 seeker
insert into auth.users (id, email, email_confirmed_at, phone, phone_confirmed_at, created_at) values
  ('00000000-0000-0000-0000-000000000091', 'hostr@example.com', now(), '61400000006', now(), now() - interval '90 days'),
  ('00000000-0000-0000-0000-000000000092', 'seekerr@example.com', now(), null, null, now() - interval '30 days');
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at) values
  ('00000000-0000-0000-0000-000000000091', 'Rita', 74001, 'test', now()),
  ('00000000-0000-0000-0000-000000000092', 'Jo', 74001, 'test', now());

insert into public.listings (id, owner_id, title, suburb_id, public_lat, public_lng, place_type, bathroom,
    weekly_price, bills_included, bond, furnished, availability_type, available_from, accuracy_declared_at)
  values ('00000000-0000-0000-0000-000000009301', '00000000-0000-0000-0000-000000000091', 'Room by the bay', 74001,
    -42.9010, 147.3310, 'private_room', 'own', 260, true, 520, true, 'from_date', '2026-01-01', now());
insert into public.listing_private (listing_id, address_line, lat, lng)
  values ('00000000-0000-0000-0000-000000009301', '1 Shore St', -42.9001, 147.3301);
insert into public.listing_photos (listing_id, storage_path, position, width, height)
  select '00000000-0000-0000-0000-000000009301', '00000000-0000-0000-0000-000000009301/' || i || '.jpg', i, 1600, 1200 from generate_series(0, 2) i;
update public.listings set status = 'active' where id = '00000000-0000-0000-0000-000000009301';

create temp table t (k text primary key, v jsonb);
grant all on t to authenticated;

-- The seeker's inquiry is ordinary.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000092","role":"authenticated"}';
insert into t values ('conv', public.start_conversation('00000000-0000-0000-0000-000000009301',
  'Hi Rita, is the room free for my R&R?', current_date + 7, current_date + 14));
reset role;

-- The host replies asking for money before a visit, and then writes an ordinary line.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000091","role":"authenticated"}';
insert into public.messages (conversation_id, sender_id, kind, body)
  select (v ->> 'conversation_id')::uuid, '00000000-0000-0000-0000-000000000091', 'text',
    'Yes! Send the bond via PayID today and it''s yours' from t where k = 'conv';
insert into public.messages (conversation_id, sender_id, kind, body)
  select (v ->> 'conversation_id')::uuid, '00000000-0000-0000-0000-000000000091', 'text',
    'Happy to show you around on Saturday' from t where k = 'conv';
select throws_ok(format($$ insert into public.messages (conversation_id, sender_id, kind, body, risk_flag)
    values (%L, '00000000-0000-0000-0000-000000000091', 'text', 'Hello', true) $$,
    (select v ->> 'conversation_id' from t where k = 'conv')),
  '42501', null, 'BR-MSG-008 nobody sets risk_flag from the web');
select throws_ok($$ select public.risk_check('send money') $$, '42501', null,
  'BR-MSG-008 only the trigger calls risk_check');
reset role;

-- What the seeker reads (P-17).
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000092","role":"authenticated"}';
select is((select risk_flag from public.messages where kind = 'inquiry'
    and conversation_id = (select (v ->> 'conversation_id')::uuid from t where k = 'conv')), false,
  'BR-MSG-008 an ordinary inquiry is not flagged');
select is((select risk_flag from public.messages where body like 'Yes! Send the bond%'), true,
  'AC-033-3 a message asking for the bond by PayID before a visit is flagged');
select is((select body from public.messages where risk_flag), 'Yes! Send the bond via PayID today and it''s yours',
  'AC-033-2 the flagged message arrives unchanged');
select is((select risk_flag from public.messages where body like 'Happy to show%'), false,
  'BR-MSG-008 an ordinary reply is not flagged');
select is((select count(*)::int from public.messages
    where conversation_id = (select (v ->> 'conversation_id')::uuid from t where k = 'conv')), 3,
  'AC-033-2 nothing is blocked: the three messages are there');
reset role;

-- An inquiry that asks for documents is flagged too.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000092","role":"authenticated"}';
select public.start_conversation('00000000-0000-0000-0000-000000009301',
  'Do you need a copy of my PASSPORT or my payslips?', current_date + 7, current_date + 14);
select is((select risk_flag from public.messages where body like 'Do you need%'), true,
  'AC-033-3 an inquiry asking about passport and payslips is flagged, whatever the case');
reset role;

select * from finish();
rollback;
