-- The public circle and listing photos (#19): BR-LST-004, BR-TRU-003, BR-PRV-002, AC-003-2,
-- SEC-15 to SEC-18, roles-permissions.md P-11 and P-29.
--
-- The browser never sends the public centre: the base draws a random offset once, when the
-- address is first saved, and keeps it in listing_private. The centre is the address moved by that
-- offset. If the host corrects the address, the circle moves with it by the same offset, so the
-- circle never ends up far from the home and saving the address again reveals nothing new.

-- ---------------------------------------------------------------------------
-- Randomness and geometry
-- ---------------------------------------------------------------------------

-- A number in [0, 1) from the 32 leading bits of a version 4 uuid, which Postgres draws from
-- its strong random source (random() can be predicted).
create or replace function public.unit_random()
returns double precision
language sql
volatile
set search_path = public
as $$
  select ('x' || left(replace(gen_random_uuid()::text, '-', ''), 8))::bit(32)::bigint / 4294967296.0::double precision
$$;

-- The point `km` away heading `bearing` degrees (0 = north, 90 = east). Twin of destination() in
-- core/geo.js; tests/fixtures/geo.json holds the cases both must agree on.
create or replace function public.offset_point(
  p_lat double precision, p_lng double precision, p_km double precision, p_bearing double precision,
  out lat double precision, out lng double precision)
language sql
immutable
set search_path = public
as $$
  with v as (
    select p_km / 6371.0088 as d, radians(p_bearing) as b, radians(p_lat) as lat1, radians(p_lng) as lng1
  ), w as (
    select v.*, asin(sin(lat1) * cos(d) + cos(lat1) * sin(d) * cos(b)) as lat2 from v
  ), x as (
    select lat2, degrees(lng1 + atan2(sin(b) * sin(d) * cos(lat1), cos(d) - sin(lat1) * sin(lat2))) + 540 as l from w
  )
  select degrees(lat2), l - 360 * floor(l / 360) - 180 from x
$$;

revoke all on function public.unit_random() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The offset lives with the address (P-11: only the owner reads it)
-- ---------------------------------------------------------------------------

alter table public.listing_private
  add column offset_km double precision,
  add column offset_bearing double precision;

-- Same ring as core/geo.js publicCentre: uniform between 100 m and 500 m, so the centre never sits
-- on the house and the 1 km circle always contains it.
update public.listing_private
  set offset_km = sqrt(0.01 + public.unit_random() * (0.25 - 0.01)),
      offset_bearing = public.unit_random() * 360;

alter table public.listing_private
  alter column offset_km set not null,
  alter column offset_bearing set not null,
  add constraint listing_private_offset_ring check (offset_km >= 0.1 and offset_km < 0.5),
  add constraint listing_private_offset_bearing check (offset_bearing >= 0 and offset_bearing < 360);

create or replace function public.listing_private_offset()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.offset_km := sqrt(0.01 + public.unit_random() * (0.25 - 0.01));
    new.offset_bearing := public.unit_random() * 360;
  else
    -- Drawn once (BR-LST-004): nobody, the owner included, changes it.
    new.offset_km := old.offset_km;
    new.offset_bearing := old.offset_bearing;
    new.listing_id := old.listing_id;
  end if;
  return new;
end;
$$;

create trigger listing_private_offset
  before insert or update on public.listing_private
  for each row execute function public.listing_private_offset();

-- Owned by postgres, so listings_guard lets it write the centre the browser cannot.
create or replace function public.listing_private_set_circle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.lat = old.lat and new.lng = old.lng then
    return null;
  end if;
  update public.listings l
    set public_lat = c.lat, public_lng = c.lng
    from public.offset_point(new.lat, new.lng, new.offset_km, new.offset_bearing) c
    where l.id = new.listing_id;
  return null;
end;
$$;

create trigger listing_private_set_circle
  after insert or update on public.listing_private
  for each row execute function public.listing_private_set_circle();

-- The browser writes the address and nothing else in this table.
revoke all on public.listing_private from anon, authenticated;
grant select, delete on public.listing_private to authenticated;
grant insert (listing_id, address_line, lat, lng) on public.listing_private to authenticated;
grant update (address_line, lat, lng) on public.listing_private to authenticated;

-- ---------------------------------------------------------------------------
-- Listing photos in Storage (schema.md §11, P-29, SEC-15, SEC-17, SEC-18)
-- ---------------------------------------------------------------------------

-- Public by URL like the avatars; Storage refuses anything but JPEG or WebP up to 5 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 5242880, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- {listing_id}/{uuid}.jpg|webp, inside a listing of the person (or any, for an admin). The name is
-- always a generated uuid, never the file's own name, which can carry the street (SEC-18).
create or replace function public.can_write_listing_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|webp)$'
     and exists (
       select 1 from public.listings l
       where l.id::text = split_part(p_name, '/', 1)
         and (l.owner_id = (select auth.uid()) or public.is_admin())
     )
$$;

revoke all on function public.can_write_listing_photo(text) from public, anon;
grant execute on function public.can_write_listing_photo(text) to authenticated;

create policy "P-29 listing photos owner reads own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'listing-photos' and public.can_write_listing_photo(name));

create policy "P-29 listing photos owner uploads to own listing" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'listing-photos' and public.can_write_listing_photo(name));

create policy "P-29 listing photos owner deletes from own listing" on storage.objects
  for delete to authenticated
  using (bucket_id = 'listing-photos' and public.can_write_listing_photo(name));
