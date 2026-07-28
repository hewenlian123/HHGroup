-- Authenticated owner access, role projection repair, and per-user security state.
--
-- This migration is intentionally non-destructive:
-- - no business or receipt rows are rewritten;
-- - no Storage objects are changed or deleted;
-- - the legacy global PIN is disabled, not removed;
-- - roles are projected only from auth.users.raw_app_meta_data.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text null,
  role text not null default 'assistant'
    check (role in ('owner', 'admin', 'assistant')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role text primary key check (role in ('owner', 'admin', 'assistant')),
  perms jsonb not null default '{}'::jsonb
);

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_profiles_updated_at();

insert into public.role_permissions (role, perms)
values
  ('owner', '{"all": true}'::jsonb),
  ('admin', '{"projects.view": true, "workers.view": true, "finance.view": true, "settings.view": true}'::jsonb),
  ('assistant', '{"projects.view": true, "workers.view": true}'::jsonb)
on conflict (role) do nothing;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  projected_role text := coalesce(new.raw_app_meta_data ->> 'role', 'assistant');
begin
  if projected_role not in ('owner', 'admin', 'assistant') then
    projected_role := 'assistant';
  end if;

  insert into public.profiles (id, email, role)
  values (new.id, new.email, projected_role)
  on conflict (id) do update
  set
    email = excluded.email,
    role = excluded.role,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email, raw_app_meta_data on auth.users
for each row execute function public.handle_new_auth_user();

insert into public.profiles (id, email, role)
select
  users.id,
  users.email,
  case
    when coalesce(users.raw_app_meta_data ->> 'role', 'assistant') in ('owner', 'admin', 'assistant')
      then coalesce(users.raw_app_meta_data ->> 'role', 'assistant')
    else 'assistant'
  end
from auth.users as users
on conflict (id) do update
set
  email = excluded.email,
  role = excluded.role,
  updated_at = now();

create or replace function public.upsert_my_profile()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  auth_user_record auth.users%rowtype;
  projected_role text;
begin
  if auth.uid() is null then
    return;
  end if;

  select *
  into auth_user_record
  from auth.users
  where id = auth.uid();

  projected_role := coalesce(auth_user_record.raw_app_meta_data ->> 'role', 'assistant');
  if projected_role not in ('owner', 'admin', 'assistant') then
    projected_role := 'assistant';
  end if;

  insert into public.profiles (id, email, role)
  values (auth_user_record.id, auth_user_record.email, projected_role)
  on conflict (id) do update
  set
    email = excluded.email,
    role = excluded.role,
    updated_at = now();
end;
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'owner';
$$;

create or replace function public.is_owner_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('owner', 'admin');
$$;

create or replace function public.get_my_permissions()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select role_permissions.perms
      from public.role_permissions
      where role_permissions.role = coalesce(
        auth.jwt() -> 'app_metadata' ->> 'role',
        'assistant'
      )
      limit 1
    ),
    '{}'::jsonb
  );
$$;

create or replace function public.has_perm(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  role_name text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'assistant');
  permissions jsonb;
begin
  if auth.uid() is null then
    return false;
  end if;
  if role_name = 'owner' then
    return true;
  end if;

  select role_permissions.perms
  into permissions
  from public.role_permissions
  where role_permissions.role = role_name;

  return coalesce((permissions ->> p_key)::boolean, false);
end;
$$;

alter table public.profiles enable row level security;
alter table public.role_permissions enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists profiles_select_all_owner on public.profiles;
create policy profiles_select_all_owner
on public.profiles
for select
to authenticated
using (public.is_owner_or_admin());

drop policy if exists profiles_update_owner on public.profiles;

drop policy if exists role_permissions_owner_select on public.role_permissions;
create policy role_permissions_owner_select
on public.role_permissions
for select
to authenticated
using (public.is_owner_or_admin());

drop policy if exists role_permissions_owner_write on public.role_permissions;

revoke all on table public.profiles from anon;
revoke insert, update, delete on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

revoke all on table public.role_permissions from anon;
revoke insert, update, delete on table public.role_permissions from authenticated;
grant select on table public.role_permissions to authenticated;
grant select, insert, update, delete on table public.role_permissions to service_role;

create table if not exists public.app_user_security_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text null,
  pin_salt text null,
  pin_iterations integer not null default 310000
    check (pin_iterations between 100000 and 1000000),
  pin_version integer not null default 1,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz null,
  trusted_device_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.security_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  event_type text not null check (
    event_type in (
      'login_succeeded',
      'login_failed',
      'logout',
      'password_changed',
      'password_reset',
      'sessions_revoked',
      'pin_enabled',
      'pin_changed',
      'pin_disabled',
      'pin_unlock_succeeded',
      'pin_unlock_failed',
      'pin_locked',
      'receipt_viewed',
      'receipt_replaced',
      'receipt_replace_failed'
    )
  ),
  actor_ip_hash text null,
  user_agent_family text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists security_audit_events_user_created_idx
on public.security_audit_events (user_id, created_at desc);

alter table public.app_user_security_settings enable row level security;
alter table public.security_audit_events enable row level security;

revoke all on table public.app_user_security_settings from anon;
revoke all on table public.app_user_security_settings from authenticated;
revoke all on table public.security_audit_events from anon;
revoke all on table public.security_audit_events from authenticated;

grant select, insert, update, delete
on table public.app_user_security_settings
to service_role;
grant select, insert, update, delete
on table public.security_audit_events
to service_role;

comment on table public.app_user_security_settings is
  'Server-only per-user quick-unlock state. A PIN never replaces Supabase Auth.';
comment on table public.security_audit_events is
  'Server-only allowlisted security events. Secrets, tokens, signed URLs, receipt content, and raw email are forbidden.';

create or replace function public.get_my_device_unlock_state()
returns table (
  enabled boolean,
  pin_version integer,
  trusted_device_version integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    security.pin_hash is not null and security.pin_salt is not null as enabled,
    security.pin_version,
    security.trusted_device_version
  from public.app_user_security_settings as security
  where security.user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.get_my_device_unlock_state() from public;
revoke all on function public.get_my_device_unlock_state() from anon;
grant execute on function public.get_my_device_unlock_state() to authenticated;
grant execute on function public.get_my_device_unlock_state() to service_role;

update public.app_security_settings
set
  pin_hash = null,
  pin_salt = null,
  session_version = session_version + 1,
  updated_at = now(),
  updated_by = 'authenticated_owner_access_migration'
where key = 'login_pin'
  and (pin_hash is not null or pin_salt is not null);

drop policy if exists attachments_insert_all on public.attachments;
drop policy if exists attachments_update_all on public.attachments;
drop policy if exists attachments_delete_all on public.attachments;
drop policy if exists attachments_insert on public.attachments;
drop policy if exists attachments_update on public.attachments;
drop policy if exists attachments_delete on public.attachments;
drop policy if exists attachments_insert_anon_authenticated on public.attachments;
drop policy if exists attachments_update_anon_authenticated on public.attachments;
drop policy if exists attachments_delete_anon_authenticated on public.attachments;

revoke all on table public.attachments from anon;
revoke insert, update, delete on table public.attachments from anon;
grant select on table public.attachments to anon;
grant select, insert, update, delete on table public.attachments to authenticated;

create policy attachments_insert_authenticated
on public.attachments
for insert
to authenticated
with check (auth.uid() is not null);

create policy attachments_update_authenticated
on public.attachments
for update
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

create policy attachments_delete_authenticated
on public.attachments
for delete
to authenticated
using (auth.uid() is not null);

notify pgrst, 'reload schema';
