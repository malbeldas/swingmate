-- Product emails (notifications.md, INT-002) and the first one that uses them: NTF-009, the email
-- to the admins for each new report (UC-034 step 4, AC-034-2, issue #25).

-- ---------------------------------------------------------------------------
-- notification_log (schema.md §9)
-- ---------------------------------------------------------------------------

create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  template text not null,
  ref_id uuid,
  status text not null check (status in ('sent', 'failed')),
  provider_message_id text,
  error text, -- a code from the provider, never personal data (notifications.md rule 6)
  created_at timestamptz not null default now()
);

-- Rule 7: the send-email function looks here before sending, so the same email never goes twice.
create unique index notification_log_once on public.notification_log (template, ref_id, user_id) where status = 'sent';
create index notification_log_created_idx on public.notification_log (created_at);

alter table public.notification_log enable row level security;

-- P-28: only admins read it. Only Edge Functions write it, with the service role.
create policy "P-28 notification_log admin read" on public.notification_log
  for select to authenticated
  using (public.is_admin());

revoke all on public.notification_log from anon, authenticated;
grant select on public.notification_log to authenticated;

-- ---------------------------------------------------------------------------
-- Calling send-email from the database (notifications-admin-report.md "Implementación")
-- ---------------------------------------------------------------------------

-- pg_net exists in Supabase (hosted and the local CLI); the plain Postgres used elsewhere skips it.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end
$$;

-- Asks the send-email Edge Function to send `template` about `ref_id`. It needs two Vault secrets,
-- set once per project and never in the repo: project_url and service_role_key. Without them (local,
-- CI, or before setup) it does nothing. It never fails the statement that called it: a report is
-- saved even when the email cannot be asked for.
create or replace function public.request_email(p_template text, p_ref_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  base text;
  key text;
begin
  if to_regclass('vault.decrypted_secrets') is null
    or not exists (select 1 from pg_extension where extname = 'pg_net') then
    return;
  end if;
  execute $q$select max(decrypted_secret) filter (where name = 'project_url'),
      max(decrypted_secret) filter (where name = 'service_role_key')
    from vault.decrypted_secrets where name in ('project_url', 'service_role_key')$q$
    into base, key;
  if base is null or key is null then
    return;
  end if;
  execute $q$select net.http_post(url := $1, body := $2, headers := $3)$q$
    using rtrim(base, '/') || '/functions/v1/send-email',
      jsonb_build_object('template', p_template, 'ref_id', p_ref_id),
      jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || key);
exception when others then
  raise warning 'request_email % failed: %', p_template, sqlstate;
end;
$$;

revoke execute on function public.request_email(text, uuid) from public, anon, authenticated;

-- NTF-009: every new report asks for the admin email.
create or replace function public.reports_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.request_email('NTF-009', new.id);
  return null;
end;
$$;

create trigger reports_after_insert
  after insert on public.reports
  for each row execute function public.reports_after_insert();
