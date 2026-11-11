-- The trigger on auth.users refuses what the page refuses, when Auth is called directly
-- (retroactive review of UC-021): NTF-008 AC-2 only Australian mobiles, AC-021-2 no new code while
-- locked. SEC-09 is in 33_phone_verification.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email, email_confirmed_at, created_at)
  select ('00000000-0000-0000-0000-0000000035a' || i)::uuid, 'guard' || i || '@example.com', now(), now()
  from generate_series(1, 2) i;

select throws_ok($$update auth.users set phone_change = '447700900123', phone_change_sent_at = now() where id = '00000000-0000-0000-0000-0000000035a1'$$,
  '22023', 'notAustralian', 'NTF-008 AC-2 a UK number gets no code, even skipping the page');
select throws_ok($$update auth.users set phone_change = '61891234567', phone_change_sent_at = now() where id = '00000000-0000-0000-0000-0000000035a1'$$,
  '22023', 'notAustralian', 'NTF-008 AC-2 an Australian landline gets no code');
select lives_ok($$update auth.users set phone_change = '61400035001', phone_change_sent_at = now() where id = '00000000-0000-0000-0000-0000000035a1'$$,
  'an Australian mobile still gets its code');

-- Five wrong codes lock the second person (AC-021-2).
insert into public.phone_code_events (user_id, kind)
  select '00000000-0000-0000-0000-0000000035a2', 'wrong' from generate_series(1, 5);
select throws_ok($$update auth.users set phone_change = '61400035002', phone_change_sent_at = now() where id = '00000000-0000-0000-0000-0000000035a2'$$,
  '54000', 'locked', 'AC-021-2 while locked, no new code is stored, even skipping the page');
update public.phone_code_events set created_at = created_at - interval '61 minutes' where user_id = '00000000-0000-0000-0000-0000000035a2';
select lives_ok($$update auth.users set phone_change = '61400035002', phone_change_sent_at = now() where id = '00000000-0000-0000-0000-0000000035a2'$$,
  'an hour later a code goes again');

select * from finish();
rollback;
