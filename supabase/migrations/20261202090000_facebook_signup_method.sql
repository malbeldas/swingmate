-- Facebook sign-in for UAT (BR-ACC-002, INT-007): signup_completed records method facebook too
-- (BR-ANL-001, observability.md §2). Same function as 20261116090000_analytics.sql otherwise.
create or replace function public.analytics_on_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null and (tg_op = 'INSERT' or old.email_confirmed_at is null) then
    perform public.log_event('signup_completed', new.id, jsonb_build_object(
      'method', case when new.raw_app_meta_data ->> 'provider' in ('google', 'facebook')
                     then new.raw_app_meta_data ->> 'provider' else 'email' end));
  end if;
  if new.phone_confirmed_at is not null and (tg_op = 'INSERT' or old.phone_confirmed_at is null) then
    perform public.log_event('phone_verified', new.id, jsonb_build_object(
      'as_host', coalesce((select p.is_hosting from public.profiles p where p.id = new.id), false)));
  end if;
  return null;
exception when others then
  return null;
end;
$$;
