-- notification_log and the NTF-009 request (notifications.md rules 6 and 7, P-28, UC-034 step 4).
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into public.suburbs (id, name, state, lat, lng, timezone) values
  (976001, 'Bellerive', 'TAS', -42.8740, 147.3700, 'Australia/Hobart');
insert into auth.users (id, email, email_confirmed_at, created_at, raw_app_meta_data) values
  ('00000000-0000-0000-0000-000000000071', 'membern@example.com', now(), now() - interval '30 days', '{}'),
  ('00000000-0000-0000-0000-000000000072', 'adminn@example.com', now(), now() - interval '30 days', '{"role":"admin"}');
insert into public.profiles (id, display_name, base_suburb_id, terms_version, terms_accepted_at) values
  ('00000000-0000-0000-0000-000000000071', 'Fin', 976001, 'test', now()),
  ('00000000-0000-0000-0000-000000000072', 'Gus', 976001, 'test', now());

insert into public.notification_log (user_id, template, ref_id, status, provider_message_id)
  values ('00000000-0000-0000-0000-000000000072', 'NTF-009', '00000000-0000-0000-0000-0000000000aa', 'sent', 'msg_1');

-- Rule 7: the same email to the same person about the same thing is recorded once as sent.
select throws_ok($$ insert into public.notification_log (user_id, template, ref_id, status)
    values ('00000000-0000-0000-0000-000000000072', 'NTF-009', '00000000-0000-0000-0000-0000000000aa', 'sent') $$,
  '23505', null, 'notifications.md rule 7 the same email is never recorded as sent twice');
select lives_ok($$ insert into public.notification_log (user_id, template, ref_id, status, error)
    values ('00000000-0000-0000-0000-000000000072', 'NTF-009', '00000000-0000-0000-0000-0000000000aa', 'failed', 'provider_503') $$,
  'notifications.md rule 6 failed attempts are kept');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000071","role":"authenticated"}';
select is((select count(*)::int from public.notification_log), 0, 'P-28 a member reads nothing');
select throws_ok($$ insert into public.notification_log (template, status) values ('NTF-009', 'sent') $$,
  '42501', null, 'P-28 the web cannot write the log');
select throws_ok($$ select public.request_email('NTF-009', gen_random_uuid()) $$,
  '42501', null, 'only the database asks send-email for an email');
-- Without the Vault secrets (local and CI) the report is saved and nothing is called.
select lives_ok($$ insert into public.reports (target_type, target_id, reason) values ('user', '00000000-0000-0000-0000-000000000072', 'spam') $$,
  'AC-034-2 a report is saved even where send-email is not set up');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000072","role":"authenticated","app_metadata":{"role":"admin"}}';
select is((select count(*)::int from public.notification_log), 2, 'P-28 an admin reads the log');
reset role;

select * from finish();
rollback;
