-- Finding people and listings from the admin panel (UC-041, BR-ADM-001, BR-ADM-004, AC-041-1,
-- issue #28). Search, a person's and a listing's record with their reports and moderation log, and
-- the actions of UC-040 outside a report, including giving and taking the admin role.
-- None of these functions reads `messages`: the only way into a conversation stays
-- admin_read_conversation, with an open report (BR-ADM-002, AC-041-1).

-- ---------------------------------------------------------------------------
-- Search (UC-041 step 1)
-- ---------------------------------------------------------------------------

-- People by display name or email; listings by title or suburb. Up to 20 of each, newest first.
-- Returns { people: [...], listings: [...] }. Fewer than 2 characters returns both empty.
create or replace function public.admin_search(p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  q text := btrim(coalesce(p_query, ''));
  pattern text;
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if char_length(q) < 2 then
    return jsonb_build_object('people', '[]'::jsonb, 'listings', '[]'::jsonb);
  end if;
  -- What people type is matched literally, not as a LIKE pattern.
  pattern := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return jsonb_build_object(
    'people', coalesce((
      select jsonb_agg(x.row order by x.created_at desc)
      from (
        select p.created_at, jsonb_build_object(
          'id', p.id,
          'display_name', p.display_name,
          'email', u.email,
          'suburb', s.name,
          'status', p.status,
          'is_admin', coalesce(u.raw_app_meta_data ->> 'role' = 'admin', false),
          'open_reports', (select count(*) from public.reports r where r.target_type = 'user' and r.target_id = p.id and r.status = 'open')
        ) as row
        from public.profiles p
        left join auth.users u on u.id = p.id
        left join public.suburbs s on s.id = p.base_suburb_id
        where p.display_name ilike pattern or u.email ilike pattern
        order by p.created_at desc
        limit 20
      ) x
    ), '[]'::jsonb),
    'listings', coalesce((
      select jsonb_agg(x.row order by x.created_at desc)
      from (
        select l.created_at, jsonb_build_object(
          'id', l.id,
          'title', l.title,
          'suburb', s.name,
          'status', l.status,
          'owner_id', l.owner_id,
          'owner_name', o.display_name,
          'open_reports', (select count(*) from public.reports r where r.target_type = 'listing' and r.target_id = l.id and r.status = 'open')
        ) as row
        from public.listings l
        left join public.suburbs s on s.id = l.suburb_id
        left join public.profiles o on o.id = l.owner_id
        where l.title ilike pattern or s.name ilike pattern
        order by l.created_at desc
        limit 20
      ) x
    ), '[]'::jsonb));
end;
$$;

revoke execute on function public.admin_search(text) from public, anon;
grant execute on function public.admin_search(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Records (UC-041 step 2)
-- ---------------------------------------------------------------------------

-- The moderation log of one object, newest first, with the admin's name (or null once deleted).
create or replace function public.admin_log(p_target_type text, p_target_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'action', a.action, 'note', a.note, 'created_at', a.created_at,
    'admin_name', ap.display_name, 'report_id', a.report_id
  ) order by a.created_at desc, a.id), '[]'::jsonb)
  from public.moderation_actions a
  left join public.profiles ap on ap.id = a.admin_id
  where a.target_type = p_target_type and a.target_id = p_target_id;
$$;

revoke execute on function public.admin_log(text, uuid) from public, anon, authenticated;

-- Reports about one object, newest first, open and closed.
create or replace function public.admin_target_reports(p_target_type text, p_target_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'reason', r.reason, 'details', r.details, 'status', r.status,
    'created_at', r.created_at, 'reporter_name', rp.display_name
  ) order by r.created_at desc, r.id), '[]'::jsonb)
  from public.reports r
  left join public.profiles rp on rp.id = r.reporter_id
  where r.target_type = p_target_type and r.target_id = p_target_id;
$$;

revoke execute on function public.admin_target_reports(text, uuid) from public, anon, authenticated;

-- A person: profile, account facts, listings, reports about them and their moderation log. The
-- phone number itself stays out; the panel only needs to know whether it is verified.
create or replace function public.admin_person(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'email', u.email,
    'phone_verified', u.phone_confirmed_at is not null,
    'suburb', s.name,
    'status', p.status,
    'is_admin', coalesce(u.raw_app_meta_data ->> 'role' = 'admin', false),
    'is_me', p.id = auth.uid(),
    'created_at', p.created_at,
    'listings', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'status', l.status) order by l.created_at desc)
      from public.listings l where l.owner_id = p.id
    ), '[]'::jsonb),
    'reports', public.admin_target_reports('user', p.id),
    'log', public.admin_log('user', p.id)
  ) into result
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.suburbs s on s.id = p.base_suburb_id
  where p.id = p_id;
  return result;
end;
$$;

revoke execute on function public.admin_person(uuid) from public, anon;
grant execute on function public.admin_person(uuid) to authenticated;

