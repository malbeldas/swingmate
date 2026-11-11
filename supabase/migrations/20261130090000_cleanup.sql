-- The daily cleanup (BR-PRV-003, infrastructure.md §4 `cleanup`, schema.md "Borrado" and §11),
-- missing until the retroactive risk review of 11/11. Every day at 3:00 Perth the cleanup Edge
-- Function calls cleanup_run, then removes from Storage the files cleanup_orphan_files lists.
--   * Removed listings are deleted 90 days after removal, with what hangs from them (photos rows,
--     availability, conversations about them, saved homes).
--   * Availability exceptions for nights already past are deleted.
--   * Reports closed over 2 years ago, and moderation entries over 2 years old, are anonymised: the
--     people (reporter, target, admin) and the free text go; what happened and when stays.
--   * Phone code events older than 2 days go, even when nobody verifies a phone that day.
--   * Files in listing-photos and avatars that no row points to, a day after upload: the photos of
--     purged listings, of deleted accounts when Storage failed during delete-account, and uploads
--     the wizard never saved.
-- Also from that review: deleting an account sets user_id to NULL in analytics_events (schema.md:
-- "se pone NULL al borrar la cuenta") and notification_log.

-- ---------------------------------------------------------------------------
-- BR-ADM-001 keeps the moderation log unchangeable. The only exception is BR-PRV-003's
-- anonymisation, done by cleanup_run: it raises the transaction-local flag swingmate.retention, and
-- even then only entries over 2 years old can change, only to the anonymised values, and none can be
-- deleted. Nobody but the table owner can update the table anyway (P-24).
-- ---------------------------------------------------------------------------
create or replace function public.moderation_actions_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and current_setting('swingmate.retention', true) = 'on'
     and old.created_at < now() - interval '2 years'
     and new.admin_id = '00000000-0000-0000-0000-000000000000'
     and new.target_id = '00000000-0000-0000-0000-000000000000'
     and new.note = 'Anonymised'
     and (new.id, new.action, new.target_type, new.report_id, new.created_at)
       is not distinct from (old.id, old.action, old.target_type, old.report_id, old.created_at) then
    return new;
  end if;
  raise exception 'The moderation log cannot be changed' using errcode = '42501';
end;
$$;

-- ---------------------------------------------------------------------------
-- cleanup_run: everything the database does by itself. Returns the counts.
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_run(p_now timestamptz default now())
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  nil constant uuid := '00000000-0000-0000-0000-000000000000';
  listings_gone int;
  exceptions_gone int;
  reports_done int;
  actions_done int;
  phone_gone int;
begin
  delete from public.listings where status = 'removed' and removed_at <= p_now - interval '90 days';
  get diagnostics listings_gone = row_count;

  delete from public.listing_availability_exceptions e
    where e.night < public.listing_today(e.listing_id) - 1;
  get diagnostics exceptions_gone = row_count;

  update public.reports set reporter_id = null, target_id = nil, details = null
    where status = 'closed' and closed_at is not null and closed_at <= p_now - interval '2 years'
      and (reporter_id is not null or target_id <> nil or details is not null);
  get diagnostics reports_done = row_count;

  perform set_config('swingmate.retention', 'on', true);
  update public.moderation_actions set admin_id = nil, target_id = nil, note = 'Anonymised'
    where created_at <= p_now - interval '2 years' and created_at < now() - interval '2 years'
      and (admin_id <> nil or target_id <> nil or note <> 'Anonymised');
  get diagnostics actions_done = row_count;
  perform set_config('swingmate.retention', 'off', true);

  delete from public.phone_code_events where created_at < p_now - interval '2 days';
  get diagnostics phone_gone = row_count;

  return jsonb_build_object('listings', listings_gone, 'exceptions', exceptions_gone,
    'reports', reports_done, 'moderation_actions', actions_done, 'phone_code_events', phone_gone);
end;
$$;

-- ---------------------------------------------------------------------------
-- cleanup_orphan_files: files no row points to, uploaded over a day ago (so a listing being written
-- in the wizard keeps its photos). [{ bucket, path }], at most p_limit. The Edge Function removes
-- them through the Storage API, which also deletes the file itself.
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_orphan_files(p_now timestamptz default now(), p_limit int default 500)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if to_regclass('storage.objects') is null then
    return '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'path', o.name)), '[]'::jsonb) into result
  from (
    select o.bucket_id, o.name from storage.objects o
    where o.created_at < p_now - interval '1 day'
      and ((o.bucket_id = 'listing-photos'
            and not exists (select 1 from public.listing_photos f where f.storage_path = o.name))
        or (o.bucket_id = 'avatars'
            and not exists (select 1 from public.profiles p where p.photo_path = o.name)))
    order by o.created_at
    limit greatest(p_limit, 0)
  ) o;
  return result;
end;
$$;

revoke execute on function public.cleanup_run(timestamptz) from public, anon, authenticated;
revoke execute on function public.cleanup_orphan_files(timestamptz, int) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.cleanup_run(timestamptz) to service_role;
    grant execute on function public.cleanup_orphan_files(timestamptz, int) to service_role;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- delete_account (BR-ACC-007) as before, plus: the person's analytics events stay as anonymous ones
-- (schema.md analytics_events.user_id) and the email log loses who it went to.
-- ---------------------------------------------------------------------------
create or replace function public.delete_account(p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  update public.listings set status = 'removed', removed_at = coalesce(removed_at, now())
    where owner_id = p_user_id and status <> 'removed';
  delete from public.listing_private a using public.listings l where a.listing_id = l.id and l.owner_id = p_user_id;
  delete from public.listing_photos f using public.listings l where f.listing_id = l.id and l.owner_id = p_user_id;
  update public.analytics_events set user_id = null where user_id = p_user_id;
  update public.notification_log set user_id = null where user_id = p_user_id;
  delete from auth.users where id = p_user_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.delete_account(uuid) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.delete_account(uuid) to service_role;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Every day at 3:00 Perth (19:00 UTC), infrastructure.md §4.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('cleanup', '0 19 * * *', $job$select public.call_edge_function('cleanup', '{}'::jsonb)$job$);
  end if;
end
$$;
