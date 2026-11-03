-- get_listing (schema.md §10, UC-003, P-06): one public listing for the detail page. Never reads
-- listing_private, so the exact address can't travel (BR-LST-004, BR-TRU-003, AC-003-1).

create or replace function public.get_listing(p_id uuid, p_start date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  l public.listings;
  s public.suburbs;
  h public.profiles;
  r public.rosters;
  viewer uuid := auth.uid();
  owner boolean;
  today date;
  start date;
begin
  select * into l from public.listings where id = p_id;
  if not found then
    return null;
  end if;
  owner := coalesce(l.owner_id = viewer, false);
  select * into h from public.profiles where id = l.owner_id;

  -- BR-LST-002, listingView in core/listing.js: others see active, paused and filled listings of
  -- hosts who aren't suspended; the owner (and admins) also see their own drafts and hidden ones.
  if not (owner or public.is_admin()) and (l.status not in ('active', 'paused', 'filled') or h.status <> 'active') then
    return null;
  end if;
  if l.status = 'removed' then
    return null;
  end if;

  select * into s from public.suburbs where id = l.suburb_id;
  select * into r from public.rosters where user_id = l.owner_id;
  today := (now() at time zone coalesce(s.timezone, 'Australia/Perth'))::date;
  start := greatest(coalesce(p_start, today), today);

  return jsonb_build_object(
    'id', l.id,
    'status', l.status,
    'is_owner', owner,
    'title', l.title,
    'description', l.description,
    'suburb_id', l.suburb_id,
    'suburb_name', s.name,
    'state', s.state,
    'timezone', s.timezone,
    'public_lat', l.public_lat,
    'public_lng', l.public_lng,
    'place_type', l.place_type,
    'bathroom', l.bathroom,
    'weekly_price', l.weekly_price,
    'bills_included', l.bills_included,
    'bond', l.bond,
    'furnished', l.furnished,
    'min_stay_weeks', l.min_stay_weeks,
    'household_size', l.household_size,
    'household_on_roster', l.household_on_roster,
    'host_lives_onsite', l.host_lives_onsite,
    'airport_minutes', l.airport_minutes,
    'couples_ok', l.couples_ok,
    'pets_ok', l.pets_ok,
    'smoking', l.smoking,
    'parking', l.parking,
    'features', to_jsonb(l.features),
    'perks', to_jsonb(l.perks),
    'custom_items', to_jsonb(l.custom_items),
    'other_rules', l.other_rules,
    'calendar_confirmed_on', (l.calendar_confirmed_at at time zone coalesce(s.timezone, 'Australia/Perth'))::date,
    'today', today,
    'start', start,
    'nights', public.listing_nights_at(l.id, start, 84, today),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('path', f.storage_path, 'width', f.width, 'height', f.height) order by f.position)
      from public.listing_photos f where f.listing_id = l.id), '[]'::jsonb),
    -- BR-TRU-002: name, photo, phone verified, member since, lives here or the roster pattern
    -- (never its dates). Never email, phone or employer (BR-TRU-003).
    'host', jsonb_build_object(
      'display_name', h.display_name,
      'photo_path', h.photo_path,
      'created_at', h.created_at,
      'phone_verified', exists (select 1 from auth.users u where u.id = l.owner_id and u.phone_confirmed_at is not null),
      'roster_pattern', case when r.user_id is null then null else jsonb_build_object('days_on', r.days_on, 'days_off', r.days_off) end
    )
  );
end;
$$;

revoke execute on function public.get_listing(uuid, date) from public;
grant execute on function public.get_listing(uuid, date) to anon, authenticated;
