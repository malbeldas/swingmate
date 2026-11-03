-- Conversations, messages and blocks (schema.md §7 and §8, UC-004, issue #21).
-- The first inquiry only goes through start_conversation (P-15), which checks the same things as
-- canStartConversation in core/messaging.js, in the same order and with the same reason codes.

-- ---------------------------------------------------------------------------
-- blocks (schema.md §8). Read by start_conversation and the messages trigger (BR-MSG-006).
-- ---------------------------------------------------------------------------

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

alter table public.blocks enable row level security;

-- P-20: each person reads, adds and removes only their own blocks; admins read. The blocked person
-- never sees the row, so they never learn about the block (BR-MSG-006).
create policy "P-20 blocks read own" on public.blocks
  for select to authenticated
  using (blocker_id = auth.uid() or public.is_admin());

create policy "P-20 blocks insert own" on public.blocks
  for insert to authenticated
  with check (blocker_id = auth.uid());

create policy "P-20 blocks delete own" on public.blocks
  for delete to authenticated
  using (blocker_id = auth.uid());

revoke all on public.blocks from anon, authenticated;
grant select, insert, delete on public.blocks to authenticated;

-- ---------------------------------------------------------------------------
-- conversations (schema.md §7)
-- ---------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  seeker_id uuid references public.profiles (id) on delete set null, -- NULL = "Deleted user"
  host_id uuid references public.profiles (id) on delete set null,
  stay_from date not null,
  stay_to date not null,
  roster_summary text check (char_length(roster_summary) <= 120),
  last_message_at timestamptz not null default now(),
  first_reply_at timestamptz,
  seeker_read_at timestamptz,
  host_read_at timestamptz,
  reminder_sent_at timestamptz,
  outcome_asked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint conversations_stay_order check (stay_to > stay_from),
  -- BR-MSG-001: one conversation per person and listing.
  constraint conversations_one_per_listing unique (listing_id, seeker_id)
);

create index conversations_seeker_idx on public.conversations (seeker_id, last_message_at desc);
create index conversations_host_idx on public.conversations (host_id, last_message_at desc);

alter table public.conversations enable row level security;

-- P-14: only the two participants read it. The admin read with an open report (BR-ADM-002)
-- arrives with the reports table (#27).
create policy "P-14 conversations read participants" on public.conversations
  for select to authenticated
  using (seeker_id = auth.uid() or host_id = auth.uid());

-- P-15: no insert grant; conversations are created only by start_conversation.
-- P-16 (mark as read) arrives with the inbox (#22), as an RPC that touches only the caller's column.
revoke all on public.conversations from anon, authenticated;
grant select on public.conversations to authenticated;

-- ---------------------------------------------------------------------------
-- messages (schema.md §7)
-- ---------------------------------------------------------------------------

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('inquiry', 'text', 'system')),
  -- BR-MSG-003: text only, 1 to 1000 characters.
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  stay_from date,
  stay_to date,
  risk_flag boolean not null default false, -- BR-MSG-008, set by #23
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint messages_stay_only_inquiry check (
    (kind = 'inquiry' and stay_from is not null and stay_to > stay_from)
    or (kind <> 'inquiry' and stay_from is null and stay_to is null)
  )
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);

alter table public.messages enable row level security;

-- P-17: participants read the messages of their conversations.
create policy "P-17 messages read participants" on public.messages
  for select to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and (c.seeker_id = auth.uid() or c.host_id = auth.uid())
  ));

-- P-18: a participant replies with plain text in their own name. Suspended and blocked senders are
-- stopped by the trigger below (BR-MSG-006). Inquiries only come from start_conversation.
create policy "P-18 messages insert participants" on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and kind = 'text'
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and (c.seeker_id = auth.uid() or c.host_id = auth.uid())
    )
  );

-- P-19: messages are never edited or deleted from the web.
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert (conversation_id, sender_id, kind, body) on public.messages to authenticated;

-- schema.md §10, trigger messages_before_insert: refuses suspended or blocked senders (BR-MSG-006)
-- and keeps the conversation's last message and read marks current. The errors carry the same codes
-- as core/messaging.js. risk_flag (BR-MSG-008) is set here by #23.
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.conversations;
  other uuid;
begin
  select * into c from public.conversations where id = new.conversation_id for update;
  if new.sender_id is not null then
    if exists (select 1 from public.profiles where id = new.sender_id and status = 'suspended') then
      raise exception 'suspended' using errcode = '42501';
    end if;
    other := case when new.sender_id = c.seeker_id then c.host_id else c.seeker_id end;
    if other is not null and exists (
      select 1 from public.blocks where blocker_id = other and blocked_id = new.sender_id
    ) then
      raise exception 'blocked' using errcode = '42501';
    end if;
  end if;

  new.created_at := now();
  update public.conversations set
    last_message_at = new.created_at,
    first_reply_at = case
      when new.sender_id = c.host_id and c.first_reply_at is null then new.created_at
      else c.first_reply_at end,
    seeker_read_at = case when new.sender_id = c.seeker_id then new.created_at else c.seeker_read_at end,
    host_read_at = case when new.sender_id = c.host_id then new.created_at else c.host_read_at end
  where id = c.id;
  return new;
end;
$$;

create trigger messages_before_insert
  before insert on public.messages
  for each row execute function public.messages_before_insert();

-- ---------------------------------------------------------------------------
-- start_conversation (schema.md §10, roles-permissions.md §4)
-- ---------------------------------------------------------------------------

