-- AC-021-2 on the server (11/11): phone_verify_begin, phone_verify_end and the phone_verify_guard
-- trigger. Auth is simulated the way it writes auth.users: a code sets phone_change,
-- phone_change_token (sha224 of number and code) and phone_change_sent_at; confirming moves
-- phone_change to phone and sets phone_confirmed_at in one update.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users (id, email, email_confirmed_at, created_at)
  select ('00000000-0000-0000-0000-0000000037a' || i)::uuid, 'verify' || i || '@example.com', now(), now()
  from generate_series(1, 4) i;

-- Auth sends person p a code for number n.
create function pg_temp.code_sent(p uuid, n text, c text) returns void language sql as $$
  update auth.users set phone_change = n, phone_change_sent_at = now(),
    phone_change_token = encode(extensions.digest(n || c, 'sha224'), 'hex') where id = p;
$$;
-- Auth confirms the number, as verify with type phone_change does.
create function pg_temp.auth_confirms(p uuid) returns void language sql as $$
  update auth.users set phone = phone_change, phone_change = '', phone_change_token = '', phone_confirmed_at = now() where id = p;
$$;
create function pg_temp.wrongs(p uuid) returns int language sql as $$
  select count(*)::int from public.phone_code_events where user_id = p and kind = 'wrong';
$$;

-- ----- Only the function calls them ---------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.phone_verify_begin(uuid, text, text)', 'execute'),
  'P-31 a member can''t start a try');
select ok(not has_function_privilege('authenticated', 'public.phone_verify_end(uuid, bigint, boolean)', 'execute'),
  'P-31 a member can''t end a try');

-- ----- Auth called directly: the number is not confirmed ------------------------------------------
select pg_temp.code_sent('00000000-0000-0000-0000-0000000037a1', '61400037001', '482913');
select pg_temp.auth_confirms('00000000-0000-0000-0000-0000000037a1');
select is((select phone from auth.users where id = '00000000-0000-0000-0000-0000000037a1'), null,
  'AC-021-2 a right code sent straight to Auth doesn''t confirm the number');
select is((select phone_confirmed_at from auth.users where id = '00000000-0000-0000-0000-0000000037a1'), null,
  'and the account has no verified phone');
select is((select phone_change from auth.users where id = '00000000-0000-0000-0000-0000000037a1'), '',
  'the code is spent, so it can''t be tried again through the page');
select is(pg_temp.wrongs('00000000-0000-0000-0000-0000000037a1'), 1, 'and it counts as a wrong code');

-- ----- Through the function ---------------------------------------------------------------------
select pg_temp.code_sent('00000000-0000-0000-0000-0000000037a1', '61400037001', '551177');
create temp table t (k text primary key, v jsonb);
insert into t values ('wrong', public.phone_verify_begin('00000000-0000-0000-0000-0000000037a1', '+61400037001', '000000'));
select is((select v ->> 'ok' from t where k = 'wrong'), 'true', 'a try starts');
select is(public.phone_verify_end('00000000-0000-0000-0000-0000000037a1', (select (v ->> 'try_id')::bigint from t where k = 'wrong'), true),
  '{"ok": true}'::jsonb, 'Auth said wrong: the try ends');
select is(pg_temp.wrongs('00000000-0000-0000-0000-0000000037a1'), 2, 'AC-021-2 and counts as a wrong code');

-- A try with another code doesn't let Auth confirm this one.
insert into t values ('other', public.phone_verify_begin('00000000-0000-0000-0000-0000000037a1', '+61400037001', '123123'));
select pg_temp.auth_confirms('00000000-0000-0000-0000-0000000037a1');
select is((select phone_confirmed_at from auth.users where id = '00000000-0000-0000-0000-0000000037a1'), null,
  'a try started with one code doesn''t let a direct call confirm another');

select pg_temp.code_sent('00000000-0000-0000-0000-0000000037a1', '61400037001', '909090');
insert into t values ('right', public.phone_verify_begin('00000000-0000-0000-0000-0000000037a1', '+61400037001', '909090'));
select pg_temp.auth_confirms('00000000-0000-0000-0000-0000000037a1');
select is((select phone from auth.users where id = '00000000-0000-0000-0000-0000000037a1'), '61400037001',
  'UC-021 the right code through the function confirms the number');
select ok((select phone_confirmed_at from auth.users where id = '00000000-0000-0000-0000-0000000037a1') is not null,
  'and the phone is verified');
select is(public.phone_verify_end('00000000-0000-0000-0000-0000000037a1', (select (v ->> 'try_id')::bigint from t where k = 'right'), false),
  '{"ok": true}'::jsonb, 'the try ends');
select is((select count(*)::int from public.phone_code_events where user_id = '00000000-0000-0000-0000-0000000037a1' and kind = 'trying' and token_hash = encode(extensions.digest('61400037001909090', 'sha224'), 'hex')), 0,
  'a right code doesn''t count');

-- An old try (over a minute) lets nothing through.
select pg_temp.code_sent('00000000-0000-0000-0000-0000000037a2', '61400037002', '313131');
insert into t values ('old', public.phone_verify_begin('00000000-0000-0000-0000-0000000037a2', '+61400037002', '313131'));
update public.phone_code_events set created_at = now() - interval '2 minutes' where user_id = '00000000-0000-0000-0000-0000000037a2';
select pg_temp.auth_confirms('00000000-0000-0000-0000-0000000037a2');
select is((select phone_confirmed_at from auth.users where id = '00000000-0000-0000-0000-0000000037a2'), null,
  'a try from over a minute ago doesn''t confirm a later call');

-- A number that isn't the one the code went to.
select pg_temp.code_sent('00000000-0000-0000-0000-0000000037a3', '61400037003', '424242');
select is(public.phone_verify_begin('00000000-0000-0000-0000-0000000037a3', '+61400037099', '424242'),
  '{"ok": false, "reason": "wrongCode"}'::jsonb, 'another number is a wrong code and Auth is not asked');
select is(pg_temp.wrongs('00000000-0000-0000-0000-0000000037a3'), 1, 'and it counts');

-- ----- AC-021-2: tries sent at once still stop at five --------------------------------------------
select pg_temp.code_sent('00000000-0000-0000-0000-0000000037a4', '61400037004', '777777');
select is((select count(*)::int from generate_series(1, 5) i
    where public.phone_verify_begin('00000000-0000-0000-0000-0000000037a4', '+61400037004', lpad(i::text, 6, '0')) ->> 'ok' = 'true'), 5,
  'five tries can be in progress at once');
select is(public.phone_verify_begin('00000000-0000-0000-0000-0000000037a4', '+61400037004', '777777') ->> 'reason', 'locked',
  'AC-021-2 the sixth is refused before Auth sees it, even the right code');
select ok((public.phone_verify_begin('00000000-0000-0000-0000-0000000037a4', '+61400037004', '777777') ->> 'until')::timestamptz
    between now() + interval '59 minutes' and now() + interval '61 minutes', 'for an hour');
update public.phone_code_events set created_at = created_at - interval '61 minutes' where user_id = '00000000-0000-0000-0000-0000000037a4';
select is(public.phone_verify_begin('00000000-0000-0000-0000-0000000037a4', '+61400037004', '777777') ->> 'ok', 'true',
  'an hour later it opens again');

select * from finish();
rollback;
