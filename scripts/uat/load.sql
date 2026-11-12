-- UAT test data (DEC-017): 15 test listings so search, detail and messages can be tried end to end
-- on the published site. Never part of the migrations and never for production (BR-TRU-006): the
-- go-live checklist removes them with scripts/uat/remove.sql (infrastructure.md §8).
--
-- The listings belong to the first admin (BR-ADM-004), so the person testing is also the host
-- who receives the messages and emails. That account needs a verified email and mobile
-- (BR-LST-003); in UAT the mobile can be a test number. Ids start with 00000000-0000-4000-8000-0000001
-- so remove.sql finds them. Running it again adds nothing new. Photos rows point to
-- {listing_id}/uat-{n}.jpg; the workflow uploads those files right after.
do $$
declare
  today date := (now() at time zone 'Australia/Perth')::date;
  owner uuid;
  l record;
  lid uuid;
  sub record;
  open_now integer;
begin
  select u.id into owner from auth.users u
    join public.profiles p on p.id = u.id
    where u.raw_app_meta_data ->> 'role' = 'admin'
    order by u.created_at limit 1;
  if owner is null then
    raise exception 'No admin yet: give your account the admin role first (BR-ADM-004).';
  end if;
  if not exists (select 1 from auth.users where id = owner and email_confirmed_at is not null and phone_confirmed_at is not null) then
    raise exception 'The admin account needs a verified email and mobile before it can host (BR-LST-003). In UAT verify 0400 000 001 with code 123456.';
  end if;

  -- Room for the 15 test listings on top of the owner's own (BR-LST-007). Nothing else in the app
  -- changes listing_limit, so remove.sql puts back the default of 5.
  select count(*) into open_now from public.listings where owner_id = owner and status in ('active', 'paused')
    and id::text not like '00000000-0000-4000-8000-0000001%';
  update public.profiles set listing_limit = greatest(listing_limit, open_now + 15) where id = owner;

  -- n, suburb, state, title, type, bathroom, weekly price, availability, airport minutes, description
  for l in
    select * from (values
      (1, 'Baldivis', 'WA', 'UAT test: quiet room near Baldivis shops', 'private_room', 'ensuite', 260, 'two_one', 45, 'Test listing for UAT. Quiet room with its own ensuite, ten minutes from the freeway.'),
      (2, 'Rockingham', 'WA', 'UAT test: room by the beach in Rockingham', 'private_room', 'shared', 230, 'from_date', 40, 'Test listing for UAT. Shared bathroom, two blocks from the beach.'),
      (3, 'Mandurah', 'WA', 'UAT test: entire unit in Mandurah', 'entire_place', 'own', 420, 'eight_six', 60, 'Test listing for UAT. Whole unit, free while the host is on site.'),
      (4, 'Perth', 'WA', 'UAT test: city room close to the train', 'private_room', 'shared', 300, 'from_date', 20, 'Test listing for UAT. Walk to the train, twenty minutes to the airport.'),
      (5, 'Joondalup', 'WA', 'UAT test: room with parking in Joondalup', 'private_room', 'own', 250, 'two_one', 35, 'Test listing for UAT. Off-street parking and a quiet street.'),
      (6, 'Fremantle', 'WA', 'UAT test: room in a Freo share house', 'private_room', 'shared', 280, 'one_one', 30, 'Test listing for UAT. Three workers on rosters share the house.'),
      (7, 'Midland', 'WA', 'UAT test: room ten minutes from the airport', 'private_room', 'ensuite', 270, 'two_one', 10, 'Test listing for UAT. Close to the airport for early flights.'),
      (8, 'Armadale', 'WA', 'UAT test: granny flat in Armadale', 'entire_place', 'own', 350, 'from_date', 35, 'Test listing for UAT. Separate granny flat at the back of the house.'),
      (9, 'Ellenbrook', 'WA', 'UAT test: room in a new build, Ellenbrook', 'private_room', 'ensuite', 240, 'eight_six', 25, 'Test listing for UAT. New house, the host works eight on, six off.'),
      (10, 'Cannington', 'WA', 'UAT test: room near Carousel, Cannington', 'private_room', 'shared', 220, 'one_one', 20, 'Test listing for UAT. Shops and train nearby.'),
      (11, 'Scarborough', 'WA', 'UAT test: room near Scarborough beach', 'private_room', 'own', 320, 'two_one', 30, 'Test listing for UAT. Five minutes walk to the beach.'),
      (12, 'Kwinana Town Centre', 'WA', 'UAT test: room in Kwinana', 'private_room', 'shared', 210, 'from_date', 40, 'Test listing for UAT. Close to the industrial area.'),
      (13, 'Karratha', 'WA', 'UAT test: room in Karratha', 'private_room', 'shared', 380, 'two_one', 10, 'Test listing for UAT. For DIDO workers in the Pilbara.'),
      (14, 'Kalgoorlie', 'WA', 'UAT test: room in Kalgoorlie', 'private_room', 'ensuite', 330, 'eight_six', 10, 'Test listing for UAT. Close to the Super Pit road.'),
      (15, 'Port Hedland', 'WA', 'UAT test: room in Port Hedland', 'private_room', 'shared', 360, 'from_date', 15, 'Test listing for UAT. Port and airport nearby.')
    ) as t(n, suburb, state, title, place_type, bathroom, price, pattern, airport, description)
  loop
    select s.id, s.lat, s.lng into sub from public.suburbs s
      where s.name = l.suburb and s.state = l.state order by s.id limit 1;
    if sub.id is null then
      raise notice 'Suburb % not found, listing % skipped', l.suburb, l.n;
      continue;
    end if;
    lid := ('00000000-0000-4000-8000-0000001' || lpad(l.n::text, 5, '0'))::uuid;
    if exists (select 1 from public.listings where id = lid) then continue; end if;

    insert into public.listings (id, owner_id, title, description, suburb_id, public_lat, public_lng, place_type, bathroom,
        weekly_price, bills_included, bond, furnished, min_stay_weeks, household_size, household_on_roster,
        host_lives_onsite, airport_minutes, couples_ok, pets_ok, smoking, parking, availability_type, available_from,
        accuracy_declared_at)
      values (lid, owner, l.title, l.description, sub.id, sub.lat, sub.lng, l.place_type, l.bathroom,
        l.price, l.n % 3 <> 0, l.price * 2, true, case when l.n % 4 = 0 then 4 end, 3, 2,
        l.place_type = 'private_room', l.airport, l.n % 5 = 0, false, 'outside',
        case when l.n % 2 = 0 then 'off_street' else 'street' end,
        case when l.pattern = 'from_date' then 'from_date' else 'ranges' end,
        case when l.pattern = 'from_date' then today - 7 end, now());
    -- Saving the address draws the public circle (BR-LST-004). Never a real address.
    insert into public.listing_private (listing_id, address_line, lat, lng)
      values (lid, 'UAT test address, not real', sub.lat + 0.002, sub.lng - 0.002);
    insert into public.listing_photos (listing_id, storage_path, position, width, height)
      select lid, lid || '/uat-' || i || '.jpg', i, 1200, 900 from generate_series(0, 2) i;
    -- The host's off-swing nights over the next 84 days (BR-AVL-003): 2/1 = 14 free, 7 away;
    -- 8/6 = 6 free, 8 away; 1/1 = 7 free, 7 away. Each listing starts at a different point.
    if l.pattern <> 'from_date' then
      insert into public.listing_availability_ranges (listing_id, start_night, end_exclusive)
        select lid, today + c.start, today + c.start + c.free
        from (values ('two_one', 21, 14), ('eight_six', 14, 6), ('one_one', 14, 7)) as p(name, cycle, free),
             lateral (select g - (l.n * 3) % p.cycle as start, p.free from generate_series(0, 84, p.cycle) g) c
        where p.name = l.pattern and c.start + c.free > 0;
    end if;
    update public.listings set status = 'active', published_at = now() where id = lid;
  end loop;
end $$;

select count(*) as uat_listings,
       count(*) filter (where status = 'active') as active
  from public.listings where id::text like '00000000-0000-4000-8000-0000001%';