-- UC-004 steps 5 to 8. Returns {ok: true, conversation_id, appended} or {ok: false, reason[, missing]}.
-- Order and reason codes match canStartConversation in core/messaging.js:
--   empty | tooLong                                        BR-MSG-003
--   profile (missing: emailVerified, displayName, baseSuburb, intent, terms)   BR-ACC-003
--   suspended                                              BR-MSG-006
--   inactive                                               BR-ACC-005 exception, UC-004 E1
--   owner                                                  BR-LST-008
--   blocked                                                BR-MSG-006, UC-004 E3
--   phone                                                  BR-TRU-004, AC-004-6
--   dates                                                  BR-MSG-002
--   dailyLimit                                             BR-MSG-007, AC-004-7
-- A second inquiry on the same listing joins the existing conversation (BR-MSG-001) and updates its
-- dates to the latest ones; the daily limit never stops it.
create or replace function public.start_conversation(
  p_listing_id uuid, p_body text, p_stay_from date, p_stay_to date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  body text := btrim(coalesce(p_body, ''));
  me record;
  l record;
  missing text[] := '{}';
  today date;
  my_day_start timestamptz;
  started integer;
  existing uuid;
  conv uuid;
  summary text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'profile', 'missing', jsonb_build_array('emailVerified'));
  end if;

  if body = '' then return jsonb_build_object('ok', false, 'reason', 'empty'); end if;
  if char_length(body) > 1000 then return jsonb_build_object('ok', false, 'reason', 'tooLong'); end if;

  select p.display_name, p.base_suburb_id, p.is_seeking, p.is_hosting, p.terms_accepted_at, p.status,
         u.email_confirmed_at, u.phone_confirmed_at, u.created_at as account_created_at,
         coalesce(s.timezone, 'Australia/Sydney') as timezone
    into me
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.suburbs s on s.id = p.base_suburb_id
    where u.id = uid;

  if me.email_confirmed_at is null then missing := array_append(missing, 'emailVerified'); end if;
  if nullif(btrim(coalesce(me.display_name, '')), '') is null then missing := array_append(missing, 'displayName'); end if;
  if me.base_suburb_id is null then missing := array_append(missing, 'baseSuburb'); end if;
  if not coalesce(me.is_seeking or me.is_hosting, false) then missing := array_append(missing, 'intent'); end if;
  if me.terms_accepted_at is null then missing := array_append(missing, 'terms'); end if;
  if cardinality(missing) > 0 then
    return jsonb_build_object('ok', false, 'reason', 'profile', 'missing', to_jsonb(missing));
  end if;

  if me.status = 'suspended' then return jsonb_build_object('ok', false, 'reason', 'suspended'); end if;

  select li.id, li.owner_id, li.status, h.status as host_status, h.message_rule, su.timezone
    into l
    from public.listings li
    join public.profiles h on h.id = li.owner_id
    join public.suburbs su on su.id = li.suburb_id
    where li.id = p_listing_id;

  if not found or l.status <> 'active' or l.host_status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'inactive');
  end if;
  if l.owner_id = uid then return jsonb_build_object('ok', false, 'reason', 'owner'); end if;
  if exists (select 1 from public.blocks where blocker_id = l.owner_id and blocked_id = uid) then
    return jsonb_build_object('ok', false, 'reason', 'blocked');
  end if;
  if l.message_rule = 'phone' and me.phone_confirmed_at is null then
    return jsonb_build_object('ok', false, 'reason', 'phone');
  end if;

  -- BR-MSG-002 and validateStay in core/fit.js: dates in the listing's own time zone (BR-AVL-005).
  today := (now() at time zone l.timezone)::date;
  if p_stay_from is null or p_stay_to is null or p_stay_from < today
     or p_stay_from > (today + interval '1 year')::date or p_stay_to <= p_stay_from then
    return jsonb_build_object('ok', false, 'reason', 'dates');
  end if;

  select id into existing from public.conversations where listing_id = l.id and seeker_id = uid;

  -- BR-MSG-007: accounts under 7 days start at most 10 conversations per day (their own day).
  if existing is null and me.account_created_at > now() - interval '7 days' then
    my_day_start := date_trunc('day', now() at time zone me.timezone) at time zone me.timezone;
    select count(*) into started from public.conversations
      where seeker_id = uid and created_at >= my_day_start;
    if started >= 10 then return jsonb_build_object('ok', false, 'reason', 'dailyLimit'); end if;
  end if;

  -- BR-MSG-002: the roster summary as sent, same words as inquirySummary in core/messaging.js.
  select format('%s:%s roster', days_on, days_off) into summary from public.rosters where user_id = uid;

  insert into public.conversations (listing_id, seeker_id, host_id, stay_from, stay_to, roster_summary)
    values (l.id, uid, l.owner_id, p_stay_from, p_stay_to, summary)
    on conflict (listing_id, seeker_id) do update
      set stay_from = excluded.stay_from, stay_to = excluded.stay_to, roster_summary = excluded.roster_summary
    returning id into conv;

  insert into public.messages (conversation_id, sender_id, kind, body, stay_from, stay_to)
    values (conv, uid, 'inquiry', body, p_stay_from, p_stay_to);

  return jsonb_build_object('ok', true, 'conversation_id', conv, 'appended', existing is not null);
end;
$$;

revoke execute on function public.start_conversation(uuid, text, date, date) from public, anon;
grant execute on function public.start_conversation(uuid, text, date, date) to authenticated;
