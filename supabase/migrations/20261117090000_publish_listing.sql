-- Publishing a listing (UC-020 step 7, schema.md §10 publish_listing, BR-LST-001, BR-LST-003,
-- BR-LST-007). The browser can't set a listing to active (listings_guard) nor write the accuracy
-- statement: this function does both, once listings_check_publishable agrees. The public circle is
-- already there, drawn when the address was saved (20261115090000_private_location.sql).
--
-- Returns { ok: true } or { ok: false, reason } with reason:
--   not_found  the listing doesn't exist or isn't the caller's
--   status     it is filled, hidden or removed, so it can't go live from here
--   suspended  the account is suspended
--   missing    with `missing`: the fields listings_check_publishable names
--   limit      BR-LST-007

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
  if l.status not in ('draft', 'paused') then
    return jsonb_build_object('ok', false, 'reason', 'status');
  end if;
  if exists (select 1 from public.profiles p where p.id = l.owner_id and p.status <> 'active') then
    return jsonb_build_object('ok', false, 'reason', 'suspended');
  end if;
  begin
    update public.listings
      set status = 'active',
          -- BR-LST-003: the statement is made on the publish screen, every time a draft goes live;
          -- without it the check below names accuracy_declared_at with whatever else is missing.
          accuracy_declared_at = case when coalesce(p_accuracy_declared, false) then now()
                                      when l.status = 'draft' then null
                                      else accuracy_declared_at end,
          -- Publishing is the host saying the calendar is right today (BR-AVL-006).
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

revoke all on function public.publish_listing(uuid, boolean) from public, anon;
grant execute on function public.publish_listing(uuid, boolean) to authenticated;

-- The host's own drafts and listings for the wizard, with the address, which only they read
-- (P-11). One call instead of four, so "Save and finish later" comes back in one load.
create or replace function public.my_listing(p_listing_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'listing', to_jsonb(l) - 'hidden_reason' - 'owner_id',
    'address', (select jsonb_build_object('line', p.address_line, 'lat', p.lat, 'lng', p.lng)
                from public.listing_private p where p.listing_id = l.id),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'path', f.storage_path, 'position', f.position,
                                                            'width', f.width, 'height', f.height) order by f.position)
                        from public.listing_photos f where f.listing_id = l.id), '[]'::jsonb),
    'ranges', coalesce((select jsonb_agg(jsonb_build_object('start_night', r.start_night, 'end_exclusive', r.end_exclusive) order by r.start_night)
                        from public.listing_availability_ranges r where r.listing_id = l.id), '[]'::jsonb),
    'exceptions', coalesce((select jsonb_agg(jsonb_build_object('night', e.night, 'available', e.available) order by e.night)
                            from public.listing_availability_exceptions e where e.listing_id = l.id), '[]'::jsonb)
  )
  from public.listings l
  where l.id = p_listing_id and l.owner_id = auth.uid()
$$;

revoke all on function public.my_listing(uuid) from public, anon;
grant execute on function public.my_listing(uuid) to authenticated;
