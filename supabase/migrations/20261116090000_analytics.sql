-- The pilot funnel (#29): analytics_events (schema.md §9, BR-ANL-001, BR-ANL-002, SEC-13,
-- roles-permissions.md P-26 and P-27) and the weekly metrics for admins (observability.md §3).
--
-- Events the base can see happen (a conversation starts, a message is sent, a host first replies,
-- a listing is created or published, a report, a block, an email confirmed) are written here by
-- triggers, so they count even when the browser blocks scripts or closes early. The browser writes
-- only what happens on screen (searches, details opened, Send tapped, errors). The lists are the
-- same as EVENTS and SERVER_EVENTS in core/analytics.js; tests/unit/analytics.test.js checks it.

create table public.analytics_events (
  id bigint generated always as identity primary key,
  name text not null check (name in (
    'landing_viewed', 'search_performed', 'near_matches_opened', 'listing_viewed', 'fit_reasons_opened',
    'listing_saved', 'alert_created', 'roster_completed', 'roster_updated', 'message_draft_started',
    'send_message_clicked', 'auth_gate_opened', 'signup_started', 'signup_completed', 'profile_completed',
    'phone_verified', 'conversation_started', 'message_sent', 'first_reply_received', 'conversation_opened',
    'listing_created', 'listing_published', 'availability_exception_added', 'calendar_confirmed',
    'report_created', 'user_blocked', 'outcome_asked', 'outcome_answered', 'email_clicked', 'client_error'
  )),
  session_id uuid not null,
  -- No FK: events outlive the account as anonymous ones (schema.md §9).
  user_id uuid,
  -- SEC-13: a flat object of at most 2 KB.
  props jsonb not null default '{}'::jsonb
    check (jsonb_typeof(props) = 'object' and octet_length(props::text) <= 2048),
  created_at timestamptz not null default now()
);

create index analytics_events_created_idx on public.analytics_events (created_at, name);
create index analytics_events_session_idx on public.analytics_events (session_id, created_at);

alter table public.analytics_events enable row level security;

-- P-26: anyone writes the events of the screen, never the ones the base records itself.
create policy "P-26 analytics_events browser events" on public.analytics_events
  for insert to anon, authenticated
  with check (name in (
    'landing_viewed', 'search_performed', 'near_matches_opened', 'listing_viewed', 'fit_reasons_opened',
    'listing_saved', 'alert_created', 'roster_completed', 'roster_updated', 'message_draft_started',
    'send_message_clicked', 'auth_gate_opened', 'signup_started', 'profile_completed', 'conversation_opened',
    'availability_exception_added', 'calendar_confirmed', 'outcome_answered', 'email_clicked', 'client_error'
  ));

-- P-27: only admins read them.
create policy "P-27 analytics_events admins read" on public.analytics_events
  for select to authenticated
  using (public.is_admin());

revoke all on public.analytics_events from anon, authenticated;
grant insert (name, session_id, props) on public.analytics_events to anon, authenticated;
grant select on public.analytics_events to authenticated;

