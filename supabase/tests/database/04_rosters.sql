-- roles-permissions.md P-05: only the owner reads and writes their roster; admins don't.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@example.com', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'ben@example.com', now());
insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'Ana'),
  ('00000000-0000-0000-0000-0000000000a2', 'Ben');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select lives_ok(
  $$insert into public.rosters (user_id, days_on, days_off, anchor_date)
    values ('00000000-0000-0000-0000-0000000000a1', 14, 7, '2026-11-02')$$,
  'P-05 owner saves their roster'
);
select is((select days_on from public.rosters)::int, 14, 'P-05 owner reads their roster');
select throws_ok(
  $$insert into public.rosters (user_id, days_on, days_off, anchor_date)
    values ('00000000-0000-0000-0000-0000000000a2', 8, 6, '2026-11-02')$$,
  '42501', null, 'P-05 a user cannot write another roster'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select is((select count(*) from public.rosters)::int, 0, 'P-05 a user cannot read another roster');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated","app_metadata":{"role":"admin"}}';
select is((select count(*) from public.rosters)::int, 0, 'P-05 admin cannot read rosters');
reset role;

set local role anon;
select throws_ok($$select user_id from public.rosters$$, '42501', null, 'P-05 anon cannot read rosters');
reset role;

select * from finish();
rollback;
