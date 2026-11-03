-- Listings, their private address, photos and availability (schema.md §5), the nights function
-- (listing_nights, twin of core/availability.js) and the radius search (search_listings).
-- Permissions: roles-permissions.md P-06 to P-12.

-- ---------------------------------------------------------------------------
-- listings (schema.md §5)
-- ---------------------------------------------------------------------------

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'filled', 'hidden', 'removed')),
  title text check (char_length(btrim(title)) between 5 and 80),
  description text check (char_length(description) <= 2000),
  suburb_id integer references public.suburbs (id),
  public_lat double precision check (public_lat between -90 and 90),
  public_lng double precision check (public_lng between -180 and 180),
  place_type text check (place_type in ('private_room', 'entire_place')),
  bathroom text check (bathroom in ('own', 'ensuite', 'shared')),
  weekly_price integer check (weekly_price between 1 and 5000),
  bills_included boolean,
  bond integer check (bond between 0 and 20000),
  furnished boolean,
  min_stay_weeks smallint check (min_stay_weeks between 1 and 52),
  household_size smallint check (household_size between 1 and 12),
  household_on_roster smallint check (household_on_roster >= 0),
  host_lives_onsite boolean,
  airport_minutes smallint check (airport_minutes between 1 and 240),
  couples_ok boolean,
  pets_ok boolean,
  smoking text check (smoking in ('no', 'outside', 'yes')),
  parking text check (parking in ('none', 'street', 'off_street', 'garage')),
  features text[] not null default '{}',
  perks text[] not null default '{}',
  custom_items text[] not null default '{}' check (cardinality(custom_items) <= 10),
  other_rules text check (char_length(other_rules) <= 200),
  availability_type text check (availability_type in ('roster', 'from_date', 'ranges')),
  available_from date,
  calendar_confirmed_at timestamptz not null default now(),
  accuracy_declared_at timestamptz,
  published_at timestamptz,
  hidden_reason text,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_household_on_roster_le_size
    check (household_on_roster is null or household_size is null or household_on_roster <= household_size)
);

-- BR-LST-006: each custom item has 40 characters at most. A CHECK can't hold a subquery, so this
-- helper keeps it a plain constraint.
create or replace function public.text_items_fit(items text[], max_len integer)
returns boolean
language sql
immutable
as $$
  select coalesce(bool_and(char_length(i) between 1 and max_len), true) from unnest(items) as i
$$;

alter table public.listings
  add constraint listings_custom_items_length check (public.text_items_fit(custom_items, 40));

create index listings_search_idx on public.listings (status, public_lat, public_lng);
create index listings_owner_idx on public.listings (owner_id);

create trigger listings_set_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- listing_private: the exact address never travels with the listing (BR-LST-004, BR-TRU-003).
-- ---------------------------------------------------------------------------

create table public.listing_private (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  address_line text not null check (char_length(address_line) <= 200),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180)
);

-- ---------------------------------------------------------------------------
-- listing_photos and availability (schema.md §5)
-- ---------------------------------------------------------------------------

create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  storage_path text not null unique,
  position smallint not null check (position between 0 and 11),
  width smallint not null check (width > 0),
  height smallint not null check (height > 0),
  created_at timestamptz not null default now(),
  unique (listing_id, position),
  -- BR-PRV-002: photos live in the listing's own folder.
  constraint listing_photos_own_folder check (split_part(storage_path, '/', 1) = listing_id::text)
);

create table public.listing_availability_ranges (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  start_night date not null,
  end_exclusive date not null,
  check (end_exclusive > start_night)
);

create index listing_availability_ranges_listing_idx on public.listing_availability_ranges (listing_id);

create table public.listing_availability_exceptions (
  listing_id uuid not null references public.listings (id) on delete cascade,
  night date not null,
  available boolean not null,
  primary key (listing_id, night)
);

