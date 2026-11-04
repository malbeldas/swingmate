-- Limits against spam (issue #24, SEC-11, T-02). SEC-10 (BR-MSG-007) already lives in
-- start_conversation and SEC-12 in reports_before_insert; this adds the hourly message limit.
-- messages_before_insert is recreated whole (the applied migrations are not edited); only the
-- SEC-11 block is new.

create index if not exists messages_sender_created_idx on public.messages (sender_id, created_at);

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
    -- SEC-11: at most 60 messages per person per hour, inquiries included. The error code is the
    -- reason in core/messaging.js (canReply) so the page can say it.
    if (select count(*) from public.messages
        where sender_id = new.sender_id and created_at > now() - interval '1 hour') >= 60 then
      raise exception 'hourlyLimit' using errcode = '54000';
    end if;
  end if;

  new.risk_flag := public.risk_check(new.body);
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
