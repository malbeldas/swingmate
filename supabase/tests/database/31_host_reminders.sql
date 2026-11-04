-- Host reminders (#32): pending_host_reminders (NTF-004), pending_calendar_checks (NTF-006) and
-- confirm_calendar_from_email. UC-051, UC-054, AC-051-1, AC-054-1, BR-MAIL-002, BR-AVL-006, BR-MAIL-005.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into public.suburbs (id, name, state, lat, lng, timezone) values
  (73601, 'Dampier', 'WA', -20.6630, 116.7130, 'Australia/Perth');
-- 32a0 host · 32a1..32a6 seekers
insert into auth.users (id, email, email_confirmed_at, created_at)
  select ('00000000-0000-0000-0000-0000000032a' || i)::uuid, 'remind' || i || '@example.com', now(), now() - interval '60 days'
  from generate_series(0, 6) i;
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at)
  select id, 'R' || right(id::text, 1), 73601, 'test', now() from auth.users where id::text like '00000000-0000-0000-0000-0000000032a%';

insert into public.listings (id, owner_id, title, suburb_id, place_type, bathroom, weekly_price,
    bills_included, bond, furnished, availability_type, available_from, accuracy_declared_at)
  select ('00000000-0000-0000-0000-0000000032b' || i)::uuid, '00000000-0000-0000-0000-0000000032a0', 'Dampier room ' || i, 73601,
    'private_room', 'own', 250, true, 500, true, 'from_date', current_date - 40, now()
  from generate_series(1, 3) i;
-- What publishing needs (BR-LST-003): a verified phone, the address and 3 photos.
update auth.users set phone = '61400000032', phone_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000032a0';
insert into public.listing_private (listing_id, address_line, lat, lng)
  select id, '1 Port Rd', -20.6631, 116.7131 from public.listings where id::text like '00000000-0000-0000-0000-0000000032b%';
insert into public.listing_photos (listing_id, storage_path, position, width, height)
  select l.id, l.id || '/' || i || '.jpg', i, 1600, 1200 from public.listings l, generate_series(0, 2) i
  where l.id::text like '00000000-0000-0000-0000-0000000032b%';
update public.listings set status = 'active' where id::text like '00000000-0000-0000-0000-0000000032b%';
update public.listings set status = 'paused' where id = '00000000-0000-0000-0000-0000000032b3';

