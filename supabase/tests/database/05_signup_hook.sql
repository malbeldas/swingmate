-- BR-TRU-007, AC-030-4: the sign-up hook rejects disposable email domains.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select is(
  public.hook_before_user_created('{"user":{"email":"someone@mailinator.com","app_metadata":{"provider":"email"}}}'),
  '{"error":{"http_code":400,"message":"Please use a permanent email address."}}'::jsonb,
  'AC-030-4 a disposable domain is rejected'
);
select is(
  public.hook_before_user_created('{"user":{"email":"Someone@Mail.YOPMAIL.com","app_metadata":{"provider":"email"}}}'),
  '{"error":{"http_code":400,"message":"Please use a permanent email address."}}'::jsonb,
  'AC-030-4 subdomains and upper case are rejected too'
);
select is(
  public.hook_before_user_created('{"user":{"email":"ana@gmail.com","app_metadata":{"provider":"email"}}}'),
  '{}'::jsonb,
  'AC-030-4 a normal email is allowed'
);
select is(
  public.hook_before_user_created('{"user":{"email":"ana@notmailinator.com","app_metadata":{"provider":"email"}}}'),
  '{}'::jsonb,
  'AC-030-4 a domain that only ends with the same letters is allowed'
);

set local role authenticated;
select throws_ok(
  $$select public.hook_before_user_created('{}'::jsonb)$$,
  '42501', null, 'users cannot call the sign-up hook'
);
reset role;

select * from finish();
rollback;
