-- App expects public.projects.client_name (see projects-db.ts COLS) alongside legacy `client`.
-- Safe to re-run.

alter table public.projects add column if not exists client_name text;

update public.projects p
set client_name = btrim(p.client::text)
where (p.client_name is null or btrim(p.client_name) = '')
  and p.client is not null
  and btrim(p.client::text) <> '';

comment on column public.projects.client_name is 'Display/client name mirror; keep in sync with client where used.';
