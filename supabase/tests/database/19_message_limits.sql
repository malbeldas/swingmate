-- Limits against spam (issue #24): SEC-11 hourly messages, and AC-024-1 (a host who asks for a
-- verified phone still gets replies in conversations already open). SEC-10 (AC-004-7) and
-- AC-004-6 are in 10_conversations.sql; SEC-12 in 14_reports.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into public.suburbs (id, name, state, lat, lng, timezone) values
  (78201, 'Bicheno', 'TAS', -41.8740, 148.3000, 'Australia/Hobart');
-- 71 host · 72 seeker · 73 another seeker
insert into auth.users (id, email, email_confirmed_at, phone, phone_confirmed_at, created_at) values
  ('00000000-0000-0000-0000-000000000071', 'bhost@example.com', now(), '61400000071', now(), now() - interval '90 days'),
  ('00000000-0000-0000-0000-000000000072', 'bseek@example.com', now(), null, null, now() - interval '30 days'),
  ('00000000-0000-0000-0000-000000000073', 'bseek2@example.com', now(), null, null, now() - interval '30 days');
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at) values
  ('00000000-0000-0000-0000-000000000071', 'Bea', 78201, 'test', now()),
  ('00000000-0000-0000-0000-000000000072', 'Cal', 78201, 'test', now()),
  ('00000000-0000-0000-0000-000000000073', 'Dee', 78201, 'test', now());

insert into public.listings (id, owner_id, title, suburb_id, public_lat, public_lng, place_type, bathroom,
    weekly_price, bills_included, bond, furnished, availability_type, available_from, accuracy_declared_at)
  values ('00000000-0000-0000-0000-000000007101', '00000000-0000-0000-0000-000000000071', 'Room by the blowhole', 78201,
    -41.8750, 148.3010, 'private_room', 'own', 200, true, 400, true, 'from_date', '2026-01-01', now());
insert into public.listing_private (listing_id, address_line, lat, lng)
  values ('00000000-0000-0000-0000-000000007101', '2 Gulch Rd', -41.8741, 148.3001);
insert into public.listing_photos (listing_id, storage_path, position, width, height)
  select '00000000-0000-0000-0000-000000007101', '00000000-0000-0000-0000-000000007101/' || i || '.jpg', i, 1600, 1200 from generate_series(0, 2) i;
update public.listings set status = 'active' where id = '00000000-0000-0000-0000-000000007101';

create temp table t (k text primary key, v jsonb);
grant all on t to authenticated;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000072","role":"authenticated"}';
insert into t values ('c', public.start_conversation('00000000-0000-0000-0000-000000007101', 'Hi, is it free?', current_date + 7, current_date + 14));
reset role;
insert into t select 'id', to_jsonb(v ->> 'conversation_id') from t where k = 'c';

-- AC-024-1: the host now asks for a verified phone. Cal, who has none, keeps the conversation.
update public.profiles set message_rule = 'phone' where id = '00000000-0000-0000-0000-000000000071';
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000072","role":"authenticated"}';
select lives_ok($$insert into public.messages (conversation_id, sender_id, kind, body)
  select (v #>> '{}')::uuid, '00000000-0000-0000-0000-000000000072', 'text', 'Still keen, any news?' from t where k = 'id'$$,
  'AC-024-1 an open conversation goes on after the host asks for a verified phone');
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000073","role":"authenticated"}';
select is(public.start_conversation('00000000-0000-0000-0000-000000007101', 'Hello!', current_date + 7, current_date + 14) ->> 'reason',
  'phone', 'AC-024-1 someone new without a verified phone cannot start one');
reset role;

-- SEC-11: Cal has sent 2 messages; 58 more reach 60 in the hour.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000072","role":"authenticated"}';
select lives_ok($$insert into public.messages (conversation_id, sender_id, kind, body)
  select (v #>> '{}')::uuid, '00000000-0000-0000-0000-000000000072', 'text', 'ping ' || i from t, generate_series(1, 58) i where k = 'id'$$,
  'SEC-11 up to 60 messages in an hour go through');
select throws_ok($$insert into public.messages (conversation_id, sender_id, kind, body)
  select (v #>> '{}')::uuid, '00000000-0000-0000-0000-000000000072', 'text', 'one more' from t where k = 'id'$$,
  '54000', 'hourlyLimit', 'SEC-11 the 61st message in an hour is refused');
reset role;

-- The other side of the conversation has its own count.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000071","role":"authenticated"}';
select lives_ok($$insert into public.messages (conversation_id, sender_id, kind, body)
  select (v #>> '{}')::uuid, '00000000-0000-0000-0000-000000000071', 'text', 'Slow down please' from t where k = 'id'$$,
  'SEC-11 the limit is per person: the host still answers');
reset role;

-- An hour later the count starts again.
update public.messages set created_at = now() - interval '61 minutes' where sender_id = '00000000-0000-0000-0000-000000000072';
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000072","role":"authenticated"}';
select lives_ok($$insert into public.messages (conversation_id, sender_id, kind, body)
  select (v #>> '{}')::uuid, '00000000-0000-0000-0000-000000000072', 'text', 'Back again' from t where k = 'id'$$,
  'SEC-11 messages older than an hour no longer count');
reset role;
select is((select count(*)::int from public.messages where sender_id = '00000000-0000-0000-0000-000000000072'), 61,
  'SEC-11 the refused message was not stored');

select * from finish();
rollback;
