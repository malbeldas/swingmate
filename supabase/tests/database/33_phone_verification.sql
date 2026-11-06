-- Mobile verification (#12): the limits Supabase Auth doesn't have. SEC-09 (5 codes per number in
-- 24 hours, whatever the account; INT-003 AC-2), AC-021-2 (5 wrong codes lock an hour), NTF-008 AC-2
-- (only Australian mobiles) and P-31 (nobody reads the table). AC-021-1 is Auth's own unique phone.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- 34a1, 34a2: two accounts that try the same number · 34a3: someone else
insert into auth.users (id, email, email_confirmed_at, created_at)
  select ('00000000-0000-0000-0000-0000000034a' || i)::uuid, 'phone' || i || '@example.com', now(), now()
  from generate_series(1, 3) i;

-- ----- SEC-09: each code Auth stores is counted by number ----------------------------------------
-- Auth stores the number without "+" and sets phone_change_sent_at for every code it sends.
update auth.users set phone_change = '61400010901', phone_change_sent_at = now() - interval '25 hours'
  where id = '00000000-0000-0000-0000-0000000034a1';
update public.phone_code_events set created_at = now() - interval '25 hours';
select is((select count(*)::int from public.phone_code_events where kind = 'sent'), 1, 'a code sent is counted');
select is((select phone_hash from public.phone_code_events limit 1), public.phone_hash('+61400010901'),
  'by the hash of the number, the same with or without "+"');
select is((select count(*)::int from public.phone_code_events where phone_hash like '%61400010901%'), 0,
  'BR-TRU-003 the number itself is not kept');

-- Four more in the last 24 hours, from two accounts: the one from yesterday doesn't count.
update auth.users set phone_change_sent_at = now() - interval '3 hours' where id = '00000000-0000-0000-0000-0000000034a1';
update auth.users set phone_change_sent_at = now() - interval '2 hours' where id = '00000000-0000-0000-0000-0000000034a1';
update auth.users set phone_change = '61400010901', phone_change_sent_at = now() - interval '1 hour' where id = '00000000-0000-0000-0000-0000000034a2';
update auth.users set phone_change_sent_at = now() - interval '30 minutes' where id = '00000000-0000-0000-0000-0000000034a2';

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000034a3","role":"authenticated"}';
select is(public.phone_code_check('+61400010901'), '{"ok": true}'::jsonb, 'four codes in 24 hours: a fifth is allowed');
reset role;
update auth.users set phone_change = '61400010901', phone_change_sent_at = now() where id = '00000000-0000-0000-0000-0000000034a3';
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000034a1","role":"authenticated"}';
select is(public.phone_code_check('+61400010901'), '{"ok": false, "reason": "daily"}'::jsonb,
  'SEC-09 after 5 codes in 24 hours the number is refused');
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000034a2","role":"authenticated"}';
select is(public.phone_code_check('+61400010901'), '{"ok": false, "reason": "daily"}'::jsonb,
  'INT-003 AC-2 for every account, not only the one that asked');
select is(public.phone_code_check('+61400010902'), '{"ok": true}'::jsonb, 'another number is not affected');
reset role;

-- The 6th code Auth tries to store for that number is refused in the database itself.
select throws_ok($$update auth.users set phone_change_sent_at = now() + interval '1 minute' where id = '00000000-0000-0000-0000-0000000034a2'$$,
  '54000', 'daily', 'SEC-09 the 6th code is refused even when the page is skipped');
select is((select count(*)::int from public.phone_code_events where kind = 'sent' and created_at > now() - interval '24 hours'), 5,
  'and is not counted');
select lives_ok($$update auth.users set phone_change = '61400010902', phone_change_sent_at = now() + interval '2 minutes' where id = '00000000-0000-0000-0000-0000000034a2'$$,
  'a code for another number still goes');
select lives_ok($$update auth.users set phone = '61400010902', phone_confirmed_at = now(), phone_change = '' where id = '00000000-0000-0000-0000-0000000034a2'$$,
  'and confirming the number is not a new code');

-- ----- NTF-008 AC-2: only Australian mobiles --------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000034a3","role":"authenticated"}';
select is(public.phone_code_check('+6489123456'), '{"ok": false, "reason": "notAustralian"}'::jsonb, 'a New Zealand number is refused');
select is(public.phone_code_check('+61891234567'), '{"ok": false, "reason": "notAustralian"}'::jsonb, 'an Australian landline is refused');

-- ----- AC-021-2: 5 wrong codes lock an hour ---------------------------------------------------------
select is(public.phone_code_wrong(), '{"ok": true}'::jsonb, 'a wrong code is counted');
select is((select count(*)::int from (select public.phone_code_wrong() from generate_series(1, 3)) w), 3, 'three more');
select is(public.phone_code_check(null), '{"ok": true}'::jsonb, 'four wrong codes: still open');
select is(public.phone_code_wrong() ->> 'reason', 'locked', 'AC-021-2 the fifth wrong code locks verification');
select is(public.phone_code_check('+61400010903') ->> 'reason', 'locked', 'no code can be sent while locked');
select ok((public.phone_code_check(null) ->> 'until')::timestamptz between now() + interval '59 minutes' and now() + interval '61 minutes',
  'for an hour');
select is(public.phone_code_check(null) || '{}', public.phone_code_wrong() || '{}', 'more wrong codes while locked don''t make it longer');
reset role;
update public.phone_code_events set created_at = created_at - interval '61 minutes' where kind = 'wrong';
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000034a3","role":"authenticated"}';
select is(public.phone_code_check(null), '{"ok": true}'::jsonb, 'an hour later it opens again');

-- ----- P-31: nobody reads the table ---------------------------------------------------------------
select throws_ok($$select count(*) from public.phone_code_events$$, '42501', null, 'P-31 a member can''t read the codes table');
reset role;

select * from finish();
rollback;
