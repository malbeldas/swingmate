-- NTF-005 can be switched off (BR-MAIL-005): the "Did you find a place?" email carries "Manage email
-- settings" and follows the reminders setting in notification_preferences. pending_outcome_questions
-- as in 20261124090000_outcome_question.sql, plus email_on: with reminders off the outcomes Edge
-- Function sends nothing but still marks the conversation as asked, so the question appears in it.

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
    'email_on', coalesce(np.reminders, true),
    'failures', (select count(*) from public.notification_log nl
                 where nl.template = 'NTF-005' and nl.ref_id = c.id and nl.status = 'failed')
  ) order by c.created_at), '[]'::jsonb)
  from public.conversations c
  join public.listings l on l.id = c.listing_id
  join auth.users u on u.id = c.seeker_id and u.email_confirmed_at is not null
  join public.profiles sp on sp.id = c.seeker_id
  left join public.profiles hp on hp.id = c.host_id
  left join public.notification_preferences np on np.user_id = c.seeker_id
  where c.outcome_asked_at is null
    and c.created_at <= p_now - interval '14 days'
    and c.created_at > p_now - interval '21 days'
    and (select count(*) from public.notification_log nl
         where nl.template = 'NTF-005' and nl.ref_id = c.id and nl.status = 'failed') < 3
$$;

revoke execute on function public.pending_outcome_questions(timestamptz) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.pending_outcome_questions(timestamptz) to service_role;
  end if;
end
$$;
