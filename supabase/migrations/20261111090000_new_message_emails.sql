-- New message emails (UC-050, BR-MAIL-001, NTF-003, issue #26): the person's email settings, the
-- batch the notify-messages Edge Function sends every 5 minutes, and the schedule.

-- ---------------------------------------------------------------------------
-- notification_preferences (schema.md §9, P-13)
-- ---------------------------------------------------------------------------

create table public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade default auth.uid(),
  new_messages boolean not null default true,
  alerts boolean not null default true,
  reminders boolean not null default true
);

alter table public.notification_preferences enable row level security;

-- P-13: each person reads and writes only their own. No row means everything on.
create policy "P-13 notification_preferences own read" on public.notification_preferences
  for select to authenticated using (user_id = auth.uid());
create policy "P-13 notification_preferences own insert" on public.notification_preferences
  for insert to authenticated with check (user_id = auth.uid());
create policy "P-13 notification_preferences own update" on public.notification_preferences
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.notification_preferences from anon, authenticated;
grant select, insert (user_id, new_messages, alerts, reminders), update (new_messages, alerts, reminders)
  on public.notification_preferences to authenticated;

-- ---------------------------------------------------------------------------
-- Calling Edge Functions from the database
-- ---------------------------------------------------------------------------

-- The general form of request_email (20261110090000_send_email.sql): posts `p_body` to the Edge
-- Function `p_name` with the Vault secrets project_url and service_role_key. Without them, or without
-- pg_net, it does nothing; it never fails the caller.
create or replace function public.call_edge_function(p_name text, p_body jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  base text;
  key text;
begin
  if to_regclass('vault.decrypted_secrets') is null
    or not exists (select 1 from pg_extension where extname = 'pg_net') then
    return;
  end if;
  execute $q$select max(decrypted_secret) filter (where name = 'project_url'),
      max(decrypted_secret) filter (where name = 'service_role_key')
    from vault.decrypted_secrets where name in ('project_url', 'service_role_key')$q$
    into base, key;
  if base is null or key is null then
    return;
  end if;
  execute $q$select net.http_post(url := $1, body := $2, headers := $3)$q$
    using rtrim(base, '/') || '/functions/v1/' || p_name, coalesce(p_body, '{}'::jsonb),
      jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || key);
exception when others then
  raise warning 'call_edge_function % failed: %', p_name, sqlstate;
end;
$$;

revoke execute on function public.call_edge_function(text, jsonb) from public, anon, authenticated;

create or replace function public.request_email(p_template text, p_ref_id uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  select public.call_edge_function('send-email', jsonb_build_object('template', p_template, 'ref_id', p_ref_id))
$$;

revoke execute on function public.request_email(text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The batch (notifications-new-message.md "Implementación")
-- ---------------------------------------------------------------------------

-- One row per conversation and recipient with messages still unread 10 minutes after they were sent
-- and never emailed (AC-050-2), all of them in one email (AC-050-1), at most one email per
-- conversation and recipient per hour (BR-MAIL-001), and only the first inquiry for someone who
-- switched these emails off (A1, AC-4). Messages older than 7 days are left alone. Only the Edge
-- Function calls it: it carries the recipient's email address.
create or replace function public.pending_message_emails(p_now timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with unread as (
    select m.id, m.conversation_id, m.kind, m.body, m.created_at, c.listing_id,
      case when m.sender_id = c.seeker_id then c.host_id else c.seeker_id end as recipient_id,
      m.sender_id
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.emailed_at is null
      and m.sender_id is not null
      and m.created_at <= p_now - interval '10 minutes'
      and m.created_at > p_now - interval '7 days'
      and coalesce(case when m.sender_id = c.seeker_id then c.host_read_at else c.seeker_read_at end, '-infinity') < m.created_at
  ),
  grouped as (
    select conversation_id, recipient_id, min(sender_id::text)::uuid as sender_id,
      bool_or(kind = 'inquiry') as is_inquiry,
      min(created_at) as first_at,
      array_agg(id order by created_at) as message_ids,
      jsonb_agg(body order by created_at) as messages
    from unread
    where recipient_id is not null
    group by conversation_id, recipient_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'conversation_id', g.conversation_id,
    'recipient_id', g.recipient_id,
    'recipient_email', u.email,
    'recipient_name', rp.display_name,
    'recipient_role', case when g.recipient_id = c.host_id then 'host' else 'seeker' end,
    'sender_name', sp.display_name,
    'listing_title', l.title,
    'is_inquiry', g.is_inquiry,
    'stay_from', c.stay_from,
    'stay_to', c.stay_to,
    'roster_summary', c.roster_summary,
    'nights', case when g.is_inquiry and g.recipient_id = c.host_id and c.stay_from is not null
      then public.listing_nights_at(c.listing_id, c.stay_from, least(c.stay_to - c.stay_from, 84), public.listing_today(c.listing_id)) end,
    'first_at', g.first_at,
    'message_ids', to_jsonb(g.message_ids),
    'messages', g.messages
  ) order by g.conversation_id), '[]'::jsonb)
  from grouped g
  join public.conversations c on c.id = g.conversation_id
  join public.listings l on l.id = c.listing_id
  join auth.users u on u.id = g.recipient_id and u.email_confirmed_at is not null
  join public.profiles rp on rp.id = g.recipient_id
  left join public.profiles sp on sp.id = g.sender_id
  left join public.notification_preferences np on np.user_id = g.recipient_id
  where (coalesce(np.new_messages, true) or g.is_inquiry)
    and not exists (
      select 1 from public.notification_log nl
      where nl.template = 'NTF-003' and nl.ref_id = g.conversation_id and nl.user_id = g.recipient_id
        and nl.status = 'sent' and nl.created_at > p_now - interval '60 minutes')
$$;

revoke execute on function public.pending_message_emails(timestamptz) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.pending_message_emails(timestamptz) to service_role;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Every 5 minutes (infrastructure.md, pg_cron)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('notify-messages', '*/5 * * * *', $job$select public.call_edge_function('notify-messages', '{}'::jsonb)$job$);
  end if;
end
$$;