-- c1 waits 3 days · c2 waits 1 day · c3 answered · c4 already reminded · c5 on a paused listing ·
-- c6 is 20 days old
insert into public.conversations (id, listing_id, seeker_id, host_id, stay_from, stay_to, created_at, first_reply_at, reminder_sent_at) values
  ('00000000-0000-0000-0000-0000000032c1', '00000000-0000-0000-0000-0000000032b1', '00000000-0000-0000-0000-0000000032a1', '00000000-0000-0000-0000-0000000032a0', current_date + 10, current_date + 17, now() - interval '3 days', null, null),
  ('00000000-0000-0000-0000-0000000032c2', '00000000-0000-0000-0000-0000000032b1', '00000000-0000-0000-0000-0000000032a2', '00000000-0000-0000-0000-0000000032a0', current_date + 10, current_date + 17, now() - interval '1 day', null, null),
  ('00000000-0000-0000-0000-0000000032c3', '00000000-0000-0000-0000-0000000032b1', '00000000-0000-0000-0000-0000000032a3', '00000000-0000-0000-0000-0000000032a0', current_date + 10, current_date + 17, now() - interval '3 days', now() - interval '2 days', null),
  ('00000000-0000-0000-0000-0000000032c4', '00000000-0000-0000-0000-0000000032b1', '00000000-0000-0000-0000-0000000032a4', '00000000-0000-0000-0000-0000000032a0', current_date + 10, current_date + 17, now() - interval '3 days', null, now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000032c5', '00000000-0000-0000-0000-0000000032b3', '00000000-0000-0000-0000-0000000032a5', '00000000-0000-0000-0000-0000000032a0', current_date + 10, current_date + 17, now() - interval '3 days', null, null),
  ('00000000-0000-0000-0000-0000000032c6', '00000000-0000-0000-0000-0000000032b2', '00000000-0000-0000-0000-0000000032a6', '00000000-0000-0000-0000-0000000032a0', current_date + 10, current_date + 17, now() - interval '20 days', null, null);

-- ----- NTF-004 ---------------------------------------------------------------------------------------
select results_eq($$select (r ->> 'conversation_id')::uuid from jsonb_array_elements(public.pending_host_reminders()) r$$,
  $$values ('00000000-0000-0000-0000-0000000032c1'::uuid)$$,
  'BR-MAIL-002 only the enquiry unanswered for 48 hours, not answered, not reminded, on an active listing (AC-2)');
select is((select r ->> 'host_email' from jsonb_array_elements(public.pending_host_reminders()) r), 'remind0@example.com',
  'with the host''s email for the Edge Function');
select is((select r ->> 'seeker_name' from jsonb_array_elements(public.pending_host_reminders()) r), 'R1', 'and who is waiting');

insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-0000000032a0', '00000000-0000-0000-0000-0000000032a1');
select is(jsonb_array_length(public.pending_host_reminders()), 0, 'never about someone the host blocked');
delete from public.blocks where blocker_id = '00000000-0000-0000-0000-0000000032a0';

insert into public.notification_preferences (user_id, reminders) values ('00000000-0000-0000-0000-0000000032a0', false);
select is(jsonb_array_length(public.pending_host_reminders()), 0, 'BR-MAIL-005 nor to a host who switched reminders off');
delete from public.notification_preferences where user_id = '00000000-0000-0000-0000-0000000032a0';

insert into public.notification_log (user_id, template, ref_id, status)
  select '00000000-0000-0000-0000-0000000032a0', 'NTF-004', '00000000-0000-0000-0000-0000000032c1', 'failed' from generate_series(1, 3);
select is(jsonb_array_length(public.pending_host_reminders()), 0, 'UC-051 E1 three failed emails and it stops');
delete from public.notification_log where ref_id = '00000000-0000-0000-0000-0000000032c1';

update public.conversations set reminder_sent_at = now() where id = '00000000-0000-0000-0000-0000000032c1';
select is(jsonb_array_length(public.pending_host_reminders()), 0, 'AC-051-1 once reminded, never again');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000032a0","role":"authenticated"}';
select throws_ok($$select public.pending_host_reminders()$$, '42501', null, 'only the Edge Function reads the batch');
select throws_ok($$select public.confirm_calendar_from_email('00000000-0000-0000-0000-0000000032b1')$$, '42501', null,
  'and only calendar-confirm confirms from the email');
reset role;

-- ----- NTF-006 ---------------------------------------------------------------------------------------
update public.listings set calendar_confirmed_at = now() - interval '31 days' where id::text like '00000000-0000-0000-0000-0000000032b%';
update public.listings set calendar_confirmed_at = now() - interval '10 days' where id = '00000000-0000-0000-0000-0000000032b2';
select results_eq($$select (r ->> 'listing_id')::uuid from jsonb_array_elements(public.pending_calendar_checks()) r where r ->> 'host_email' = 'remind0@example.com'$$,
  $$values ('00000000-0000-0000-0000-0000000032b1'::uuid)$$,
  'BR-AVL-006 an active listing with 30 days without a calendar change; not a recent one, not a paused one (AC-2)');
select is((select length(r ->> 'availability') from jsonb_array_elements(public.pending_calendar_checks()) r where r ->> 'host_email' = 'remind0@example.com'), 28,
  'with its next 4 weeks for the email');

insert into public.notification_log (user_id, template, ref_id, status)
  values ('00000000-0000-0000-0000-0000000032a0', 'NTF-006', '00000000-0000-0000-0000-0000000032b1', 'sent');
select is((select count(*)::int from jsonb_array_elements(public.pending_calendar_checks()) r where r ->> 'host_email' = 'remind0@example.com'), 0,
  'one check per 30 days');
select is((select count(*)::int from jsonb_array_elements(public.pending_calendar_checks(now() + interval '31 days')) r where r ->> 'listing_id' = '00000000-0000-0000-0000-0000000032b1'), 1,
  'UC-054 and again 30 days later while the host doesn''t confirm');

-- ----- AC-054-1 --------------------------------------------------------------------------------------
select is(public.confirm_calendar_from_email('00000000-0000-0000-0000-0000000032b1'),
  '{"ok": true, "title": "Dampier room 1"}'::jsonb, 'AC-054-1 confirming from the email');
select ok((select calendar_confirmed_at > now() - interval '1 minute' from public.listings where id = '00000000-0000-0000-0000-0000000032b1'),
  'moves "Calendar updated" to today');
delete from public.notification_log where template = 'NTF-006';
select is((select count(*)::int from jsonb_array_elements(public.pending_calendar_checks(now() + interval '29 days')) r where r ->> 'listing_id' = '00000000-0000-0000-0000-0000000032b1'), 0,
  'and the next check waits 30 days from the confirmation');
update public.listings set status = 'removed', removed_at = now() where id = '00000000-0000-0000-0000-0000000032b2';
select is(public.confirm_calendar_from_email('00000000-0000-0000-0000-0000000032b2') ->> 'reason', 'status', 'a removed listing can''t be confirmed');

select * from finish();
rollback;
