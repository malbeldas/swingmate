-- Report and block (UC-034, BR-TRU-005, AC-034-1, AC-034-2, issue #25): the reports table with its
-- limit (SEC-12), and blocking the other person of a conversation without learning their id.

-- ---------------------------------------------------------------------------
-- reports (schema.md §8)
-- ---------------------------------------------------------------------------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid default auth.uid() references public.profiles (id) on delete set null,
  target_type text not null check (target_type in ('listing', 'user', 'conversation')),
  target_id uuid not null,
  reason text not null check (reason in ('scam', 'fake', 'offensive', 'unsafe', 'spam', 'other')),
  details text check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create index reports_open_idx on public.reports (created_at) where status = 'open';
create index reports_reporter_idx on public.reports (reporter_id, created_at);
create index reports_target_idx on public.reports (target_type, target_id);

alter table public.reports enable row level security;

-- P-21: a member reports in their own name. P-22: only admins read; the person who reported does
-- not see the queue. Closing is done by admins through #27.
create policy "P-21 reports insert own" on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

create policy "P-22 reports admin read" on public.reports
  for select to authenticated
  using (public.is_admin());

revoke all on public.reports from anon, authenticated;
grant insert (target_type, target_id, reason, details) on public.reports to authenticated;
grant select on public.reports to authenticated;

-- BR-TRU-005 and SEC-12. The reporter is always the caller, the status starts open, and the object
-- must exist. A conversation can only be reported by one of its two people, because an open report
-- lets an admin read it (BR-ADM-002, T-10). At most 20 reports in 24 hours per person.
create or replace function public.reports_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  new.reporter_id := uid;
  new.status := 'open';
  new.closed_at := null;
  new.created_at := now();
  new.details := nullif(btrim(coalesce(new.details, '')), '');

  if not (
    (new.target_type = 'listing' and exists (
      select 1 from public.listings where id = new.target_id and owner_id is distinct from uid))
    or (new.target_type = 'user' and new.target_id <> uid and exists (
      select 1 from public.profiles where id = new.target_id))
    or (new.target_type = 'conversation' and exists (
      select 1 from public.conversations where id = new.target_id and (seeker_id = uid or host_id = uid)))
  ) then
    raise exception 'target' using errcode = '22023';
  end if;

  if (select count(*) from public.reports
      where reporter_id = uid and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'tooMany' using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger reports_before_insert
  before insert on public.reports
  for each row execute function public.reports_before_insert();

-- ---------------------------------------------------------------------------
-- Blocking from a conversation (BR-TRU-005, BR-MSG-006, AC-034-1)
-- ---------------------------------------------------------------------------

-- The page never has the other person's id; this blocks or unblocks them by the conversation.
-- Returns whether the other person is blocked now, or null when the caller is not a participant or
-- the other account no longer exists.
create or replace function public.set_conversation_block(p_conversation_id uuid, p_blocked boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  other uuid;
begin
  select case when c.seeker_id = uid then c.host_id else c.seeker_id end into other
  from public.conversations c
  where c.id = p_conversation_id and uid is not null and (c.seeker_id = uid or c.host_id = uid);
  if other is null then
    return null;
  end if;
  if coalesce(p_blocked, false) then
    insert into public.blocks (blocker_id, blocked_id) values (uid, other) on conflict do nothing;
  else
    delete from public.blocks where blocker_id = uid and blocked_id = other;
  end if;
  return coalesce(p_blocked, false);
end;
$$;

revoke execute on function public.set_conversation_block(uuid, boolean) from public, anon;
grant execute on function public.set_conversation_block(uuid, boolean) to authenticated;

-- my_conversations gains blocked_by_me, so the person who blocked sees it and can undo it. The
-- blocked person gets nothing new: they never learn about the block (BR-MSG-006).
drop function public.my_conversations();
create function public.my_conversations()
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
  unread boolean,
  blocked_by_me boolean
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
      (case when c.host_id = auth.uid() then c.host_read_at else c.seeker_read_at end) < c.last_message_at, true),
    exists (select 1 from public.blocks b where b.blocker_id = auth.uid()
      and b.blocked_id = case when c.host_id = auth.uid() then c.seeker_id else c.host_id end)
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
