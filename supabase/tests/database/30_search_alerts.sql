-- Alerts (#31): search_alerts, alert_deliveries, alerts_limit, renew_alert, pending_alerts.
-- UC-006, UC-053, AC-006-1, AC-006-2, BR-MAIL-004, BR-MAIL-005, P-13.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into public.suburbs (id, name, state, lat, lng, timezone) values
  (973501, 'Karratha', 'WA', -20.7364, 116.8463, 'Australia/Perth');
-- 31a1 seeker with a roster · 31a2 another seeker · 31a3 unconfirmed email · 31a4 alerts switched off
insert into auth.users (id, email, email_confirmed_at, created_at, last_sign_in_at) values
  ('00000000-0000-0000-0000-0000000031a1', 'alerts1@example.com', now(), now() - interval '30 days', now()),
  ('00000000-0000-0000-0000-0000000031a2', 'alerts2@example.com', now(), now() - interval '30 days', now()),
  ('00000000-0000-0000-0000-0000000031a3', 'alerts3@example.com', null, now() - interval '30 days', now()),
  ('00000000-0000-0000-0000-0000000031a4', 'alerts4@example.com', now(), now() - interval '30 days', now());
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at)
  select id, 'P' || right(id::text, 2), 973501, 'test', now() from auth.users where id::text like '00000000-0000-0000-0000-0000000031a%';
insert into public.rosters (user_id, days_on, days_off, anchor_date)
  values ('00000000-0000-0000-0000-0000000031a1', 14, 7, current_date);
insert into public.notification_preferences (user_id, alerts) values ('00000000-0000-0000-0000-0000000031a4', false);

create temp table t (k text primary key, v uuid);
grant all on t to authenticated;

-- ----- P-13: each person their own -------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000031a1","role":"authenticated"}';
insert into public.search_alerts (suburb_id, radius_km, use_roster) values (973501, 15, true);
insert into t select 'roster', id from public.search_alerts where use_roster;
select is((select count(*)::int from public.search_alerts), 1, 'UC-006 a member creates an alert with their roster');
select is((select expires_at::date from public.search_alerts), (now() + interval '90 days')::date, 'BR-MAIL-004 it lasts 90 days');
select throws_ok($$insert into public.search_alerts (user_id, suburb_id, radius_km, use_roster) values ('00000000-0000-0000-0000-0000000031a2', 973501, 15, true)$$,
  '42501', null, 'P-13 never for someone else');
select throws_ok($$insert into public.search_alerts (suburb_id, radius_km, stay_from, stay_to, use_roster) values (973501, 15, current_date + 10, current_date + 17, true)$$,
  '23514', null, 'BR-SRC-001 dates or the roster, not both');
select throws_ok($$insert into public.search_alerts (suburb_id, radius_km, use_roster) values (973501, 15, false)$$,
  '23514', null, 'and never neither');
select throws_ok($$insert into public.search_alerts (suburb_id, radius_km, use_roster) values (973501, 7, true)$$,
  '23514', null, 'BR-SRC-003 only the radius choices of the search');
select throws_ok($$update public.search_alerts set expires_at = now() + interval '5 years'$$,
  '42501', null, 'the end date only moves with renew_alert');
update public.search_alerts set paused = true;
select is((select paused from public.search_alerts), true, 'UC-006 A1 the person pauses it');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000031a2","role":"authenticated"}';
select is((select count(*)::int from public.search_alerts), 0, 'P-13 others read none');
update public.search_alerts set paused = false;
delete from public.search_alerts;
select is(public.renew_alert((select v from t where k = 'roster')) ->> 'reason', 'not_found', 'nor pause, delete or renew it');
select throws_ok($$select * from public.alert_deliveries$$, '42501', null, 'alert_deliveries is for the daily run only');
select throws_ok($$select public.pending_alerts()$$, '42501', null, 'pending_alerts too');
reset role;
select is((select paused from public.search_alerts where id = (select v from t where k = 'roster')), true, 'the alert is as its owner left it');

set local role anon;
select throws_ok($$select * from public.search_alerts$$, '42501', null, 'P-13 visitors read no alert');
reset role;

-- ----- UC-006 E1: at most 5 on ------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000031a1","role":"authenticated"}';
insert into public.search_alerts (suburb_id, radius_km, stay_from, stay_to, use_roster)
  select 973501, 15, current_date + 10 + i, current_date + 17 + i, false from generate_series(1, 5) i;
