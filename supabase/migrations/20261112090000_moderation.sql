-- Moderating reports (UC-040, BR-ADM-001, BR-ADM-002, AC-040-1 to AC-040-4, issue #27): the
-- immutable log of admin actions, the queue, reading a reported conversation, and the actions.
-- Everything an admin does goes through these functions, so each step is checked and logged.

-- ---------------------------------------------------------------------------
-- moderation_actions (schema.md §8, P-23, P-24)
-- ---------------------------------------------------------------------------

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null, -- no FK, so the log survives the admin's account (schema.md)
  action text not null check (action in ('hide_listing', 'unhide_listing', 'suspend_user', 'unsuspend_user',
    'warn_user', 'dismiss', 'read_conversation', 'grant_admin', 'revoke_admin')),
  target_type text not null,
  target_id uuid not null,
  report_id uuid,
  note text not null check (char_length(btrim(note)) >= 3),
  created_at timestamptz not null default now()
);

create index moderation_actions_target_idx on public.moderation_actions (target_type, target_id, created_at);

alter table public.moderation_actions enable row level security;

create policy "P-23 moderation_actions admin read" on public.moderation_actions
  for select to authenticated using (public.is_admin());

-- P-23: admins add rows only through admin_act and admin_read_conversation. P-24: nobody edits or
-- deletes a row, admins included; the trigger also stops the table owner (BR-ADM-001).
revoke all on public.moderation_actions from anon, authenticated;
grant select on public.moderation_actions to authenticated;

create or replace function public.moderation_actions_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'The moderation log cannot be changed' using errcode = '42501';
end;
$$;

create trigger moderation_actions_immutable
  before update or delete on public.moderation_actions
  for each row execute function public.moderation_actions_immutable();

-- ---------------------------------------------------------------------------
-- The queue (UC-040 steps 1 and 2)
-- ---------------------------------------------------------------------------

-- The open reports, oldest first, with what the panel shows about each object: a listing's title
-- and owner, a person's display name, or a conversation's listing and the two names. The page
-- groups them by object (A1) with reportQueue in core/moderation.js. Admins only.
create or replace function public.admin_reports()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'target_type', r.target_type,
      'target_id', r.target_id,
      'reason', r.reason,
      'details', r.details,
      'created_at', r.created_at,
      'reporter_name', rp.display_name,
      'target_label', case r.target_type
        when 'listing' then l.title
        when 'user' then up.display_name
        else 'Conversation about ' || cl.title end,
      'target_status', case r.target_type
        when 'listing' then l.status
        when 'user' then up.status end,
      'person_name', case r.target_type
        when 'listing' then lp.display_name
        when 'user' then up.display_name
        else (select p.display_name from public.profiles p
              where p.id = case when c.seeker_id = r.reporter_id then c.host_id else c.seeker_id end) end
    ) order by r.created_at, r.id)
    from public.reports r
    left join public.profiles rp on rp.id = r.reporter_id
    left join public.listings l on r.target_type = 'listing' and l.id = r.target_id
    left join public.profiles lp on lp.id = l.owner_id
    left join public.profiles up on r.target_type = 'user' and up.id = r.target_id
    left join public.conversations c on r.target_type = 'conversation' and c.id = r.target_id
    left join public.listings cl on cl.id = c.listing_id
    where r.status = 'open'
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.admin_reports() from public, anon;
grant execute on function public.admin_reports() to authenticated;

-- ---------------------------------------------------------------------------
-- Reading a reported conversation (BR-ADM-002, AC-040-2, P-14, P-17)
-- ---------------------------------------------------------------------------

-- Only while the conversation has an open report, and every read is logged. Admins have no direct
-- policy on conversations or messages, so this is the only way in.
create or replace function public.admin_read_conversation(p_conversation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  report uuid;
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  select id into report from public.reports
  where target_type = 'conversation' and target_id = p_conversation_id and status = 'open'
  order by created_at limit 1;
  if report is null then
    raise exception 'no open report' using errcode = '42501';
  end if;
  insert into public.moderation_actions (admin_id, action, target_type, target_id, report_id, note)
  values (auth.uid(), 'read_conversation', 'conversation', p_conversation_id, report, 'Read to review the report');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id, 'kind', m.kind, 'body', m.body, 'created_at', m.created_at, 'risk_flag', m.risk_flag,
      'sender', case when m.sender_id = c.host_id then 'host' when m.sender_id = c.seeker_id then 'seeker' end,
      'sender_name', p.display_name
    ) order by m.created_at)
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    left join public.profiles p on p.id = m.sender_id
    where m.conversation_id = p_conversation_id
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.admin_read_conversation(uuid) from public, anon;
grant execute on function public.admin_read_conversation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Acting on a report (BR-ADM-001, AC-040-1, AC-040-3, AC-040-4, UC-040 A1)
-- ---------------------------------------------------------------------------

-- Applies one action with its note, logs it, and closes every open report of the same object.
-- The person affected is the listing's owner, the reported person, or in a conversation the one
-- who did not report it. Returns { ok, closed } or { ok: false, reason }.
create or replace function public.admin_act(p_report_id uuid, p_action text, p_note text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r public.reports;
  person uuid;
  closed int;
  note text := btrim(coalesce(p_note, ''));
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  select * into r from public.reports where id = p_report_id for update;
  if r.id is null or r.status <> 'open' then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  if char_length(note) < 3 then
    return jsonb_build_object('ok', false, 'reason', 'note');
  end if;
  if not (
    (r.target_type = 'listing' and p_action in ('hide_listing', 'warn_user', 'suspend_user', 'dismiss'))
    or (r.target_type = 'user' and p_action in ('warn_user', 'suspend_user', 'dismiss'))
    or (r.target_type = 'conversation' and p_action in ('warn_user', 'suspend_user', 'dismiss'))
  ) then
    return jsonb_build_object('ok', false, 'reason', 'action');
  end if;

  person := case r.target_type
    when 'listing' then (select owner_id from public.listings where id = r.target_id)
    when 'user' then r.target_id
    else (select case when c.seeker_id = r.reporter_id then c.host_id else c.seeker_id end
          from public.conversations c where c.id = r.target_id) end;

  if p_action = 'hide_listing' then
    update public.listings set status = 'hidden', hidden_reason = note where id = r.target_id;
  elsif p_action = 'suspend_user' then
    if person is null then
      return jsonb_build_object('ok', false, 'reason', 'deleted');
    end if;
    update public.profiles set status = 'suspended' where id = person;
  end if;

  insert into public.moderation_actions (admin_id, action, target_type, target_id, report_id, note)
  values (auth.uid(), p_action,
    case when p_action in ('warn_user', 'suspend_user') then 'user' else r.target_type end,
    case when p_action in ('warn_user', 'suspend_user') then coalesce(person, r.target_id) else r.target_id end,
    r.id, note);

  update public.reports set status = 'closed', closed_at = now()
  where target_type = r.target_type and target_id = r.target_id and status = 'open';
  get diagnostics closed = row_count;
  return jsonb_build_object('ok', true, 'closed', closed);
end;
$$;

revoke execute on function public.admin_act(uuid, text, text) from public, anon;
grant execute on function public.admin_act(uuid, text, text) to authenticated;
