-- Mobile verification (issue #12, UC-021, SEC-04, SEC-09, T-07). Supabase Auth sends the code
-- (updateUser({ phone })) and checks it (verifyOtp({ type: 'phone_change' })); auth.users keeps the
-- number and phone_confirmed_at, and refuses a number that another account already has (AC-021-1).
-- This adds the limits Auth doesn't have:
--   * SEC-09: at most 5 codes per number in 24 hours, whatever the account (INT-003 AC-2). A trigger
--     on auth.users counts each code Auth stores and refuses the 6th, so it holds even when the page
--     is skipped. phone_code_check says it before the page asks.
--   * AC-021-2: 5 wrong codes lock verification for an hour. Auth doesn't tell the database about a
--     wrong code, so the page reports it with phone_code_wrong.
-- The number itself never lands here: only its SHA-256, kept 2 days (BR-TRU-003).

create table public.phone_code_events (
  id bigint generated always as identity primary key,
  phone_hash text,
  -- Set null when the account goes, so deleting it doesn't reset the number's daily count.
  user_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('sent', 'wrong')),
  created_at timestamptz not null default now()
);

create index phone_code_events_hash_idx on public.phone_code_events (phone_hash, created_at) where kind = 'sent';
create index phone_code_events_user_idx on public.phone_code_events (user_id, created_at) where kind = 'wrong';

alter table public.phone_code_events enable row level security;

-- Nobody reads or writes the table directly; only the functions below touch it.
create policy "P-31 phone_code_events nobody" on public.phone_code_events
  for all to anon, authenticated using (false) with check (false);

revoke all on public.phone_code_events from anon, authenticated;

-- Auth stores numbers without the "+", the page sends them with it: both hash the same.
create or replace function public.phone_hash(p_phone text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(extensions.digest(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 'sha256'), 'hex');
$$;

revoke all on function public.phone_hash(text) from public, anon, authenticated;

-- The lock of AC-021-2 for one person: { locked, until }. Five wrong codes within an hour lock
-- verification until an hour after the fifth. Refused tries are not counted, so the lock doesn't grow.
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
    from public.phone_code_events where user_id = p_user_id and kind = 'wrong';
  if last_wrong is null or last_wrong <= now() - interval '1 hour' then
    return jsonb_build_object('locked', false);
  end if;
  select count(*) into recent from public.phone_code_events
    where user_id = p_user_id and kind = 'wrong'
      and created_at > last_wrong - interval '1 hour' and created_at <= last_wrong;
  if recent >= 5 then
    return jsonb_build_object('locked', true, 'until', last_wrong + interval '1 hour');
  end if;
  return jsonb_build_object('locked', false);
end;
$$;

revoke all on function public.phone_lock(uuid) from public, anon, authenticated;

-- Before "Send code" and "Verify" (UC-021). p_phone in E.164, or null to check only the lock.
-- Answers { ok: true } or { ok: false, reason } with reason notAustralian, locked (with until) or
-- daily; the reasons are keys of PHONE_TEXTS in core/phone.js.
create or replace function public.phone_code_check(p_phone text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  lock jsonb;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  delete from public.phone_code_events where created_at < now() - interval '2 days';

  lock := public.phone_lock(uid);
  if (lock ->> 'locked')::boolean then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'until', lock -> 'until');
  end if;
  if p_phone is null then return jsonb_build_object('ok', true); end if;
  -- NTF-008 AC-2: only Australian mobiles, the same rule as auMobile in core/phone.js.
  if p_phone !~ '^\+614[0-9]{8}$' then
    return jsonb_build_object('ok', false, 'reason', 'notAustralian');
  end if;
  if (select count(*) from public.phone_code_events
      where phone_hash = public.phone_hash(p_phone) and kind = 'sent'
        and created_at > now() - interval '24 hours') >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'daily');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.phone_code_check(text) from public, anon;
grant execute on function public.phone_code_check(text) to authenticated;

-- After a wrong or expired code (UC-021 E2). Counts it unless the person is already locked and
-- answers like phone_code_check: { ok: true } or { ok: false, reason: 'locked', until }.
create or replace function public.phone_code_wrong()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  lock jsonb;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  lock := public.phone_lock(uid);
  if not (lock ->> 'locked')::boolean then
    insert into public.phone_code_events (user_id, kind) values (uid, 'wrong');
    lock := public.phone_lock(uid);
  end if;
  if (lock ->> 'locked')::boolean then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'until', lock -> 'until');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.phone_code_wrong() from public, anon;
grant execute on function public.phone_code_wrong() to authenticated;

-- SEC-09 where Auth writes: each code Auth stores for a new number sets phone_change_sent_at. The
-- 6th in 24 hours for the same number is refused, so Auth answers with an error and keeps no code.
create or replace function public.phone_code_on_send()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  h text;
begin
  if new.phone_change_sent_at is distinct from old.phone_change_sent_at
     and coalesce(new.phone_change, '') <> '' then
    h := public.phone_hash(new.phone_change);
    if (select count(*) from public.phone_code_events
        where phone_hash = h and kind = 'sent' and created_at > now() - interval '24 hours') >= 5 then
      raise exception 'daily' using errcode = '54000';
    end if;
    insert into public.phone_code_events (phone_hash, user_id, kind) values (h, new.id, 'sent');
  end if;
  return new;
end;
$$;

revoke all on function public.phone_code_on_send() from public, anon, authenticated;

create trigger phone_code_on_send
  before update of phone_change_sent_at on auth.users
  for each row execute function public.phone_code_on_send();