-- What the browser sends is checked once more here: the user is whoever holds the session, the
-- time is the server's, no value looks like an email or a phone number (BR-ANL-002), and a tab
-- that sends more than 300 events in an hour is ignored, so a loop or a script can't fill the base.
create or replace function public.analytics_session_recent(p_session_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.analytics_events a
  where a.session_id = p_session_id and a.created_at > now() - interval '1 hour'
$$;

revoke all on function public.analytics_session_recent(uuid) from public, anon, authenticated;
grant execute on function public.analytics_session_recent(uuid) to anon, authenticated;

-- Runs as the caller, so current_user tells the browser apart from the triggers below.
create or replace function public.analytics_events_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  value text;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  new.user_id := auth.uid();
  new.created_at := now();
  if jsonb_typeof(new.props) <> 'object' then
    raise exception 'Event props are a flat object' using errcode = '23514';
  end if;
  for value in select v from jsonb_each_text(new.props) as e(k, v) loop
    -- Ids are uuids, which can hold long runs of digits; anything else that looks like an email or
    -- a phone number is refused.
    continue when value ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    if value ~ '[^\s@]+@[^\s@]+\.[^\s@]+' or value ~ '\+?\d[\d\s-]{7,}\d' then
      raise exception 'Events never carry personal data' using errcode = '23514';
    end if;
  end loop;
  if public.analytics_session_recent(new.session_id) >= 300 then
    return null;
  end if;
  return new;
end;
$$;

create trigger analytics_events_guard
  before insert on public.analytics_events
  for each row execute function public.analytics_events_guard();

-- ---------------------------------------------------------------------------
-- Events the base records
-- ---------------------------------------------------------------------------

-- Never lets a failure here stop what the person was doing. A server event has no browser tab, so
-- it gets a session id of its own.
create or replace function public.log_event(p_name text, p_user_id uuid, p_props jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.analytics_events (name, session_id, user_id, props)
  values (p_name, gen_random_uuid(), p_user_id, jsonb_strip_nulls(coalesce(p_props, '{}'::jsonb)));
exception when others then
  raise warning 'analytics event % not stored: %', p_name, sqlerrm;
end;
$$;

revoke all on function public.log_event(text, uuid, jsonb) from public, anon, authenticated;

create or replace function public.analytics_on_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_event('conversation_started', new.seeker_id,
      jsonb_build_object('conversation_id', new.id, 'listing_id', new.listing_id));
  elsif old.first_reply_at is null and new.first_reply_at is not null then
    perform public.log_event('first_reply_received', new.host_id,
      jsonb_build_object('conversation_id', new.id,
        'hours_to_reply', round((extract(epoch from new.first_reply_at - new.created_at) / 3600)::numeric, 1)));
  end if;
  return null;
end;
$$;

create trigger analytics_on_conversation
  after insert or update of first_reply_at on public.conversations
  for each row execute function public.analytics_on_conversation();

create or replace function public.analytics_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind <> 'system' then
    perform public.log_event('message_sent', new.sender_id,
      jsonb_build_object('conversation_id', new.conversation_id,
        'role', (select case when c.host_id = new.sender_id then 'host' else 'seeker' end
                 from public.conversations c where c.id = new.conversation_id),
        'risk_flag', new.risk_flag));
  end if;
  return null;
end;
$$;

create trigger analytics_on_message
  after insert on public.messages
  for each row execute function public.analytics_on_message();

-- published_at marks the first time a listing goes active (observability.md §2 listing_published,
-- schema.md §5); it stays when the listing is paused and comes back.
create or replace function public.listings_mark_published()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'active' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger listings_mark_published
  before insert or update of status on public.listings
  for each row execute function public.listings_mark_published();

create or replace function public.analytics_on_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_event('listing_created', new.owner_id, jsonb_build_object('listing_id', new.id));
  end if;
  if new.published_at is not null and (tg_op = 'INSERT' or old.published_at is null) then
    perform public.log_event('listing_published', new.owner_id,
      jsonb_build_object('listing_id', new.id, 'availability_type', new.availability_type,
        'n_photos', (select count(*) from public.listing_photos f where f.listing_id = new.id)));
  end if;
  return null;
end;
$$;

-- No column list: published_at is set by the trigger above, not by the UPDATE itself.
create trigger analytics_on_listing
  after insert or update on public.listings
  for each row execute function public.analytics_on_listing();

create or replace function public.analytics_on_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.log_event('report_created', new.reporter_id,
    jsonb_build_object('target_type', new.target_type, 'reason', new.reason));
  return null;
end;
$$;

create trigger analytics_on_report
  after insert on public.reports
  for each row execute function public.analytics_on_report();

create or replace function public.analytics_on_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.log_event('user_blocked', new.blocker_id, '{}'::jsonb);
  return null;
end;
$$;

create trigger analytics_on_block
  after insert on public.blocks
  for each row execute function public.analytics_on_block();

-- signup_completed when the email is confirmed (or arrives confirmed, as with Google) and
-- phone_verified when the mobile is (BR-ANL-001). Which button led there stays in signup_started.
create or replace function public.analytics_on_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null and (tg_op = 'INSERT' or old.email_confirmed_at is null) then
    perform public.log_event('signup_completed', new.id, jsonb_build_object(
      'method', case when new.raw_app_meta_data ->> 'provider' = 'google' then 'google' else 'email' end));
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

create trigger analytics_on_auth_user
  after insert or update of email_confirmed_at, phone_confirmed_at on auth.users
  for each row execute function public.analytics_on_auth_user();

-- ---------------------------------------------------------------------------
-- Weekly metrics (observability.md §3), for admins only
-- ---------------------------------------------------------------------------

-- One row per week, newest first, weeks starting Monday 00:00 UTC. The counts come back raw; the
-- admin page turns them into rates with core/analytics.js metricsRows.
create or replace function public.admin_metrics_weekly(p_weeks integer default 8)
returns table (
  week_start date,
  visitors integer,
  signups integer,
  profiles_completed integer,
  active_listings integer,
  searches integer,
  searches_with_fit integer,
  listing_views integer,
  send_clicks integer,
  gate_opens_message integer,
  signups_from_message integer,
  conversations integer,
  replied_48h integer,
  median_reply_hours numeric,
  agreements integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return query
  with weeks as (
    select w::date as ws, (w + interval '7 days') as we
    from generate_series(date_trunc('week', now() at time zone 'UTC') - make_interval(weeks => least(greatest(p_weeks, 1), 52) - 1),
                         date_trunc('week', now() at time zone 'UTC'), interval '7 days') as w
  ), ev as (
    select e.name, e.session_id, e.props, (date_trunc('week', e.created_at at time zone 'UTC'))::date as ws
    from public.analytics_events e
    where e.created_at >= (select min(ws) from weeks)::timestamp at time zone 'UTC'
  ), conv as (
    select (date_trunc('week', c.created_at at time zone 'UTC'))::date as ws, c.created_at, c.first_reply_at
    from public.conversations c
    where c.created_at >= (select min(ws) from weeks)::timestamp at time zone 'UTC'
  )
  select
    w.ws,
    (select count(distinct ev.session_id) from ev where ev.ws = w.ws and ev.name = 'landing_viewed')::int,
    (select count(*) from ev where ev.ws = w.ws and ev.name = 'signup_completed')::int,
    (select count(*) from ev where ev.ws = w.ws and ev.name = 'profile_completed')::int,
    -- Listings live at the close of the week: published by then and not removed or hidden.
    (select count(*) from public.listings l
      where l.published_at < (w.we at time zone 'UTC')
        and (l.removed_at is null or l.removed_at >= (w.we at time zone 'UTC'))
        and l.status not in ('hidden', 'draft'))::int,
    (select count(*) from ev where ev.ws = w.ws and ev.name = 'search_performed')::int,
    (select count(*) from ev where ev.ws = w.ws and ev.name = 'search_performed'
       and coalesce((ev.props ->> 'n_full')::int, 0) + coalesce((ev.props ->> 'n_strong')::int, 0) > 0)::int,
    (select count(*) from ev where ev.ws = w.ws and ev.name = 'listing_viewed')::int,
    (select count(*) from ev where ev.ws = w.ws and ev.name = 'send_message_clicked')::int,
    (select count(*) from ev where ev.ws = w.ws and ev.name = 'auth_gate_opened' and ev.props ->> 'source' = 'message')::int,
    (select count(*) from ev where ev.ws = w.ws and ev.name = 'signup_started' and ev.props ->> 'source' = 'message')::int,
    (select count(*) from conv where conv.ws = w.ws)::int,
    (select count(*) from conv where conv.ws = w.ws and conv.first_reply_at <= conv.created_at + interval '48 hours')::int,
    (select round((percentile_cont(0.5) within group (order by extract(epoch from conv.first_reply_at - conv.created_at) / 3600))::numeric, 1)
       from conv where conv.ws = w.ws and conv.first_reply_at is not null),
    (select count(*) from ev where ev.ws = w.ws and ev.name = 'outcome_answered' and ev.props ->> 'answer' = 'found_here')::int
  from weeks w
  order by w.ws desc;
end;
$$;

revoke all on function public.admin_metrics_weekly(integer) from public, anon;
grant execute on function public.admin_metrics_weekly(integer) to authenticated;
