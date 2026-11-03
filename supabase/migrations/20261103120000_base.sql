-- Base: helpers, suburbs, profiles, rosters and the sign-up hook.
-- schema.md §1, §3, §4 · roles-permissions.md P-01, P-02, P-04, P-05 · BR-TRU-007

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- roles-permissions.md §2: the admin role lives in app_metadata, which users can't edit.
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role' = 'admin', false);
$$;

-- schema.md §1: updated_at is kept by trigger where rows are edited.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- suburbs (schema.md §3, INT-006). Loaded from the ABS dataset in a later task.
-- ---------------------------------------------------------------------------

create table public.suburbs (
  id integer primary key,
  name text not null,
  state text not null check (state in ('WA', 'NSW', 'VIC', 'QLD', 'SA', 'TAS', 'NT', 'ACT')),
  postcode text,
  lat double precision not null,
  lng double precision not null,
  timezone text not null,
  is_city boolean not null default false,
  created_at timestamptz not null default now()
);

create index suburbs_name_idx on public.suburbs (lower(name) text_pattern_ops);
create index suburbs_lat_lng_idx on public.suburbs (lat, lng);

alter table public.suburbs enable row level security;

-- P-01: everyone reads suburbs.
create policy "P-01 suburbs read" on public.suburbs
  for select to anon, authenticated
  using (true);

revoke all on public.suburbs from anon, authenticated;
grant select on public.suburbs to anon, authenticated;

-- ---------------------------------------------------------------------------
-- profiles (schema.md §4)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  base_suburb_id integer references public.suburbs (id),
  bio text check (char_length(bio) <= 300),
  photo_path text,
  work_type text check (work_type in ('fifo', 'dido', 'bibo', 'other')),
  is_seeking boolean not null default true,
  is_hosting boolean not null default false,
  terms_version text,
  terms_accepted_at timestamptz,
  message_rule text not null default 'email' check (message_rule in ('email', 'phone')),
  listing_limit smallint not null default 5,
  status text not null default 'active' check (status in ('active', 'suspended')),
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_base_suburb_idx on public.profiles (base_suburb_id);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- P-02: only the owner (and admins) read the full row. Others go through RPCs (P-03).
create policy "P-02 profiles read own" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- P-04: the owner creates and edits their profile.
create policy "P-04 profiles insert own" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy "P-04 profiles update own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- P-04: status and listing_limit are not the owner's to set. Column grants leave them
-- out, so only admin Edge Functions (service_role) change them.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (id, display_name, base_suburb_id, bio, photo_path, work_type, is_seeking, is_hosting,
              terms_version, terms_accepted_at, message_rule, last_active_at)
  on public.profiles to authenticated;
grant update (display_name, base_suburb_id, bio, photo_path, work_type, is_seeking, is_hosting,
              terms_version, terms_accepted_at, message_rule, last_active_at)
  on public.profiles to authenticated;

-- schema.md §4: "minimum profile" = name, base suburb, terms accepted and email confirmed.
-- BR-ACC-003, AC-030-1. Answers only for the caller (or an admin), so it can't be used
-- to probe other accounts (SEC-06).
create or replace function public.profile_is_ready(uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if uid is null or (uid is distinct from auth.uid() and not public.is_admin()) then
    return false;
  end if;

  return exists (
    select 1
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = uid
      and p.display_name is not null
      and p.base_suburb_id is not null
      and p.terms_accepted_at is not null
      and u.email_confirmed_at is not null
  );
end;
$$;

revoke execute on function public.profile_is_ready(uuid) from public, anon;
grant execute on function public.profile_is_ready(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- rosters (schema.md §4). "No fixed roster" = no row.
-- ---------------------------------------------------------------------------

create table public.rosters (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  days_on smallint not null check (days_on between 1 and 42),
  days_off smallint not null check (days_off between 1 and 42),
  anchor_date date not null,
  fly_home_last_day boolean not null default true,
  fly_out_first_day boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger rosters_set_updated_at
  before update on public.rosters
  for each row execute function public.set_updated_at();

alter table public.rosters enable row level security;

-- P-05: only the owner reads and writes their roster. Admins don't.
create policy "P-05 rosters own" on public.rosters
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.rosters from anon, authenticated;
grant select, insert, update, delete on public.rosters to authenticated;

-- ---------------------------------------------------------------------------
-- Sign-up hook (BR-TRU-007, AC-030-4): reject disposable email domains.
-- The list is the twin of DISPOSABLE_EMAIL_DOMAINS in core/text-checks.js; a unit
-- test checks both lists match.
-- ---------------------------------------------------------------------------

create or replace function public.is_disposable_email(email text)
returns boolean
language sql
immutable
set search_path = public
as $$
  with parts as (
    select lower(btrim(substring(email from '@([^@]*)$'))) as domain
  )
  select coalesce(
    (select bool_or(parts.domain = d or parts.domain like '%.' || d)
       from parts,
            unnest(array[
              '10minutemail.com', '20minutemail.com', 'burnermail.io', 'discard.email', 'dispostable.com',
              'emailondeck.com', 'fakeinbox.com', 'getnada.com', 'guerrillamail.com', 'guerrillamail.net',
              'guerrillamail.org', 'grr.la', 'mailinator.com', 'mailnesia.com', 'maildrop.cc', 'mintemail.com',
              'mohmal.com', 'mytemp.email', 'nada.email', 'sharklasers.com', 'spamgourmet.com', 'temp-mail.org',
              'tempmail.com', 'tempmail.net', 'tempr.email', 'throwawaymail.com', 'trashmail.com', 'trashmail.de',
              'yopmail.com', 'yopmail.net'
            ]) as d),
    false
  );
$$;

create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
begin
  if event -> 'user' -> 'app_metadata' ->> 'provider' = 'email'
     and public.is_disposable_email(event -> 'user' ->> 'email') then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 400,
        'message', 'Please use a permanent email address.'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
revoke execute on function public.is_disposable_email(text) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant execute on function public.is_disposable_email(text) to supabase_auth_admin;
