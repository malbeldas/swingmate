-- Outcome question (issue #33): did the person who searched find a place? (UC-052, UC-007,
-- BR-MAIL-003, NTF-005, P-25). On day 14 of a conversation the outcomes Edge Function emails the
-- question and the question appears in the conversation as a system message. The answer comes from
-- the email without logging in (AC-007-1, through the outcome Edge Function) or from the
-- conversation, where it can be changed (A1).

-- ---------------------------------------------------------------------------
-- outcome_responses (schema.md §8)
-- ---------------------------------------------------------------------------

create table public.outcome_responses (
  conversation_id uuid primary key references public.conversations (id) on delete cascade,
  answer text not null check (answer in ('found_here', 'found_elsewhere', 'not_yet')),
  source text not null check (source in ('email', 'chat')),
  answered_at timestamptz not null default now()
);

alter table public.outcome_responses enable row level security;

-- P-25: only the person who searched sees their answer. Writing goes through answer_outcome (chat)
-- and answer_outcome_from_email (the outcome Edge Function, with the signed link).
create policy "P-25 outcome_responses read the seeker" on public.outcome_responses
  for select to authenticated
  using (exists (
    select 1 from public.conversations c where c.id = conversation_id and c.seeker_id = auth.uid()
  ));

revoke all on public.outcome_responses from anon, authenticated;
grant select on public.outcome_responses to authenticated;

-- ---------------------------------------------------------------------------
-- UC-052: who gets the question
-- ---------------------------------------------------------------------------

-- The text of the question in the conversation (BR-MAIL-003).
create or replace function public.outcome_question_text()
returns text
language sql
immutable
as $$ select 'Did you find a place through SwingMate?'::text $$;

-- Conversations whose first enquiry is 14 days old and that were never asked (AC-052-1), of a person
-- who searched and still has an account (E1) with a confirmed email. A run that missed some days
-- still asks up to day 21; older ones are left alone. Each row carries how many emails failed, so
-- the job knows the third failure is the last try (notifications.md rule 6). Only the Edge Function
-- calls it: it carries the email address.
create or replace function public.pending_outcome_questions(p_now timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'conversation_id', c.id,
    'seeker_id', c.seeker_id,
    'seeker_email', u.email,
    'seeker_name', sp.display_name,
    'host_name', hp.display_name,
    'listing_title', l.title,
    'failures', (select count(*) from public.notification_log nl
                 where nl.template = 'NTF-005' and nl.ref_id = c.id and nl.status = 'failed')
  ) order by c.created_at), '[]'::jsonb)
  from public.conversations c
  join public.listings l on l.id = c.listing_id
  join auth.users u on u.id = c.seeker_id and u.email_confirmed_at is not null
  join public.profiles sp on sp.id = c.seeker_id
  left join public.profiles hp on hp.id = c.host_id
  where c.outcome_asked_at is null
    and c.created_at <= p_now - interval '14 days'
    and c.created_at > p_now - interval '21 days'
    and (select count(*) from public.notification_log nl
         where nl.template = 'NTF-005' and nl.ref_id = c.id and nl.status = 'failed') < 3
$$;

-- After the email went out (or failed for the third time): the conversation is marked as asked, so
-- it is never asked again (AC-052-1, AC-007-2), the question appears in it as a system message and
-- outcome_asked is recorded (UC-052 postcondition). The system message doesn't move the
-- conversation up nor mark it unread: the email is the notice. Returns false if it was already asked.
create or replace function public.mark_outcome_asked(p_conversation_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  c public.conversations;
begin
  update public.conversations set outcome_asked_at = now()
  where id = p_conversation_id and outcome_asked_at is null and seeker_id is not null
  returning * into c;
  if c.id is null then
    return false;
  end if;
  insert into public.messages (conversation_id, sender_id, kind, body)
  values (c.id, null, 'system', public.outcome_question_text());
  update public.conversations set last_message_at = c.last_message_at where id = c.id;
  perform public.log_event('outcome_asked', c.seeker_id, jsonb_build_object('conversation_id', c.id));
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- UC-007: the answer
-- ---------------------------------------------------------------------------

-- Saves or changes the answer of an asked conversation; outcome_answered is recorded only when the
-- answer changes, so a second tap on the same link doesn't count twice in the pilot metrics
-- (observability.md §3).
create or replace function public.save_outcome(p_conversation_id uuid, p_answer text, p_source text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  c public.conversations;
  before text;
begin
  if p_answer is null or p_answer not in ('found_here', 'found_elsewhere', 'not_yet') then
    return jsonb_build_object('ok', false, 'reason', 'answer');
  end if;
  select * into c from public.conversations where id = p_conversation_id;
  if c.id is null or c.seeker_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if c.outcome_asked_at is null then
    return jsonb_build_object('ok', false, 'reason', 'not_asked');
  end if;
  select answer into before from public.outcome_responses where conversation_id = c.id;
  insert into public.outcome_responses (conversation_id, answer, source, answered_at)
  values (c.id, p_answer, p_source, now())
  on conflict (conversation_id) do update
    set answer = excluded.answer, source = excluded.source, answered_at = excluded.answered_at;
  if before is distinct from p_answer then
    perform public.log_event('outcome_answered', c.seeker_id,
      jsonb_build_object('conversation_id', c.id, 'answer', p_answer, 'source', p_source));
  end if;
  return jsonb_build_object('ok', true, 'answer', p_answer, 'conversation_id', c.id);
end;
$$;

-- From the conversation (UC-007 step 1 and A1): only the person who searched.
create or replace function public.answer_outcome(p_conversation_id uuid, p_answer text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.conversations where id = p_conversation_id and seeker_id = auth.uid()
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return public.save_outcome(p_conversation_id, p_answer, 'chat');
end;
$$;

-- From the email (AC-007-1): the outcome Edge Function calls it after checking the signed link,
-- which names the conversation (AC-3).
create or replace function public.answer_outcome_from_email(p_conversation_id uuid, p_answer text)
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$ select public.save_outcome(p_conversation_id, p_answer, 'email') $$;

revoke execute on function public.pending_outcome_questions(timestamptz) from public, anon, authenticated;
revoke execute on function public.mark_outcome_asked(uuid) from public, anon, authenticated;
revoke execute on function public.save_outcome(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.answer_outcome_from_email(uuid, text) from public, anon, authenticated;
revoke execute on function public.answer_outcome(uuid, text) from public, anon;
grant execute on function public.answer_outcome(uuid, text) to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.pending_outcome_questions(timestamptz) to service_role;
    grant execute on function public.mark_outcome_asked(uuid) to service_role;
    grant execute on function public.answer_outcome_from_email(uuid, text) to service_role;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- The inbox: the question is for the person who searched
-- ---------------------------------------------------------------------------

-- my_conversations as in 20261109090000_reports.sql, except that the host's preview skips the system
-- message with the question, which only the person who searched sees.
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
    where mm.conversation_id = c.id and (mm.kind <> 'system' or c.seeker_id = auth.uid())
    order by mm.created_at desc limit 1
  ) m on true
  where auth.uid() is not null and (c.seeker_id = auth.uid() or c.host_id = auth.uid())
  order by c.last_message_at desc
  limit 200
$$;

revoke execute on function public.my_conversations() from public, anon;
grant execute on function public.my_conversations() to authenticated;

-- Daily at 10:00 in Perth, 02:00 UTC (infrastructure.md §4).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('outcomes', '0 2 * * *', $job$select public.call_edge_function('outcomes', '{}'::jsonb)$job$);
  end if;
end
$$;
