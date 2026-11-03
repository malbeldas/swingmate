-- Inbox and conversation (UC-023, UC-033, issue #22): the list of the caller's conversations, the
-- card of the person who wrote (BR-TRU-001), marking as read (P-16) and live messages (AC-033-1).

-- The caller's conversations, newest first, with what the list shows. The other person is only
-- their display name and photo (BR-TRU-003); a deleted account comes back as a null name and the
-- page shows "Deleted user" (BR-ACC-007). Nothing for anyone else (AC-033-4).
create or replace function public.my_conversations()
returns table (
  id uuid,
  listing_id uuid,
  listing_title text,
  listing_status text,
  suburb_name text,
  cover_path text,
  role text,
  other_name text,
  other_photo_path text,
  stay_from date,
  stay_to date,
  roster_summary text,
  last_message_at timestamptz,
  last_body text,
  last_from_me boolean,
  unread boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.listing_id, l.title, l.status, s.name,
    (select p.storage_path from public.listing_photos p where p.listing_id = l.id order by p.position limit 1),
    case when c.host_id = auth.uid() then 'host' else 'seeker' end,
    case when c.host_id = auth.uid() then sp.display_name else hp.display_name end,
    case when c.host_id = auth.uid() then sp.photo_path else hp.photo_path end,
    c.stay_from, c.stay_to, c.roster_summary, c.last_message_at,
    left(m.body, 140),
    m.sender_id = auth.uid(),
    m.sender_id is distinct from auth.uid() and coalesce(
      (case when c.host_id = auth.uid() then c.host_read_at else c.seeker_read_at end) < c.last_message_at, true)
  from public.conversations c
  join public.listings l on l.id = c.listing_id
  left join public.suburbs s on s.id = l.suburb_id
  left join public.profiles sp on sp.id = c.seeker_id
  left join public.profiles hp on hp.id = c.host_id
  left join lateral (
    select mm.body, mm.sender_id from public.messages mm
    where mm.conversation_id = c.id order by mm.created_at desc limit 1
  ) m on true
  where auth.uid() is not null and (c.seeker_id = auth.uid() or c.host_id = auth.uid())
  order by c.last_message_at desc
  limit 200
$$;

revoke execute on function public.my_conversations() from public, anon;
grant execute on function public.my_conversations() to authenticated;

-- schema.md §10 inquirer_card, BR-TRU-001, AC-023-1 and AC-023-2: what the host of this
-- conversation sees about the person who wrote, and the requested nights against the listing's
-- calendar today. Never email, phone, employer or address (BR-TRU-003). Null for anyone but the host,
-- and for a deleted account.
create or replace function public.inquirer_card(p_conversation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'display_name', p.display_name,
    'photo_path', p.photo_path,
    'bio', p.bio,
    'work_type', p.work_type,
    'base_suburb', s.name || ', ' || s.state,
    'created_at', p.created_at,
    'email_verified', u.email_confirmed_at is not null,
    'phone_verified', u.phone_confirmed_at is not null,
    'roster_pattern', case when r.user_id is null then null
      else jsonb_build_object('days_on', r.days_on, 'days_off', r.days_off) end,
    -- "Messaged N hosts this month": hosts written to in the last 30 days, this one included.
    'hosts_this_month', (
      select count(distinct c2.host_id) from public.conversations c2
      where c2.seeker_id = c.seeker_id and c2.created_at > now() - interval '30 days'
    ),
    'stay_from', c.stay_from,
    'stay_to', c.stay_to,
    'nights', public.listing_nights_at(c.listing_id, c.stay_from, least(c.stay_to - c.stay_from, 84),
      public.listing_today(c.listing_id))
  )
  from public.conversations c
  join public.profiles p on p.id = c.seeker_id
  join auth.users u on u.id = p.id
  left join public.suburbs s on s.id = p.base_suburb_id
  left join public.rosters r on r.user_id = p.id
  where c.id = p_conversation_id and c.host_id = auth.uid()
$$;

revoke execute on function public.inquirer_card(uuid) from public, anon;
grant execute on function public.inquirer_card(uuid) to authenticated;

-- P-16: each participant marks only their own side as read (UC-033 step 4).
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.conversations set
    seeker_read_at = case when seeker_id = auth.uid() then now() else seeker_read_at end,
    host_read_at = case when host_id = auth.uid() then now() else host_read_at end
  where id = p_conversation_id and auth.uid() is not null
    and (seeker_id = auth.uid() or host_id = auth.uid())
$$;

revoke execute on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- AC-033-1: new messages reach the open conversation through Supabase Realtime, which applies the
-- same P-17 policy to each subscriber. The publication exists only where Realtime runs.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;