-- ---------------------------------------------------------------------------
-- Status guard (BR-LST-002, P-08 to P-10). A signed-in owner may save drafts, pause, mark filled
-- and remove. Only publish_listing (security definer) moves a listing to active (P-09) and only an
-- admin hides one, with a note (P-10). A hidden listing can't be edited by its owner (P-08).
-- ---------------------------------------------------------------------------

create or replace function public.listings_guard()
returns trigger
language plpgsql
as $$
declare
  admin boolean := public.is_admin();
begin
  -- Functions owned by postgres (publish_listing, triggers) and service_role skip the guard.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'A new listing starts as a draft' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'A listing keeps its owner' using errcode = '42501';
  end if;

  if not admin then
    if old.status in ('hidden', 'removed') then
      raise exception 'This listing can no longer be edited' using errcode = '42501';
    end if;
    if new.status is distinct from old.status and new.status in ('active', 'hidden') then
      raise exception 'Only publishing or an admin can set this status' using errcode = '42501';
    end if;
    if new.hidden_reason is distinct from old.hidden_reason then
      raise exception 'Only an admin writes the hidden reason' using errcode = '42501';
    end if;
  elsif new.status = 'hidden' and old.status <> 'hidden' and coalesce(btrim(new.hidden_reason), '') = '' then
    raise exception 'Hiding a listing needs a note' using errcode = '23514';
  end if;

  if new.status = 'removed' and old.status <> 'removed' then
    new.removed_at := now();
  end if;
  return new;
end;
$$;

create trigger listings_guard
  before insert or update on public.listings
  for each row execute function public.listings_guard();

-- Publishing constraint (schema.md §5, BR-LST-001, BR-LST-003, BR-LST-007): a listing that is
-- active, paused or filled has every required field, the accuracy declaration and a public circle
-- on every write. When it enters one of those statuses it also needs the address, 3 photos, a
-- complete availability rule, an owner with confirmed email and phone, and room under the limit.
create or replace function public.listings_check_publishable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  missing text[] := '{}';
  entering boolean;
  open_count integer;
  owner_limit integer;
begin
  if new.status not in ('active', 'paused', 'filled') then
    return new;
  end if;
  if new.title is null then missing := array_append(missing, 'title'); end if;
  if new.suburb_id is null then missing := array_append(missing, 'suburb_id'); end if;
  if new.public_lat is null or new.public_lng is null then missing := array_append(missing, 'public_circle'); end if;
  if new.place_type is null then missing := array_append(missing, 'place_type'); end if;
  if new.bathroom is null then missing := array_append(missing, 'bathroom'); end if;
  if new.weekly_price is null then missing := array_append(missing, 'weekly_price'); end if;
  if new.bills_included is null then missing := array_append(missing, 'bills_included'); end if;
  if new.bond is null then missing := array_append(missing, 'bond'); end if;
  if new.furnished is null then missing := array_append(missing, 'furnished'); end if;
  if new.accuracy_declared_at is null then missing := array_append(missing, 'accuracy_declared_at'); end if;
  if new.availability_type is null
     or (new.availability_type = 'from_date' and new.available_from is null) then
    missing := array_append(missing, 'availability');
  end if;

  entering := tg_op = 'INSERT' or old.status not in ('active', 'paused', 'filled')
              or new.availability_type is distinct from old.availability_type;
  if entering and not exists (select 1 from public.listing_private p where p.listing_id = new.id) then
    missing := array_append(missing, 'address');
  end if;
  if entering and (select count(*) from public.listing_photos f where f.listing_id = new.id) < 3 then
    missing := array_append(missing, 'photos');
  end if;
  if entering and not 'availability' = any (missing) and (
       (new.availability_type = 'roster' and not exists (select 1 from public.rosters r where r.user_id = new.owner_id))
       or (new.availability_type = 'ranges' and not exists (select 1 from public.listing_availability_ranges a where a.listing_id = new.id))) then
    missing := array_append(missing, 'availability');
  end if;
  if entering and not exists (select 1 from auth.users u where u.id = new.owner_id and u.phone_confirmed_at is not null and u.email_confirmed_at is not null) then
    missing := array_append(missing, 'verified_contact');
  end if;

  if cardinality(missing) > 0 then
    raise exception 'Listing is not ready to publish: %', array_to_string(missing, ', ') using errcode = '23514';
  end if;

  if new.status in ('active', 'paused') and (tg_op = 'INSERT' or old.status not in ('active', 'paused')) then
    -- BR-LST-007
    select count(*) into open_count from public.listings l
      where l.owner_id = new.owner_id and l.status in ('active', 'paused') and l.id <> new.id;
    select listing_limit into owner_limit from public.profiles where id = new.owner_id;
    if open_count >= coalesce(owner_limit, 5) then
      raise exception 'Listing limit reached' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger listings_publish_check
  before insert or update on public.listings
  for each row execute function public.listings_check_publishable();

