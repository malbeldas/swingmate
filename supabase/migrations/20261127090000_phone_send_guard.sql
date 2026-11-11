-- Retroactive risk review of UC-021 (11/11): the database refuses a code the page would refuse,
-- even when Auth is called directly with updateUser({ phone }) and the page is skipped.
--   * NTF-008 AC-2, T-07: only Australian mobiles get a code. phone_code_check already said it to
--     the page; now the trigger on auth.users holds it too, so no SMS goes to another country.
--   * AC-021-2: while verification is locked after 5 wrong codes, no new code is stored.
--   * SEC-09: 5 codes per number in 24 hours, as before.
-- Auth stores the number without "+", so the rule is ^614 and 8 digits.
-- Note (BR-TRU-003): phone_hash is an unsalted SHA-256 of a number with ~10^8 possible values, so
-- it is pseudonymous, not anonymous. Nobody reads the table (P-31) and rows last 2 days.

create or replace function public.phone_code_on_send()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  h text;
  lock jsonb;
begin
  if new.phone_change_sent_at is distinct from old.phone_change_sent_at
     and coalesce(new.phone_change, '') <> '' then
    lock := public.phone_lock(new.id);
    if (lock ->> 'locked')::boolean then
      raise exception 'locked' using errcode = '54000';
    end if;
    if regexp_replace(new.phone_change, '\D', '', 'g') !~ '^614[0-9]{8}$' then
      raise exception 'notAustralian' using errcode = '22023';
    end if;
    h := public.phone_hash(new.phone_change);
    if (select count(*) from public.phone_code_events
        where phone_hash = h and kind = 'sent' and created_at > now() - interval '24 hours') >= 5 then
      raise exception 'daily' using errcode = '54000';
    end if;
    insert into public.phone_code_events (phone_hash, user_id, kind) values (h, new.id, 'sent');
  end if;
  return new;
end;
$$;

revoke all on function public.phone_code_on_send() from public, anon, authenticated;
