-- Material catalog: standard materials library.
create table if not exists public.material_catalog (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  category text not null default '',
  material_name text not null default '',
  supplier text null,
  cost numeric(12,2) null,
  photo_url text null,
  description text null
);

create index if not exists idx_material_catalog_category on public.material_catalog (category);
create index if not exists idx_material_catalog_name on public.material_catalog (material_name);

alter table public.material_catalog enable row level security;
drop policy if exists material_catalog_select_all on public.material_catalog;
create policy material_catalog_select_all on public.material_catalog for select to anon using (true);
drop policy if exists material_catalog_insert_all on public.material_catalog;
create policy material_catalog_insert_all on public.material_catalog for insert to anon with check (true);
drop policy if exists material_catalog_update_all on public.material_catalog;
create policy material_catalog_update_all on public.material_catalog for update to anon using (true) with check (true);
drop policy if exists material_catalog_delete_all on public.material_catalog;
create policy material_catalog_delete_all on public.material_catalog for delete to anon using (true);

-- Project material selections: items selected per project.
create table if not exists public.project_material_selections (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid not null references public.projects(id) on delete cascade,
  item text not null default '',
  category text not null default '',
  material_id uuid null references public.material_catalog(id) on delete set null,
  material_name text not null default '',
  supplier text null,
  status text not null default 'Pending',
  notes text null
);

create index if not exists idx_project_material_selections_project_id on public.project_material_selections (project_id);
create index if not exists idx_project_material_selections_status on public.project_material_selections (status);

alter table public.project_material_selections enable row level security;
drop policy if exists project_material_selections_select_all on public.project_material_selections;
create policy project_material_selections_select_all on public.project_material_selections for select to anon using (true);
drop policy if exists project_material_selections_insert_all on public.project_material_selections;
create policy project_material_selections_insert_all on public.project_material_selections for insert to anon with check (true);
drop policy if exists project_material_selections_update_all on public.project_material_selections;
create policy project_material_selections_update_all on public.project_material_selections for update to anon using (true) with check (true);
drop policy if exists project_material_selections_delete_all on public.project_material_selections;
create policy project_material_selections_delete_all on public.project_material_selections for delete to anon using (true);
