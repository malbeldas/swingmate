-- AC-021-2 on the server (decision of 11/11 after the retroactive risk review of UC-021). Before,
-- the page told the database about each wrong code (phone_code_wrong), so whoever called Auth's
-- verify directly could try codes without ever being locked. Now:
--   * The phone-verify Edge Function is the only way a code confirms a number. It calls
--     phone_verify_begin, which counts the try *before* Auth checks it, so tries sent at once can't
--     get past the 5 of AC-021-2; then Auth's verify; then phone_verify_end, which keeps the try as
--     wrong or drops it.
--   * phone_verify_begin also stores the hash Auth keeps for that code (sha224 of the number and the
--     code, as Auth writes phone_change_token). When Auth confirms a number, phone_verify_guard lets
--     it through only if a try with that same hash started in the last minute. Otherwise (Auth was
--     called directly) the number stays unconfirmed, the code is spent and the try counts as wrong.
-- If Auth ever changes how it hashes codes, every confirmation stays unconfirmed: it fails closed,
-- and the E2E suite (real Auth with test numbers) shows it.

-- 'trying': a code the function is checking right now. It counts toward the lock like a wrong one.
alter table public.phone_code_events drop constraint phone_code_events_kind_check;
alter table public.phone_code_events add constraint phone_code_events_kind_check
  check (kind in ('sent', 'wrong', 'trying'));
alter table public.phone_code_events add column token_hash text;

create index phone_code_events_try_idx on public.phone_code_events (user_id, created_at) where kind in ('wrong', 'trying');

-- The lock of AC-021-2 now counts tries in progress too, so five tries sent at the same moment are
-- the five of the hour. Same answer as before: { locked, until }.
create or replace function public.phone_lock(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  last_wrong timestamptz;
  recent int;
begin
  select max(created_at) into last_wrong
    from public.phone_code_events where user_id = p_user_id and kind in ('wrong', 'trying');
  if last_wrong is null or last_wrong <= now() - interval '1 hour' then
    return jsonb_build_object('locked', false);
  end if;
  select count(*) into recent from public.phone_code_events
    where user_id = p_user_id and kind in ('wrong', 'trying')
      and created_at > last_wrong - interval '1 hour' and created_at <= last_wrong;
  if recent >= 5 then
    return jsonb_build_object('locked', true, 'until', last_wrong + interval '1 hour');
  end if;
  return jsonb_build_object('locked', false);
end;
$$;

revoke all on function public.phone_lock(uuid) from public, anon, authenticated;

-- Before Auth checks a code (phone-verify only). p_phone in E.164, p_code the 6 digits.
-- Answers { ok: true, try_id } or { ok: false, reason } with reason locked (with until) or wrongCode.
-- A number that isn't the one this person was sent a code for counts as a wrong code: the page
-- always sends the number it asked the code for.
create or replace function public.phone_verify_begin(p_user_id uuid, p_phone text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  lock jsonb;
  try_id bigint;
begin
  -- One try at a time per person, so two at once can't both see 4 and both go.
  perform pg_advisory_xact_lock(hashtext('phone_verify:' || p_user_id::text));
  delete from public.phone_code_events where created_at < now() - interval '2 days';

  lock := public.phone_lock(p_user_id);
  if (lock ->> 'locked')::boolean then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'until', lock -> 'until');
  end if;

  if digits = '' or coalesce(p_code, '') !~ '^[0-9]{6}$' or not exists (
      select 1 from auth.users where id = p_user_id and phone_change = digits) then
    insert into public.phone_code_events (user_id, kind) values (p_user_id, 'wrong');
    lock := public.phone_lock(p_user_id);
    if (lock ->> 'locked')::boolean then
      return jsonb_build_object('ok', false, 'reason', 'locked', 'until', lock -> 'until');
    end if;
    return jsonb_build_object('ok', false, 'reason', 'wrongCode');
  end if;

  insert into public.phone_code_events (user_id, kind, token_hash)
    values (p_user_id, 'trying', encode(extensions.digest(digits || p_code, 'sha224'), 'hex'))
    returning id into try_id;
  return jsonb_build_object('ok', true, 'try_id', try_id);
end;
$$;

-- After Auth answered (phone-verify only). p_wrong: the try stays as a wrong code, because Auth said
-- the code is wrong or expired, or didn't give a clear answer (a rate limit or an outage could
-- otherwise be used to try codes for free). False only when Auth confirmed the number. Answers
-- { ok: true } or { ok: false, reason: 'locked', until }.
create or replace function public.phone_verify_end(p_user_id uuid, p_try_id bigint, p_wrong boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lock jsonb;
begin
  if p_wrong then
    update public.phone_code_events set kind = 'wrong', token_hash = null
      where id = p_try_id and user_id = p_user_id and kind = 'trying';
  else
    delete from public.phone_code_events where id = p_try_id and user_id = p_user_id and kind = 'trying';
  end if;
  lock := public.phone_lock(p_user_id);
  if (lock ->> 'locked')::boolean then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'until', lock -> 'until');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- After Auth said yes (phone-verify only): whether the number really is this person's verified one
-- now. False when phone_verify_guard kept it unconfirmed, so the page never shows "Verified" for a
-- number the database didn't take.
create or replace function public.phone_verified(p_user_id uuid, p_phone text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from auth.users where id = p_user_id and phone_confirmed_at is not null
    and phone = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'));
$$;

revoke all on function public.phone_verify_begin(uuid, text, text) from public, anon, authenticated;
revoke all on function public.phone_verified(uuid, text) from public, anon, authenticated;
revoke all on function public.phone_verify_end(uuid, bigint, boolean) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.phone_verify_begin(uuid, text, text) to service_role;
    grant execute on function public.phone_verify_end(uuid, bigint, boolean) to service_role;
    grant execute on function public.phone_verified(uuid, text) to service_role;
  end if;
end
$$;

-- When Auth confirms a new number (verify with type phone_change), it moves phone_change to phone,
-- clears phone_change and the code, and sets phone_confirmed_at in one update. That update keeps
-- the number only if phone-verify started a try with this very code in the last minute; the
-- matching try is then removed, as a right code doesn't count. Otherwise the person keeps their
-- previous number (or none), the code is spent anyway and the try counts as wrong (AC-021-2).
create or replace function public.phone_verify_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(old.phone_change, '') <> '' and coalesce(new.phone_change, '') = ''
     and new.phone is not distinct from old.phone_change
     and new.phone_confirmed_at is distinct from old.phone_confirmed_at then
    delete from public.phone_code_events
      where user_id = new.id and kind = 'trying' and created_at > now() - interval '1 minute'
        and token_hash is not null and token_hash = old.phone_change_token;
    if not found then
      new.phone := old.phone;
      new.phone_confirmed_at := old.phone_confirmed_at;
      insert into public.phone_code_events (user_id, kind) values (new.id, 'wrong');
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.phone_verify_guard() from public, anon, authenticated;

create trigger phone_verify_guard
  before update of phone_confirmed_at on auth.users
  for each row execute function public.phone_verify_guard();

-- phone_code_wrong stays for now: the page no longer calls it, and it can only lock the person who
-- calls it.
