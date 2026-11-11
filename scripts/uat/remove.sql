-- Removes the UAT test listings that scripts/uat/load.sql added (DEC-017, go-live checklist in
-- infrastructure.md §8). Conversations about them go too (the foreign keys cascade). The photo files are
-- deleted by the workflow; any left behind go with the daily cleanup (BR-PRV-003).
delete from public.listings where id::text like '00000000-0000-4000-8000-0000001%';
select count(*) as uat_listings_left from public.listings where id::text like '00000000-0000-4000-8000-0000001%';
