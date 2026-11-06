-- Saved homes (UC-005, issue #30, schema.md §6, P-13). The person saves and removes with plain writes
-- to saved_listings; "Saved homes" reads them through my_saved_listings, which shows each listing's
-- status (AC-005-2) and never more than search would.

create table public.saved_listings (
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create index saved_listings_listing_idx on public.saved_listings (listing_id);

-- A listing others can open by link (BR-LST-002): live, paused or filled. Drafts, hidden and removed
-- listings can't be saved. Definer, because others' listings are not readable from the table (P-06).
create or replace function public.listing_is_open(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.listings l where l.id = p_listing_id and l.status in ('active', 'paused', 'filled'))
$$;

revoke execute on function public.listing_is_open(uuid) from public, anon;
grant execute on function public.listing_is_open(uuid) to authenticated;

alter table public.saved_listings enable row level security;

-- P-13: only the person reads, saves and removes their own. Admins don't.
create policy "P-13 saved_listings read own" on public.saved_listings
  for select to authenticated using (user_id = auth.uid());
create policy "P-13 saved_listings save own" on public.saved_listings
  for insert to authenticated with check (user_id = auth.uid() and public.listing_is_open(listing_id));
create policy "P-13 saved_listings remove own" on public.saved_listings
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.saved_listings from anon, authenticated;
grant select (user_id, listing_id, created_at), insert (user_id, listing_id), delete on public.saved_listings to authenticated;

-- "Saved homes": newest first, with the status of each (AC-005-2). A listing that is hidden or removed
-- shows only as 'gone' with its title, no photo, price or reason.
create or replace function public.my_saved_listings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row order by saved_at desc), '[]'::jsonb)
  from (
    select s.created_at as saved_at, case when l.status in ('active', 'paused', 'filled')
      then jsonb_build_object(
        'id', l.id, 'title', l.title, 'status', l.status, 'suburb_name', sb.name, 'state', sb.state,
        'weekly_price', l.weekly_price, 'place_type', l.place_type,
        'cover', (select f.storage_path from public.listing_photos f where f.listing_id = l.id order by f.position limit 1),
        'saved_at', s.created_at)
      else jsonb_build_object('id', l.id, 'title', l.title, 'status', 'gone', 'saved_at', s.created_at)
      end as row
    from public.saved_listings s
    join public.listings l on l.id = s.listing_id
    left join public.suburbs sb on sb.id = l.suburb_id
    where s.user_id = auth.uid()
  ) x
$$;

revoke execute on function public.my_saved_listings() from public, anon;
grant execute on function public.my_saved_listings() to authenticated;
