-- BR-ANL-001 with Facebook sign-in (BR-ACC-002, INT-007): signup_completed carries the provider.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000040a1', 'fb40@example.com', now(), '{"provider":"facebook"}'),
  ('00000000-0000-0000-0000-0000000040a2', 'g40@example.com', now(), '{"provider":"google"}'),
  ('00000000-0000-0000-0000-0000000040a3', 'e40@example.com', null, '{"provider":"email"}');
update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000040a3';

select is((select props from public.analytics_events where name = 'signup_completed' and user_id = '00000000-0000-0000-0000-0000000040a1'),
  '{"method": "facebook"}'::jsonb, 'BR-ANL-001 signup_completed with Facebook records method facebook');
select is((select props from public.analytics_events where name = 'signup_completed' and user_id = '00000000-0000-0000-0000-0000000040a2'),
  '{"method": "google"}'::jsonb, 'BR-ANL-001 signup_completed with Google still records method google');
select is((select props from public.analytics_events where name = 'signup_completed' and user_id = '00000000-0000-0000-0000-0000000040a3'),
  '{"method": "email"}'::jsonb, 'BR-ANL-001 signup_completed after the email code records method email');

select * from finish();
rollback;
