-- Alerts (UC-006, UC-053, BR-MAIL-004, NTF-007, issue #31, schema.md §6, P-13). The person creates,
-- pauses, renews and deletes their alerts; the alerts Edge Function runs once a day, reads them with
-- pending_alerts, finds the new homes with search_listings and core/ (the same fit as the search,
-- AC-053-1) and records each home it sent in alert_deliveries, so it is never sent twice.

create table public.search_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  suburb_id integer not null references public.suburbs (id),
  radius_km smallint not null check (radius_km in (5, 15, 25, 40, 50)),
  stay_from date,
  stay_to date,
  use_roster boolean not null,
  place_type text check (place_type in ('private_room', 'entire_place')),
  max_price integer check (max_price > 0),
  paused boolean not null default false,
  expires_at timestamptz not null default now() + interval '90 days',
  created_at timestamptz not null default now(),
  -- Dates win over the roster (BR-SRC-001): either both dates, or the person's roster.
  constraint search_alerts_nights check (
    (stay_from is not null and stay_to is not null and stay_to > stay_from and not use_roster)
    or (stay_from is null and stay_to is null and use_roster))
);

create index search_alerts_user_idx on public.search_alerts (user_id, created_at);

create table public.alert_deliveries (
  alert_id uuid not null references public.search_alerts (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (alert_id, listing_id) -- a home is never sent twice for the same alert
);

create index alert_deliveries_listing_idx on public.alert_deliveries (listing_id);

-- UC-006 E1: at most 5 alerts on (not paused, not expired) per person. Checked when one is created,
-- resumed or renewed.
create or replace function public.alerts_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.paused or new.expires_at <= now() then
    return new;
  end if;
  if tg_op = 'UPDATE' and not old.paused and old.expires_at > now() then
    return new; -- it was already on
  end if;
  if (select count(*) from public.search_alerts a
      where a.user_id = new.user_id and a.id <> new.id and not a.paused and a.expires_at > now()) >= 5 then
    raise exception 'You have 5 alerts on' using errcode = 'P0001', hint = 'alerts_limit';
  end if;
  return new;
end;
$$;

create trigger alerts_limit before insert or update of paused, expires_at on public.search_alerts
  for each row execute function public.alerts_limit();

alter table public.search_alerts enable row level security;
alter table public.alert_deliveries enable row level security; -- no policies: only the service role

-- P-13: each person reads, creates, pauses and deletes only their own. Admins don't.
create policy "P-13 search_alerts read own" on public.search_alerts
  for select to authenticated using (user_id = auth.uid());
create policy "P-13 search_alerts create own" on public.search_alerts
  for insert to authenticated with check (user_id = auth.uid());
create policy "P-13 search_alerts pause own" on public.search_alerts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "P-13 search_alerts delete own" on public.search_alerts
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.search_alerts from anon, authenticated;
revoke all on public.alert_deliveries from anon, authenticated;
grant select (id, user_id, suburb_id, radius_km, stay_from, stay_to, use_roster, place_type, max_price, paused, expires_at, created_at),
  insert (user_id, suburb_id, radius_km, stay_from, stay_to, use_roster, place_type, max_price),
  update (paused), delete
  on public.search_alerts to authenticated;

-- UC-006 A1: renew gives the alert 90 more days from today (BR-MAIL-004). A function, so nobody sets
-- a later date by hand.
create or replace function public.renew_alert(p_alert_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  update public.search_alerts set expires_at = now() + interval '90 days', paused = false
    where id = p_alert_id and user_id = auth.uid();
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
exception when sqlstate 'P0001' then
  return jsonb_build_object('ok', false, 'reason', 'limit');
end;
$$;

revoke execute on function public.renew_alert(uuid) from public, anon;
grant execute on function public.renew_alert(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The daily run (notifications-alert-digest.md "Implementación", UC-053)
-- ---------------------------------------------------------------------------

-- Every alert that can send today: on, not expired (AC-006-2), of a person with a confirmed email,
-- with alert emails on (BR-MAIL-005) and no alert email sent in the last 20 hours (AC-006-1: one a
-- day, also when the run is started twice). Each row brings what the search needs (place, radius,
-- dates or the person's roster today) and the homes already sent for it. Only the Edge Function
-- calls it: it carries the email address.
create or replace function public.pending_alerts(p_now timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'alert_id', a.id,
    'user_id', a.user_id,
    'email', u.email,
    'name', p.display_name,
    'place', jsonb_build_object('id', s.id, 'name', s.name, 'state', s.state, 'lat', s.lat, 'lng', s.lng, 'timezone', s.timezone),
    'radius_km', a.radius_km,
    'stay_from', a.stay_from,
    'stay_to', a.stay_to,
    'use_roster', a.use_roster,
    'roster', case when a.use_roster then (select to_jsonb(r) - 'user_id' from public.rosters r where r.user_id = a.user_id) end,
    'place_type', a.place_type,
    'max_price', a.max_price,
    'created_at', a.created_at,
    'delivered', coalesce((select jsonb_agg(d.listing_id) from public.alert_deliveries d where d.alert_id = a.id), '[]'::jsonb)
  ) order by a.user_id, a.created_at), '[]'::jsonb)
  from public.search_alerts a
  join public.profiles p on p.id = a.user_id
  join auth.users u on u.id = a.user_id and u.email_confirmed_at is not null
  join public.suburbs s on s.id = a.suburb_id
  left join public.notification_preferences np on np.user_id = a.user_id
  where not a.paused
    and a.expires_at > p_now
    and (a.stay_to is null or a.stay_to > (p_now at time zone s.timezone)::date)
    and coalesce(np.alerts, true)
    and not exists (
      select 1 from public.notification_log nl
      where nl.template = 'NTF-007' and nl.user_id = a.user_id and nl.status = 'sent'
        and nl.created_at > p_now - interval '20 hours')
$$;

revoke execute on function public.pending_alerts(timestamptz) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.pending_alerts(timestamptz) to service_role;
    grant select, insert on public.alert_deliveries to service_role;
  end if;
end
$$;

-- Daily at 7:00 in Perth, 23:00 UTC the day before (infrastructure.md §4).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('alerts', '0 23 * * *', $job$select public.call_edge_function('alerts', '{}'::jsonb)$job$);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Download my data (AC-035-2) now includes the alerts
-- ---------------------------------------------------------------------------

create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not public.signed_in_recently(me) then
    return jsonb_build_object('ok', false, 'reason', 'reauth');
  end if;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('email', u.email, 'phone', u.phone, 'created_at', u.created_at) from auth.users u where u.id = me),
    'profile', (select to_jsonb(p) - 'id' - 'listing_limit' from public.profiles p where p.id = me),
    'roster', (select to_jsonb(r) - 'user_id' from public.rosters r where r.user_id = me),
    'listings', coalesce((
      select jsonb_agg(to_jsonb(l) - 'owner_id' - 'hidden_reason' || jsonb_build_object(
        'address', (select jsonb_build_object('line', a.address_line, 'lat', a.lat, 'lng', a.lng) from public.listing_private a where a.listing_id = l.id),
        'photos', coalesce((select jsonb_agg(f.storage_path order by f.position) from public.listing_photos f where f.listing_id = l.id), '[]'::jsonb))
        order by l.created_at)
      from public.listings l where l.owner_id = me), '[]'::jsonb),
    'saved_homes', coalesce((
      select jsonb_agg(jsonb_build_object('listing_id', s.listing_id, 'title', l.title, 'saved_at', s.created_at) order by s.created_at)
      from public.saved_listings s join public.listings l on l.id = s.listing_id where s.user_id = me), '[]'::jsonb),
    'alerts', coalesce((
      select jsonb_agg(jsonb_build_object('place', sb.name || ', ' || sb.state, 'radius_km', a.radius_km,
        'stay_from', a.stay_from, 'stay_to', a.stay_to, 'use_roster', a.use_roster, 'place_type', a.place_type,
        'max_price', a.max_price, 'paused', a.paused, 'expires_at', a.expires_at, 'created_at', a.created_at) order by a.created_at)
      from public.search_alerts a join public.suburbs sb on sb.id = a.suburb_id where a.user_id = me), '[]'::jsonb),
    'notification_preferences', (select to_jsonb(n) - 'user_id' from public.notification_preferences n where n.user_id = me),
    'messages_sent', coalesce((
      select jsonb_agg(jsonb_build_object('conversation_id', m.conversation_id, 'listing', l.title, 'kind', m.kind, 'body', m.body,
        'stay_from', m.stay_from, 'stay_to', m.stay_to, 'sent_at', m.created_at) order by m.created_at)
      from public.messages m join public.conversations c on c.id = m.conversation_id join public.listings l on l.id = c.listing_id
      where m.sender_id = me), '[]'::jsonb)
  ));
end;
$$;

revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