-- BR-AVL-006: any change to the availability rule or its exceptions confirms the calendar.
create or replace function public.listings_touch_calendar()
returns trigger
language plpgsql
as $$
begin
  if new.availability_type is distinct from old.availability_type
     or new.available_from is distinct from old.available_from then
    new.calendar_confirmed_at := now();
  end if;
  return new;
end;
$$;

create trigger listings_touch_calendar
  before update on public.listings
  for each row execute function public.listings_touch_calendar();

create or replace function public.availability_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.listings
    set calendar_confirmed_at = now()
    where id = coalesce(new.listing_id, old.listing_id);
  return null;
end;
$$;

create trigger availability_ranges_touch
  after insert or update or delete on public.listing_availability_ranges
  for each row execute function public.availability_touch();

create trigger availability_exceptions_touch
  after insert or update or delete on public.listing_availability_exceptions
  for each row execute function public.availability_touch();

revoke execute on function public.listings_check_publishable() from public, anon, authenticated;
revoke execute on function public.availability_touch() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.listings enable row level security;
alter table public.listing_private enable row level security;
alter table public.listing_photos enable row level security;
alter table public.listing_availability_ranges enable row level security;
alter table public.listing_availability_exceptions enable row level security;

-- P-06: other people read active listings only through search_listings / get_listing. The table
-- itself shows a row only to its owner and to admins.
create policy "P-08 listings read own" on public.listings
  for select to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- P-07: a member with a ready profile who isn't suspended creates drafts.
create policy "P-07 listings insert own" on public.listings
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and public.profile_is_ready(auth.uid())
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active')
  );

-- P-08: the owner edits, pauses, marks filled and removes (listings_guard limits the statuses).
-- P-10: admins too, to hide with a note.
create policy "P-08 listings update own" on public.listings
  for update to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

revoke all on public.listings from anon, authenticated;
grant select on public.listings to authenticated;
grant insert (id, owner_id, title, description, suburb_id, place_type, bathroom, weekly_price,
              bills_included, bond, furnished, min_stay_weeks, household_size, household_on_roster,
              host_lives_onsite, airport_minutes, couples_ok, pets_ok, smoking, parking, features,
              perks, custom_items, other_rules, availability_type, available_from)
  on public.listings to authenticated;
grant update (status, title, description, suburb_id, place_type, bathroom, weekly_price,
              bills_included, bond, furnished, min_stay_weeks, household_size, household_on_roster,
              host_lives_onsite, airport_minutes, couples_ok, pets_ok, smoking, parking, features,
              perks, custom_items, other_rules, availability_type, available_from, hidden_reason)
  on public.listings to authenticated;

-- P-11: only the owner reads and writes the address. Admins don't (BR-TRU-003).
create policy "P-11 listing_private own" on public.listing_private
  for all to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = auth.uid()))
  with check (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = auth.uid()));

revoke all on public.listing_private from anon, authenticated;
grant select, insert, update, delete on public.listing_private to authenticated;

