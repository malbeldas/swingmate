-- roles-permissions.md P-02 and P-04, schema.md §4 (profile_is_ready), AC-030-1.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into public.suburbs (id, name, state, lat, lng, timezone)
values (950001, 'Baldivis', 'WA', -32.33, 115.82, 'Australia/Perth');

-- a1: confirmed email. a2: another confirmed user. a3: email not confirmed yet.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@example.com', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'ben@example.com', now()),
  ('00000000-0000-0000-0000-0000000000a3', 'cat@example.com', null);

-- Anonymous visitors read nothing.
set local role anon;
select throws_ok($$select id from public.profiles$$, '42501', null, 'P-02 anon cannot read profiles');
reset role;

-- a1 creates and edits their own profile.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select lives_ok(
  $$insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at)
    values ('00000000-0000-0000-0000-0000000000a1', 'Ana', 950001, 'uat', now())$$,
  'P-04 owner creates their profile'
);
select throws_ok(
  $$insert into public.profiles (id, display_name) values ('00000000-0000-0000-0000-0000000000a2', 'Fake')$$,
  '42501', null, 'P-04 a user cannot create a profile for someone else'
);
select lives_ok(
  $$update public.profiles set bio = 'Driller, 2/1 swing' where id = '00000000-0000-0000-0000-0000000000a1'$$,
  'P-04 owner edits their profile'
);
select throws_ok(
  $$update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '42501', null, 'P-04 owner cannot change status'
);
select throws_ok(
  $$update public.profiles set listing_limit = 50 where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '42501', null, 'P-04 owner cannot change listing_limit'
);
select throws_ok(
  $$insert into public.profiles (id, display_name, status) values ('00000000-0000-0000-0000-0000000000a1', 'Ana', 'active')$$,
  '42501', null, 'P-04 owner cannot set status on insert'
);
select is(public.profile_is_ready('00000000-0000-0000-0000-0000000000a1'), true,
  'AC-030-1 profile_is_ready is true with name, suburb, terms and confirmed email');
reset role;

-- a2 cannot see or edit a1.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select is((select count(*) from public.profiles where id = '00000000-0000-0000-0000-0000000000a1')::int, 0,
  'P-02 a user cannot read another profile');
update public.profiles set bio = 'hacked' where id = '00000000-0000-0000-0000-0000000000a1';
select is(public.profile_is_ready('00000000-0000-0000-0000-0000000000a1'), false,
  'profile_is_ready does not answer about other accounts');
reset role;
select is((select bio from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'Driller, 2/1 swing',
  'P-04 a user cannot edit another profile');

-- a3 completes the profile but has not confirmed the email yet.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at)
values ('00000000-0000-0000-0000-0000000000a3', 'Cat', 950001, 'uat', now());
select is(public.profile_is_ready('00000000-0000-0000-0000-0000000000a3'), false,
  'AC-030-1 profile_is_ready is false while the email is not confirmed');
reset role;

-- An admin reads any full profile.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","app_metadata":{"role":"admin"}}';
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'Ana',
  'P-02 admin reads any profile');
reset role;

-- A profile with no suburb is not ready, and the name check holds.
update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000000a3';
update public.profiles set base_suburb_id = null where id = '00000000-0000-0000-0000-0000000000a3';
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
select is(public.profile_is_ready('00000000-0000-0000-0000-0000000000a3'), false,
  'profile_is_ready is false without a base suburb');
select throws_ok(
  $$update public.profiles set display_name = '  ' where id = '00000000-0000-0000-0000-0000000000a3'$$,
  '23514', null, 'display_name needs 1 to 40 characters'
);
reset role;

select * from finish();
rollback;
