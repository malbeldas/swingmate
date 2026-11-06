-- Download my data and Delete my account (#34): export_my_data, account_storage_paths, delete_account.
-- UC-035, AC-035-1, AC-035-2, BR-ACC-007, BR-PRV-004, roles-permissions.md §4.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into public.suburbs (id, name, state, lat, lng, timezone) values
  (973401, 'Newman', 'WA', -23.3590, 119.7310, 'Australia/Perth');
-- 34a1 host · 34a2 seeker
insert into auth.users (id, email, email_confirmed_at, phone, phone_confirmed_at, created_at, last_sign_in_at) values
  ('00000000-0000-0000-0000-0000000034a1', 'host34@example.com', now(), '61400000034', now(), now() - interval '60 days', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-0000000034a2', 'seeker34@example.com', now(), null, null, now() - interval '30 days', now() - interval '1 hour');
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at, photo_path) values
  ('00000000-0000-0000-0000-0000000034a1', 'Ari', 973401, 'test', now(), '00000000-0000-0000-0000-0000000034a1/00000000-0000-0000-0000-0000000034f1.jpg'),
  ('00000000-0000-0000-0000-0000000034a2', 'Bo', 973401, 'test', now(), null);
insert into public.rosters (user_id, days_on, days_off, anchor_date)
  values ('00000000-0000-0000-0000-0000000034a2', 14, 7, current_date + 2);

insert into public.listings (id, owner_id, title, suburb_id, place_type, bathroom, weekly_price,
    bills_included, bond, furnished, availability_type, available_from, accuracy_declared_at)
  values ('00000000-0000-0000-0000-0000000034b1', '00000000-0000-0000-0000-0000000034a1', 'Room near the mine bus', 973401,
    'private_room', 'own', 280, true, 560, true, 'from_date', current_date - 5, now());
insert into public.listing_private (listing_id, address_line, lat, lng)
  values ('00000000-0000-0000-0000-0000000034b1', '8 Pit Rd', -23.3591, 119.7311);
insert into public.listing_photos (listing_id, storage_path, position, width, height)
  select '00000000-0000-0000-0000-0000000034b1', '00000000-0000-0000-0000-0000000034b1/' || i || '.jpg', i, 1600, 1200
  from generate_series(0, 2) i;
update public.listings set status = 'active' where id = '00000000-0000-0000-0000-0000000034b1';
insert into public.saved_listings (user_id, listing_id)
  values ('00000000-0000-0000-0000-0000000034a2', '00000000-0000-0000-0000-0000000034b1');

create temp table t (k text primary key, v jsonb);
grant all on t to authenticated;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000034a2","role":"authenticated"}';
insert into t values ('conv', public.start_conversation('00000000-0000-0000-0000-0000000034b1', 'Hi Ari, I am on a 14:7 out of Newman.',
  current_date + 16, current_date + 23));
reset role;
-- The host's answer, as the app writes it.
insert into public.messages (conversation_id, sender_id, kind, body)
  values (((select v ->> 'conversation_id' from t where k = 'conv'))::uuid, '00000000-0000-0000-0000-0000000034a1', 'text', 'Sure Bo, the room is free then.');

-- ----- Download my data ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000034a2","role":"authenticated"}';
select is(public.export_my_data(), '{"ok": false, "reason": "reauth"}'::jsonb,
  'roles-permissions §4 the download asks to sign in again after 5 minutes');
reset role;
update auth.users set last_sign_in_at = now() where id = '00000000-0000-0000-0000-0000000034a2';
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000034a2","role":"authenticated"}';
insert into t values ('export', public.export_my_data());
select is((select v ->> 'ok' from t where k = 'export'), 'true', 'BR-PRV-004 after signing in again it comes');
select is((select v #>> '{data,profile,display_name}' from t where k = 'export'), 'Bo', 'AC-035-2 with the profile');
select is((select v #>> '{data,account,email}' from t where k = 'export'), 'seeker34@example.com', 'and their own email');
select is((select v #>> '{data,roster,days_on}' from t where k = 'export'), '14', 'AC-035-2 the roster');
select is((select jsonb_array_length(v #> '{data,saved_homes}') from t where k = 'export'), 1, 'AC-035-2 the saved homes');
select is((select v #> '{data,alerts}' from t where k = 'export'), '[]'::jsonb, 'AC-035-2 the alerts');
select is((select v #>> '{data,messages_sent,0,body}' from t where k = 'export'), 'Hi Ari, I am on a 14:7 out of Newman.', 'AC-035-2 the messages they sent');
select ok((select (v -> 'data')::text !~ 'the room is free then' from t where k = 'export'), 'AC-035-2 never what someone else wrote');
select ok((select (v -> 'data')::text !~ 'Pit Rd' from t where k = 'export'), 'BR-TRU-003 nor the address of someone else''s home');
select throws_ok($$select public.delete_account('00000000-0000-0000-0000-0000000034a2')$$, '42501', null,
  'only the Edge Function deletes an account');
reset role;

-- ----- Delete my account: the host -------------------------------------------------------------------
select is(public.account_storage_paths('00000000-0000-0000-0000-0000000034a1'),
  '{"avatars": ["00000000-0000-0000-0000-0000000034a1/00000000-0000-0000-0000-0000000034f1.jpg"], "listing_photos": ["00000000-0000-0000-0000-0000000034b1/0.jpg", "00000000-0000-0000-0000-0000000034b1/1.jpg", "00000000-0000-0000-0000-0000000034b1/2.jpg"]}'::jsonb,
  'BR-ACC-007 the files to remove from Storage');
select is(public.delete_account('00000000-0000-0000-0000-0000000034a1') ->> 'ok', 'true', 'BR-ACC-007 the host deletes their account');
select is((select status from public.listings where id = '00000000-0000-0000-0000-0000000034b1'), 'removed', 'BR-ACC-007 their listing is removed');
select is((select count(*)::int from public.search_listings(-23.3590, 119.7310, 15, null) where id = '00000000-0000-0000-0000-0000000034b1'), 0,
  'AC-035-1 and no longer appears in the search');
select is((select count(*)::int from public.listing_private where listing_id = '00000000-0000-0000-0000-0000000034b1')
  + (select count(*)::int from public.listing_photos where listing_id = '00000000-0000-0000-0000-0000000034b1'), 0,
  'BR-ACC-007 without its address or photos');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000034a1'), 0, 'BR-ACC-007 the profile is gone');
select results_eq(
  $$select sender_id is null, body from public.messages where conversation_id = (select (v ->> 'conversation_id')::uuid from t where k = 'conv') order by created_at$$,
  $$values (false, 'Hi Ari, I am on a 14:7 out of Newman.'), (true, 'Sure Bo, the room is free then.')$$,
  'AC-035-1 the seeker keeps the conversation, the host''s messages now by "Deleted user"');

-- ----- Delete my account: the seeker ----------------------------------------------------------------
select is(public.delete_account('00000000-0000-0000-0000-0000000034a2') ->> 'ok', 'true', 'BR-ACC-007 the seeker deletes theirs');
select is((select count(*)::int from public.saved_listings) + (select count(*)::int from public.rosters where user_id = '00000000-0000-0000-0000-0000000034a2'), 0,
  'BR-ACC-007 the roster and the saved homes go with the account');

select * from finish();
rollback;
