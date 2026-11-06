-- AC-002-3: changing or removing the roster never moves the dates of inquiries already sent.
-- UC-002, BR-ROS-005, BR-MSG-001.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into public.suburbs (id, name, state, lat, lng, timezone) values
  (971501, 'Broome', 'WA', -17.9614, 122.2359, 'Australia/Perth');
-- 15a1 host · 15a2 seeker with a 14:7 roster
insert into auth.users (id, email, email_confirmed_at, phone, phone_confirmed_at, created_at) values
  ('00000000-0000-0000-0000-0000000015a1', 'host15@example.com', now(), '61400000015', now(), now() - interval '60 days'),
  ('00000000-0000-0000-0000-0000000015a2', 'seeker15@example.com', now(), null, null, now() - interval '30 days');
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at) values
  ('00000000-0000-0000-0000-0000000015a1', 'Ivy', 971501, 'test', now()),
  ('00000000-0000-0000-0000-0000000015a2', 'Raf', 971501, 'test', now());
insert into public.rosters (user_id, days_on, days_off, anchor_date)
  values ('00000000-0000-0000-0000-0000000015a2', 14, 7, current_date + 3);

insert into public.listings (id, owner_id, title, suburb_id, place_type, bathroom, weekly_price,
    bills_included, bond, furnished, availability_type, available_from, accuracy_declared_at)
  values ('00000000-0000-0000-0000-0000000015b1', '00000000-0000-0000-0000-0000000015a1', 'Room by the bay', 971501,
    'private_room', 'own', 260, true, 520, true, 'from_date', current_date - 10, now());
insert into public.listing_private (listing_id, address_line, lat, lng)
  values ('00000000-0000-0000-0000-0000000015b1', '9 Bay Rd', -17.9615, 122.2360);
insert into public.listing_photos (listing_id, storage_path, position, width, height)
  select '00000000-0000-0000-0000-0000000015b1', '00000000-0000-0000-0000-0000000015b1/' || i || '.jpg', i, 1600, 1200
  from generate_series(0, 2) i;
update public.listings set status = 'active' where id = '00000000-0000-0000-0000-0000000015b1';

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000015a2","role":"authenticated"}';
select is(public.start_conversation('00000000-0000-0000-0000-0000000015b1', 'Hi, I am in town on my R&R.',
  current_date + 17, current_date + 25) ->> 'ok', 'true', 'UC-004 the inquiry is sent with the stay of the roster');

-- A new pattern and anchor, then no fixed roster at all.
update public.rosters set days_on = 8, days_off = 6, anchor_date = current_date + 1, fly_out_first_day = false
  where user_id = '00000000-0000-0000-0000-0000000015a2';
select results_eq(
  $$select stay_from, stay_to from public.conversations where listing_id = '00000000-0000-0000-0000-0000000015b1'$$,
  $$values (current_date + 17, current_date + 25)$$,
  'AC-002-3 editing the roster leaves the conversation dates as they were');
select results_eq(
  $$select m.stay_from, m.stay_to from public.messages m join public.conversations c on c.id = m.conversation_id
    where c.listing_id = '00000000-0000-0000-0000-0000000015b1' and m.kind = 'inquiry'$$,
  $$values (current_date + 17, current_date + 25)$$,
  'AC-002-3 and the dates in the first message too');
delete from public.rosters where user_id = '00000000-0000-0000-0000-0000000015a2';
select results_eq(
  $$select stay_from, stay_to from public.conversations where listing_id = '00000000-0000-0000-0000-0000000015b1'$$,
  $$values (current_date + 17, current_date + 25)$$,
  'AC-002-3 BR-ROS-005 removing the roster keeps them too');
reset role;

select * from finish();
rollback;
