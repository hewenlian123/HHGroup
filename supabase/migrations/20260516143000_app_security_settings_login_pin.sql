-- Phase 2.5 follow-up: store the HH Group app unlock PIN hash in Supabase.
-- The row intentionally starts without a PIN; initialize it through a server-only Settings flow.

create extension if not exists "pgcrypto";

create table if not exists public.app_security_settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  pin_hash text null,
  pin_salt text null,
  session_version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text null
);

insert into public.app_security_settings (key)
values ('login_pin')
on conflict (key) do nothing;

alter table public.app_security_settings enable row level security;

revoke all on table public.app_security_settings from anon;
revoke all on table public.app_security_settings from authenticated;

grant select, insert, update, delete on table public.app_security_settings to service_role;

comment on table public.app_security_settings is
  'Server-managed security settings for internal app access. PIN hash/salt are never exposed to browser clients.';
comment on column public.app_security_settings.pin_hash is
  'PBKDF2-SHA256 hash for the 4-digit app unlock PIN; server/service role only.';
comment on column public.app_security_settings.pin_salt is
  'Base64url PBKDF2 salt for the 4-digit app unlock PIN; server/service role only.';
comment on column public.app_security_settings.session_version is
  'Incremented on PIN changes to invalidate existing signed PIN session cookies.';
