-- My places (UC-022, #14, BR-LST-002, BR-AVL-006): the host's listings with what the list needs,
-- "My calendar is up to date", and bringing a filled listing back.

-- The host's listings for "My places", newest first, without the removed ones. A hidden listing
-- comes with the admin's reason, which its host may read (UC-022 E1). Never the address.
create or replace function public.my_listings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row order by row ->> 'updated_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', l.id,
      'title', l.title,
      'status', l.status,
      'hidden_reason', case when l.status = 'hidden' then l.hidden_reason end,
      'suburb_name', s.name,
      'state', s.state,
      'weekly_price', l.weekly_price,
      'place_type', l.place_type,
      'availability_type', l.availability_type,
      'cover', (select f.storage_path from public.listing_photos f where f.listing_id = l.id order by f.position limit 1),
      'calendar_confirmed_on', (l.calendar_confirmed_at at time zone coalesce(s.timezone, 'Australia/Perth'))::date,
      'today', public.listing_today(l.id),
      'nights', case when l.availability_type is not null
                     then public.listing_nights_at(l.id, public.listing_today(l.id), 84, public.listing_today(l.id)) end,
      'conversations', (select count(*) from public.conversations c where c.listing_id = l.id),
      'updated_at', l.updated_at
    ) as row
    from public.listings l
    left join public.suburbs s on s.id = l.suburb_id
    where l.owner_id = auth.uid() and l.status <> 'removed'
  ) t
$$;

revoke all on function public.my_listings() from public, anon;
grant execute on function public.my_listings() to authenticated;

-- UC-022 step 4, BR-AVL-006: "My calendar is up to date". The browser can't write
-- calendar_confirmed_at, so the host confirms here. Returns { ok, confirmed_on } or { ok: false, reason }.
create or replace function public.confirm_calendar(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.listings;
begin
  select * into l from public.listings where id = p_listing_id;
  if l.id is null or l.owner_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if l.status not in ('active', 'paused', 'filled') then
    return jsonb_build_object('ok', false, 'reason', 'status');
  end if;
  update public.listings set calendar_confirmed_at = now() where id = p_listing_id;
  return jsonb_build_object('ok', true, 'confirmed_on', public.listing_today(p_listing_id));
end;
$$;

revoke all on function public.confirm_calendar(uuid) from public, anon;
grant execute on function public.confirm_calendar(uuid) to authenticated;

-- UC-022 step 2 "Reactivate": a filled listing comes back like a paused one, without the statement
-- again (BR-LST-003 asks it of drafts). Same function as 20261117090000_publish_listing.sql, with
-- `filled` among the statuses that can go live.
create or replace function public.publish_listing(p_listing_id uuid, p_accuracy_declared boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.listings;
  problem text;
begin
  select * into l from public.listings where id = p_listing_id;
  if l.id is null or l.owner_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if l.status = 'active' then
    return jsonb_build_object('ok', true);
  end if;
  if l.status not in ('draft', 'paused', 'filled') then
    return jsonb_build_object('ok', false, 'reason', 'status');
  end if;
  if exists (select 1 from public.profiles p where p.id = l.owner_id and p.status <> 'active') then
    return jsonb_build_object('ok', false, 'reason', 'suspended');
  end if;
  begin
    update public.listings
      set status = 'active',
          accuracy_declared_at = case when coalesce(p_accuracy_declared, false) then now()
                                      when l.status = 'draft' then null
                                      else accuracy_declared_at end,
          calendar_confirmed_at = case when l.status = 'draft' then now() else calendar_confirmed_at end
      where id = p_listing_id;
  exception when check_violation then
    get stacked diagnostics problem = message_text;
    if problem like 'Listing limit%' then
      return jsonb_build_object('ok', false, 'reason', 'limit');
    end if;
    return jsonb_build_object('ok', false, 'reason', 'missing',
      'missing', to_jsonb(string_to_array(split_part(problem, ': ', 2), ', ')));
  end;
  return jsonb_build_object('ok', true);
end;
$$;