-- P-12: the owner (and admins) write photos, ranges and exceptions. Nobody else reads them from
-- the table; the public gets them through get_listing and search_listings.
create policy "P-12 listing_photos own" on public.listing_photos
  for all to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and (l.owner_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.listings l where l.id = listing_id and (l.owner_id = auth.uid() or public.is_admin())));

create policy "P-12 listing_availability_ranges own" on public.listing_availability_ranges
  for all to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and (l.owner_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.listings l where l.id = listing_id and (l.owner_id = auth.uid() or public.is_admin())));

create policy "P-12 listing_availability_exceptions own" on public.listing_availability_exceptions
  for all to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and (l.owner_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.listings l where l.id = listing_id and (l.owner_id = auth.uid() or public.is_admin())));

revoke all on public.listing_photos, public.listing_availability_ranges, public.listing_availability_exceptions
  from anon, authenticated;
grant select, insert, update, delete
  on public.listing_photos, public.listing_availability_ranges, public.listing_availability_exceptions
  to authenticated;

-- ---------------------------------------------------------------------------
-- Nights (schema.md §10). SQL twin of core/availability.js: the same cases in
-- tests/fixtures/availability.json run against both (supabase/tests/database/08_listing_nights_parity.sql,
-- generated by tests/fixtures/availability-pgtap.js).
-- ---------------------------------------------------------------------------

-- BR-ROS-003: does the person need a bed in the city that night?
create or replace function public.roster_night_needed(
  days_on integer, days_off integer, anchor date, fly_home_last_day boolean, fly_out_first_day boolean, night date)
returns boolean
language sql
immutable
as $$
  with p as (
    select (((night - anchor) % (days_on + days_off)) + (days_on + days_off)) % (days_on + days_off) as phase,
           days_on + days_off as cycle
  )
  select case
    when p.phase = p.cycle - 1 and not fly_out_first_day then false
    when p.phase >= days_on then true
    else fly_home_last_day and p.phase = days_on - 1
  end
  from p
$$;

-- BR-AVL-002/003/004: '1'/'0' for n nights from p_start, with "today" given. Exceptions win over
-- the rule and a night before today is always '0'. Internal: callers go through listing_nights.
create or replace function public.listing_nights_at(p_listing uuid, p_start date, p_n integer, p_today date)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  l public.listings;
  r public.rosters;
  out text;
begin
  if p_n is null or p_n < 1 or p_n > 366 or p_start is null or p_today is null then
    raise exception 'Nights go from 1 to 366' using errcode = '22023';
  end if;
  select * into l from public.listings where id = p_listing;
  if not found then
    return null;
  end if;
  select * into r from public.rosters where user_id = l.owner_id;

  select string_agg(
    case
      when g.night < p_today then '0'
      when e.available is not null then case when e.available then '1' else '0' end
      when l.availability_type = 'roster' then
        case when r.user_id is not null
               and not public.roster_night_needed(r.days_on, r.days_off, r.anchor_date,
                                                  r.fly_home_last_day, r.fly_out_first_day, g.night)
             then '1' else '0' end
      when l.availability_type = 'from_date' then
        case when l.available_from is not null and g.night >= l.available_from then '1' else '0' end
      when l.availability_type = 'ranges' then
        case when exists (select 1 from public.listing_availability_ranges a
                          where a.listing_id = l.id and g.night >= a.start_night and g.night < a.end_exclusive)
             then '1' else '0' end
      else '0'
    end, '' order by g.night)
  into out
  from (select (p_start + i) as night from generate_series(0, p_n - 1) as i) g
  left join public.listing_availability_exceptions e on e.listing_id = l.id and e.night = g.night;
  return out;
end;
$$;

revoke execute on function public.listing_nights_at(uuid, date, integer, date) from public, anon, authenticated;

-- BR-AVL-005: today in the listing's state time zone.
create or replace function public.listing_today(p_listing uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone coalesce(s.timezone, 'Australia/Perth'))::date
  from public.listings l
  left join public.suburbs s on s.id = l.suburb_id
  where l.id = p_listing
