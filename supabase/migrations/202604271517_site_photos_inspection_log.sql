-- Site photos: one row per photo, linked to project.
create table if not exists public.site_photos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  photo_url text not null,
  description text null,
  tags text null,
  uploaded_by text null
);

create index if not exists idx_site_photos_project_id on public.site_photos (project_id);
create index if not exists idx_site_photos_created_at on public.site_photos (created_at desc);

alter table public.site_photos enable row level security;
drop policy if exists site_photos_select_all on public.site_photos;
create policy site_photos_select_all on public.site_photos for select to anon using (true);
drop policy if exists site_photos_insert_all on public.site_photos;
create policy site_photos_insert_all on public.site_photos for insert to anon with check (true);
drop policy if exists site_photos_update_all on public.site_photos;
create policy site_photos_update_all on public.site_photos for update to anon using (true) with check (true);
drop policy if exists site_photos_delete_all on public.site_photos;
create policy site_photos_delete_all on public.site_photos for delete to anon using (true);

-- Inspection log: one row per inspection.
create table if not exists public.inspection_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  inspection_type text not null default '',
  inspector text null,
  inspection_date date null,
  status text not null default 'pending',
  notes text null
);

create index if not exists idx_inspection_log_project_id on public.inspection_log (project_id);
create index if not exists idx_inspection_log_inspection_date on public.inspection_log (inspection_date desc);
create index if not exists idx_inspection_log_status on public.inspection_log (status);

alter table public.inspection_log enable row level security;
drop policy if exists inspection_log_select_all on public.inspection_log;
create policy inspection_log_select_all on public.inspection_log for select to anon using (true);
drop policy if exists inspection_log_insert_all on public.inspection_log;
create policy inspection_log_insert_all on public.inspection_log for insert to anon with check (true);
drop policy if exists inspection_log_update_all on public.inspection_log;
create policy inspection_log_update_all on public.inspection_log for update to anon using (true) with check (true);
drop policy if exists inspection_log_delete_all on public.inspection_log;
create policy inspection_log_delete_all on public.inspection_log for delete to anon using (true);