-- A listing: what it is, its host, reports about it and its moderation log.
create or replace function public.admin_listing(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'id', l.id,
    'title', l.title,
    'suburb', s.name,
    'status', l.status,
    'hidden_reason', l.hidden_reason,
    'owner_id', l.owner_id,
    'owner_name', o.display_name,
    'created_at', l.created_at,
    'reports', public.admin_target_reports('listing', l.id),
    'log', public.admin_log('listing', l.id)
  ) into result
  from public.listings l
  left join public.suburbs s on s.id = l.suburb_id
  left join public.profiles o on o.id = l.owner_id
  where l.id = p_id;
  return result;
end;
$$;

revoke execute on function public.admin_listing(uuid) from public, anon;
grant execute on function public.admin_listing(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Acting outside a report (UC-041 step 3, BR-ADM-001, BR-ADM-004)
-- ---------------------------------------------------------------------------

-- The same actions as UC-040 plus undoing them and the admin role, always with a note and logged.
-- A listing: hide_listing, unhide_listing (back to paused, so its host decides when it shows
-- again), warn_user (its host). A person: warn_user, suspend_user, unsuspend_user, grant_admin,
-- revoke_admin (never one's own). Open reports stay open: they are closed from the queue.
-- Returns { ok: true } or { ok: false, reason: 'note' | 'action' | 'missing' | 'state' | 'self' }.
create or replace function public.admin_moderate(p_target_type text, p_target_id uuid, p_action text, p_note text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  note text := btrim(coalesce(p_note, ''));
  l public.listings;
  p public.profiles;
  admin_now boolean;
  log_type text := p_target_type;
  log_id uuid := p_target_id;
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if char_length(note) < 3 then
    return jsonb_build_object('ok', false, 'reason', 'note');
  end if;
  if not (
    (p_target_type = 'listing' and p_action in ('hide_listing', 'unhide_listing', 'warn_user'))
    or (p_target_type = 'user' and p_action in ('warn_user', 'suspend_user', 'unsuspend_user', 'grant_admin', 'revoke_admin'))
  ) then
    return jsonb_build_object('ok', false, 'reason', 'action');
  end if;

  if p_target_type = 'listing' then
    select * into l from public.listings where id = p_target_id for update;
    if l.id is null then
      return jsonb_build_object('ok', false, 'reason', 'missing');
    end if;
    if p_action = 'hide_listing' then
      if l.status in ('hidden', 'removed') then
        return jsonb_build_object('ok', false, 'reason', 'state');
      end if;
      update public.listings set status = 'hidden', hidden_reason = note where id = l.id;
    elsif p_action = 'unhide_listing' then
      if l.status <> 'hidden' then
        return jsonb_build_object('ok', false, 'reason', 'state');
      end if;
      update public.listings set status = 'paused', hidden_reason = null where id = l.id;
    else
      if l.owner_id is null then
        return jsonb_build_object('ok', false, 'reason', 'missing');
      end if;
      log_type := 'user';
      log_id := l.owner_id;
    end if;
  else
    select * into p from public.profiles where id = p_target_id for update;
    if p.id is null then
      return jsonb_build_object('ok', false, 'reason', 'missing');
    end if;
    select coalesce(raw_app_meta_data ->> 'role' = 'admin', false) into admin_now from auth.users where id = p.id;
    if p_action = 'suspend_user' then
      if p.status = 'suspended' then
        return jsonb_build_object('ok', false, 'reason', 'state');
      end if;
      if p.id = auth.uid() then
        return jsonb_build_object('ok', false, 'reason', 'self');
      end if;
      update public.profiles set status = 'suspended' where id = p.id;
    elsif p_action = 'unsuspend_user' then
      if p.status <> 'suspended' then
        return jsonb_build_object('ok', false, 'reason', 'state');
      end if;
      update public.profiles set status = 'active' where id = p.id;
    elsif p_action = 'grant_admin' then
      if coalesce(admin_now, false) then
        return jsonb_build_object('ok', false, 'reason', 'state');
      end if;
      -- BR-ADM-004: only an existing admin gives the role. It takes effect at the person's next
      -- sign in or token refresh.
      update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
      where id = p.id;
    elsif p_action = 'revoke_admin' then
      if not coalesce(admin_now, false) then
        return jsonb_build_object('ok', false, 'reason', 'state');
      end if;
      if p.id = auth.uid() then
        return jsonb_build_object('ok', false, 'reason', 'self');
      end if;
      update auth.users set raw_app_meta_data = raw_app_meta_data - 'role' where id = p.id;
    end if;
  end if;

  insert into public.moderation_actions (admin_id, action, target_type, target_id, note)
  values (auth.uid(), p_action, log_type, log_id, note);
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.admin_moderate(text, uuid, text, text) from public, anon;
grant execute on function public.admin_moderate(text, uuid, text, text) to authenticated;