select is((select count(*)::int from public.search_alerts where not paused), 5, 'five alerts on, the paused one apart');
select throws_ok($$insert into public.search_alerts (suburb_id, radius_km, use_roster) values (973501, 25, true)$$,
  'P0001', 'You have 5 alerts on', 'UC-006 E1 a sixth asks to delete one first');
select throws_ok($$update public.search_alerts set paused = false where use_roster$$,
  'P0001', 'You have 5 alerts on', 'resuming one counts too');
select is(public.renew_alert((select v from t where k = 'roster')) ->> 'reason', 'limit', 'and renewing');
delete from public.search_alerts where stay_from = current_date + 15;
select is(public.renew_alert((select v from t where k = 'roster')) ->> 'ok', 'true', 'UC-006 A1 with room, renew turns it back on');
select is((select paused from public.search_alerts where use_roster), false, 'and it is on');
reset role;

-- ----- UC-053: the daily run ----------------------------------------------------------------------------
-- Make one alert expired (AC-006-2) and one whose stay is over; add alerts for 31a3 and 31a4.
update public.search_alerts set expires_at = now() - interval '1 minute' where stay_from = current_date + 11;
update public.search_alerts set stay_from = current_date - 9, stay_to = current_date - 2 where stay_from = current_date + 12;
insert into public.search_alerts (user_id, suburb_id, radius_km, use_roster) values
  ('00000000-0000-0000-0000-0000000031a3', 973501, 15, true),
  ('00000000-0000-0000-0000-0000000031a4', 973501, 15, true);
insert into t select 'dated', id from public.search_alerts where stay_from = current_date + 13;

select is((select jsonb_array_length(public.pending_alerts())), 3,
  'AC-006-2 expired, past or paused alerts and people without a confirmed email or with alert emails off are left out');
select is((select a ->> 'email' from jsonb_array_elements(public.pending_alerts()) a limit 1), 'alerts1@example.com',
  'each row brings the email for the Edge Function');
select is((select (a #>> '{roster,days_on}')::int from jsonb_array_elements(public.pending_alerts()) a where (a ->> 'use_roster')::boolean), 14,
  'and the roster for an alert by roster');
select is((select a #>> '{place,timezone}' from jsonb_array_elements(public.pending_alerts()) a limit 1), 'Australia/Perth',
  'and the place''s time zone, for today there (BR-AVL-005)');

insert into public.listings (id, owner_id, title, suburb_id, place_type, bathroom, weekly_price,
    bills_included, bond, furnished, availability_type, available_from, accuracy_declared_at)
  values ('00000000-0000-0000-0000-0000000031b1', '00000000-0000-0000-0000-0000000031a2', 'Room near the port', 973501,
    'private_room', 'own', 260, true, 520, true, 'from_date', current_date, now());
insert into public.alert_deliveries (alert_id, listing_id) values ((select v from t where k = 'dated'), '00000000-0000-0000-0000-0000000031b1');
select is((select a -> 'delivered' from jsonb_array_elements(public.pending_alerts()) a where (a ->> 'alert_id')::uuid = (select v from t where k = 'dated')),
  '["00000000-0000-0000-0000-0000000031b1"]'::jsonb, 'UC-053 with the homes already sent, never sent twice');
select throws_ok($$insert into public.alert_deliveries (alert_id, listing_id) values ((select v from t where k = 'dated'), '00000000-0000-0000-0000-0000000031b1')$$,
  '23505', null, 'the same home and alert can''t be recorded twice');

insert into public.notification_log (user_id, template, ref_id, status)
  values ('00000000-0000-0000-0000-0000000031a1', 'NTF-007', (select v from t where k = 'dated'), 'sent');
select is((select jsonb_array_length(public.pending_alerts())), 0, 'AC-006-1 one alert email a day per person');

-- ----- Download and delete (AC-035-2, BR-ACC-007) -------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000031a1","role":"authenticated"}';
select is((select jsonb_array_length(public.export_my_data() #> '{data,alerts}')), 5, 'AC-035-2 the download lists the alerts');
reset role;
select public.delete_account('00000000-0000-0000-0000-0000000031a1');
select is((select count(*)::int from public.search_alerts where user_id = '00000000-0000-0000-0000-0000000031a1'), 0,
  'BR-ACC-007 the alerts go with the account');

select * from finish();
rollback;
