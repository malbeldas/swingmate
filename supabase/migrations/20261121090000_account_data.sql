-- Download my data and Delete my account (UC-035, issue #34, BR-ACC-007, BR-PRV-004, SEC-21).
-- Both need a session and a sign-in in the last 5 minutes (roles-permissions.md §4). The download is
-- export_my_data, called by the person. The deletion runs in the Edge Function delete-account, which
-- also removes the photos from Storage: it reads account_storage_paths and then calls
-- delete_account, both only for the service role.

-- BR-ACC-007: a host's listings stay as 'removed' when the account goes, so the people who wrote to
-- them keep their conversations, with the host shown as "Deleted user". Until now deleting the
-- profile deleted the listings and, with them, those conversations.
alter table public.listings alter column owner_id drop not null;
alter table public.listings drop constraint listings_owner_id_fkey;
alter table public.listings add constraint listings_owner_id_fkey
  foreign key (owner_id) references public.profiles (id) on delete set null;

-- roles-permissions.md §4: a sign-in (password, code or Google) in the last 5 minutes.
create or replace function public.signed_in_recently(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select u.last_sign_in_at > now() - interval '5 minutes' from auth.users u where u.id = p_user_id), false)
$$;

revoke execute on function public.signed_in_recently(uuid) from public, anon, authenticated;

-- BR-PRV-004, AC-035-2: profile, roster, listings, saved homes, alerts and the messages they sent,
-- never what other people wrote. Returns { ok: true, data } or { ok: false, reason: 'reauth' }.
create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not public.signed_in_recently(me) then
    return jsonb_build_object('ok', false, 'reason', 'reauth');
  end if;
  return jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('email', u.email, 'phone', u.phone, 'created_at', u.created_at) from auth.users u where u.id = me),
    'profile', (select to_jsonb(p) - 'id' - 'listing_limit' from public.profiles p where p.id = me),
    'roster', (select to_jsonb(r) - 'user_id' from public.rosters r where r.user_id = me),
    'listings', coalesce((
      select jsonb_agg(to_jsonb(l) - 'owner_id' - 'hidden_reason' || jsonb_build_object(
        'address', (select jsonb_build_object('line', a.address_line, 'lat', a.lat, 'lng', a.lng) from public.listing_private a where a.listing_id = l.id),
        'photos', coalesce((select jsonb_agg(f.storage_path order by f.position) from public.listing_photos f where f.listing_id = l.id), '[]'::jsonb))
        order by l.created_at)
      from public.listings l where l.owner_id = me), '[]'::jsonb),
    'saved_homes', coalesce((
      select jsonb_agg(jsonb_build_object('listing_id', s.listing_id, 'title', l.title, 'saved_at', s.created_at) order by s.created_at)
      from public.saved_listings s join public.listings l on l.id = s.listing_id where s.user_id = me), '[]'::jsonb),
    'alerts', '[]'::jsonb, -- UC-006 arrives with #31
    'notification_preferences', (select to_jsonb(n) - 'user_id' from public.notification_preferences n where n.user_id = me),
    'messages_sent', coalesce((
      select jsonb_agg(jsonb_build_object('conversation_id', m.conversation_id, 'listing', l.title, 'kind', m.kind, 'body', m.body,
        'stay_from', m.stay_from, 'stay_to', m.stay_to, 'sent_at', m.created_at) order by m.created_at)
      from public.messages m join public.conversations c on c.id = m.conversation_id join public.listings l on l.id = c.listing_id
      where m.sender_id = me), '[]'::jsonb)
  ));
end;
$$;

revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

-- The files delete-account removes from Storage: the profile photo and the photos of their listings.
create or replace function public.account_storage_paths(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'avatars', coalesce((select jsonb_agg(p.photo_path) from public.profiles p where p.id = p_user_id and p.photo_path is not null), '[]'::jsonb),
    'listing_photos', coalesce((select jsonb_agg(f.storage_path) from public.listing_photos f join public.listings l on l.id = f.listing_id
      where l.owner_id = p_user_id), '[]'::jsonb))
$$;

-- BR-ACC-007: their listings become 'removed' without address or photos, then the auth user goes and
-- with it the profile, roster, saved homes and preferences. Messages and conversations stay for the
-- other person with the author set to NULL ("Deleted user"); reports keep their record (BR-PRV-003).
create or replace function public.delete_account(p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  update public.listings set status = 'removed', removed_at = coalesce(removed_at, now())
    where owner_id = p_user_id and status <> 'removed';
  delete from public.listing_private a using public.listings l where a.listing_id = l.id and l.owner_id = p_user_id;
  delete from public.listing_photos f using public.listings l where f.listing_id = l.id and l.owner_id = p_user_id;
  delete from auth.users where id = p_user_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.account_storage_paths(uuid) from public, anon, authenticated;
revoke execute on function public.delete_account(uuid) from public, anon, authenticated;
grant execute on function public.account_storage_paths(uuid) to service_role;
grant execute on function public.delete_account(uuid) to service_role;