$$;

revoke execute on function public.listing_today(uuid) from public, anon, authenticated;

-- schema.md §10: public nights of a listing anyone may see (BR-LST-002: active, paused or filled),
-- or of the caller's own listing in any status. Others get null.
create or replace function public.listing_nights(p_listing uuid, p_start date, p_n integer)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.listings l
    where l.id = p_listing
      and (l.status in ('active', 'paused', 'filled') or l.owner_id = auth.uid() or public.is_admin())
  ) then
    return null;
  end if;
  return public.listing_nights_at(p_listing, p_start, p_n, public.listing_today(p_listing));
end;
$$;

revoke execute on function public.listing_nights(uuid, date, integer) from public;
grant execute on function public.listing_nights(uuid, date, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Search (schema.md §10, BR-SRC-001/003, UC-001, P-06). Active listings within the radius, with
-- the public fields a card needs and 84 nights from p_start (today in the listing's zone when
-- p_start is null or in the past). Never returns the address, email, phone or the host's roster
-- (BR-TRU-003, roles-permissions.md §5). Fit and order are computed in the browser (core/fit.js).
-- ---------------------------------------------------------------------------

create or replace function public.search_listings(p_lat double precision, p_lng double precision,
                                                  p_radius_km integer, p_start date default null)
returns table (
  id uuid,
  title text,
  suburb_name text,
  state text,
  place_type text,
  bathroom text,
  weekly_price integer,
  bills_included boolean,
  furnished boolean,
  public_lat double precision,
  public_lng double precision,
  distance_km double precision,
  cover_path text,
  host_name text,
  host_photo_path text,
  host_phone_verified boolean,
  nights text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  lat_span double precision;
  lng_span double precision;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Choose a place to search' using errcode = '22023';
  end if;
  if p_radius_km is null or p_radius_km not between 1 and 50 then
    raise exception 'The radius goes from 1 to 50 km' using errcode = '22023';
  end if;

  -- A box around the circle so the index on (status, public_lat, public_lng) does the first cut.
  lat_span := p_radius_km / 111.0;
  lng_span := p_radius_km / (111.0 * greatest(cos(radians(p_lat)), 0.01));

  return query
  with box as (
    select l.*, s.name as s_name, s.state as s_state
    from public.listings l
    join public.suburbs s on s.id = l.suburb_id
    join public.profiles p on p.id = l.owner_id
    where l.status = 'active'
      and p.status = 'active'
      and l.public_lat between p_lat - lat_span and p_lat + lat_span
      and l.public_lng between p_lng - lng_span and p_lng + lng_span
  ), measured as (
    select b.*,
      6371.0 * 2 * asin(sqrt(
        power(sin(radians(b.public_lat - p_lat) / 2), 2)
        + cos(radians(p_lat)) * cos(radians(b.public_lat)) * power(sin(radians(b.public_lng - p_lng) / 2), 2)
      )) as km
    from box b
  )
  select m.id, m.title, m.s_name, m.s_state, m.place_type, m.bathroom, m.weekly_price,
         m.bills_included, m.furnished, m.public_lat, m.public_lng, round(m.km::numeric, 1)::double precision,
         (select f.storage_path from public.listing_photos f where f.listing_id = m.id order by f.position limit 1),
         h.display_name, h.photo_path,
         exists (select 1 from auth.users u where u.id = m.owner_id and u.phone_confirmed_at is not null),
         public.listing_nights_at(m.id, greatest(coalesce(p_start, t.today), t.today), 84, t.today)
  from measured m
  join public.profiles h on h.id = m.owner_id
  cross join lateral (select public.listing_today(m.id) as today) t
  where m.km <= p_radius_km
  order by m.km, m.id
  limit 200;
end;
$$;

revoke execute on function public.search_listings(double precision, double precision, integer, date) from public;
grant execute on function public.search_listings(double precision, double precision, integer, date) to anon, authenticated;
