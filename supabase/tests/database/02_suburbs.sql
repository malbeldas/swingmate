-- roles-permissions.md P-01: everyone reads suburbs; nobody writes them from the web.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into public.suburbs (id, name, state, postcode, lat, lng, timezone, is_city)
values (50001, 'Baldivis', 'WA', '6171', -32.33, 115.82, 'Australia/Perth', false);

set local role anon;
select is((select name from public.suburbs where id = 50001), 'Baldivis', 'P-01 anon reads suburbs');
select throws_ok(
  $$insert into public.suburbs (id, name, state, lat, lng, timezone) values (2, 'X', 'WA', 0, 0, 'Australia/Perth')$$,
  '42501', null, 'P-01 anon cannot insert suburbs'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is((select name from public.suburbs where id = 50001), 'Baldivis', 'P-01 user reads suburbs');
select throws_ok(
  $$update public.suburbs set name = 'Y' where id = 50001$$,
  '42501', null, 'P-01 user cannot edit suburbs'
);
reset role;

select * from finish();
rollback;
