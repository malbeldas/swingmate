-- INT-006: the ABS suburbs (SAL 2021) loaded by migration 20261126090000_suburbs.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select ok((select count(*) from public.suburbs where id between 10000 and 89999) > 15000, 'INT-006 every Australian suburb and locality is there');
select is((select name || ', ' || state from public.suburbs where id = 50054), 'Baldivis, WA', 'INT-006 AC-1 Baldivis shows as "Baldivis, WA"');
select is((select name || ', ' || state from public.suburbs where id = 31724), 'Mackay, QLD', 'INT-006 AC-1 Mackay shows as "Mackay, QLD"');
select is((select count(*)::int from public.suburbs where id between 10000 and 89999 and coalesce(timezone, '') = ''), 0,
  'INT-006 AC-2 every suburb has a time zone');
select is((select timezone from public.suburbs where id = 10589), 'Australia/Broken_Hill', 'INT-006 AC-2 Broken Hill keeps South Australian time');
select is((select count(*)::int from (select lower(name), state from public.suburbs where id between 10000 and 89999
  group by 1, 2 having count(*) > 1) d), 0, 'INT-006 no two suburbs share a name in one state, so "Name, ST" finds one');
select ok((select is_city from public.suburbs where id = 51230) and not (select is_city from public.suburbs where id = 50054),
  'BR-SRC-003 Perth is a city, Baldivis is not');

select * from finish();
rollback;
