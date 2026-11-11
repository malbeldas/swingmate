-- Removes the UAT test listings that scripts/uat/load.sql added (DEC-017, go-live checklist in
-- infrastructure.md §8). Conversations about them go too (the foreign keys cascade). The photo files are
-- deleted by the workflow; any left behind go with the daily cleanup (BR-PRV-003). The owner's
-- listing limit goes back to the default of 5 that load.sql raised (BR-LST-007).
update public.profiles p set listing_limit = 5
  where p.listing_limit > 5
    and p.id in (select owner_id from public.listings where id::text like '00000000-0000-4000-8000-0000001%');
delete from public.listings where id::text like '00000000-0000-4000-8000-0000001%';
select count(*) as uat_listings_left from public.listings where id::text like '00000000-0000-4000-8000-0000001%';
