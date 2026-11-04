-- Host reminders (issue #32): the unanswered-enquiry reminder (UC-051, BR-MAIL-002, NTF-004) and the
-- calendar check every 30 days (UC-054, BR-AVL-006, NTF-006), with the confirmation from the email
-- without logging in (AC-054-1). The Edge Functions reminders and calendar-checks read these batches
-- once a day; calendar-confirm checks the signed link and calls confirm_calendar_from_email.
-- All of them are for the service role only: the rows carry the host's email address.

-- ---------------------------------------------------------------------------
-- NTF-004: one reminder per conversation (AC-051-1)
-- ---------------------------------------------------------------------------

-- Conversations whose first enquiry is more than 48 hours old with no reply from the host, never
-- reminded, on a listing that is still active (A1, AC-2), of a host with a confirmed email and
-- reminders on (BR-MAIL-005) who hasn't blocked the person. Enquiries older than 14 days are left
-- alone, and a conversation stops after three failed emails (notifications.md rule 6).
create or replace function public.pending_host_reminders(p_now timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'conversation_id', c.id,
    'host_id', c.host_id,
    'host_email', u.email,
    'host_name', hp.display_name,
    'seeker_name', sp.display_name,
    'listing_id', l.id,
    'listing_title', l.title,
    'stay_from', c.stay_from,
    'stay_to', c.stay_to
  ) order by c.created_at), '[]'::jsonb)
  from public.conversations c
  join public.listings l on l.id = c.listing_id and l.status = 'active'
  join auth.users u on u.id = c.host_id and u.email_confirmed_at is not null
  join public.profiles hp on hp.id = c.host_id
  left join public.profiles sp on sp.id = c.seeker_id
  left join public.notification_preferences np on np.user_id = c.host_id
  where c.first_reply_at is null
    and c.reminder_sent_at is null
    and c.seeker_id is not null
    and c.created_at <= p_now - interval '48 hours'
    and c.created_at > p_now - interval '14 days'
    and coalesce(np.reminders, true)
    and not exists (select 1 from public.blocks b where b.blocker_id = c.host_id and b.blocked_id = c.seeker_id)
    and (select count(*) from public.notification_log nl
         where nl.template = 'NTF-004' and nl.ref_id = c.id and nl.status = 'failed') < 3
$$;

-- ---------------------------------------------------------------------------
-- NTF-006: the calendar check, every 30 days while the host doesn't confirm (UC-054)
-- ---------------------------------------------------------------------------

-- Active listings (AC-2) whose calendar wasn't edited or confirmed in 30 days, of a host with a
-- confirmed email and reminders on, not emailed about it in the last 30 days, and with fewer than
-- three failed emails in that time. Each row brings the next 4 weeks from today in the listing's
-- place, as the email shows them.
create or replace function public.pending_calendar_checks(p_now timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'listing_id', l.id,
    'host_id', l.owner_id,
    'host_email', u.email,
    'host_name', hp.display_name,
    'listing_title', l.title,
    'start', public.listing_today(l.id),
    'availability', public.listing_nights_at(l.id, public.listing_today(l.id), 28, public.listing_today(l.id))
  ) order by l.calendar_confirmed_at), '[]'::jsonb)
  from public.listings l
  join auth.users u on u.id = l.owner_id and u.email_confirmed_at is not null
  join public.profiles hp on hp.id = l.owner_id
  left join public.notification_preferences np on np.user_id = l.owner_id
  where l.status = 'active'
    and l.calendar_confirmed_at <= p_now - interval '30 days'
    and coalesce(np.reminders, true)
    and not exists (
      select 1 from public.notification_log nl
      where nl.template = 'NTF-006' and nl.ref_id = l.id and nl.status = 'sent'
        and nl.created_at > p_now - interval '30 days')
    and (select count(*) from public.notification_log nl
         where nl.template = 'NTF-006' and nl.ref_id = l.id and nl.status = 'failed'
           and nl.created_at > p_now - interval '30 days') < 3
$$;

-- AC-054-1: "My calendar is up to date" from the email. calendar-confirm calls it after checking
-- the signed link, so no login is needed. Live, paused and filled listings can be confirmed, as in
-- My places; a hidden or removed one can't.
create or replace function public.confirm_calendar_from_email(p_listing_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  l public.listings;
begin
  select * into l from public.listings where id = p_listing_id;
  if l.id is null or l.owner_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if l.status not in ('active', 'paused', 'filled') then
    return jsonb_build_object('ok', false, 'reason', 'status');
  end if;
  update public.listings set calendar_confirmed_at = now() where id = p_listing_id;
  return jsonb_build_object('ok', true, 'title', l.title);
end;
$$;

revoke execute on function public.pending_host_reminders(timestamptz) from public, anon, authenticated;
revoke execute on function public.pending_calendar_checks(timestamptz) from public, anon, authenticated;
revoke execute on function public.confirm_calendar_from_email(uuid) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.pending_host_reminders(timestamptz) to service_role;
    grant execute on function public.pending_calendar_checks(timestamptz) to service_role;
    grant execute on function public.confirm_calendar_from_email(uuid) to service_role;
  end if;
end
$$;

-- Daily at 9:00 and 8:00 in Perth, 01:00 and 00:00 UTC (infrastructure.md §4).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('reminders', '0 1 * * *', $job$select public.call_edge_function('reminders', '{}'::jsonb)$job$);
    perform cron.schedule('calendar-checks', '0 0 * * *', $job$select public.call_edge_function('calendar-checks', '{}'::jsonb)$job$);
  end if;
end
$$;
