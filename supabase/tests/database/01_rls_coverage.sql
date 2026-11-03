-- engineering-constitution.md §5 and hard rule 2: every table in public has RLS on
-- and at least one policy.
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select is(
  array(
    select c.relname::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    order by 1
  ),
  array[]::text[],
  'RLS is on in every public table'
);

select is(
  array(
    select c.relname::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
    order by 1
  ),
  array[]::text[],
  'Every public table has at least one policy'
);

select * from finish();
rollback;
