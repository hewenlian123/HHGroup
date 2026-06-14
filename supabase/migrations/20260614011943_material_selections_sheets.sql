-- Material Selections: customer/project approval sheets.
-- Additive only: keep legacy material_selections columns and old catalog tables intact.

create table if not exists public.material_selections (
  id uuid primary key default gen_random_uuid(),
  selection_number text unique,
  customer_id uuid null references public.customers(id) on delete set null,
  project_id uuid null references public.projects(id) on delete cascade,
  title text not null,
  status text default 'draft',
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Legacy columns kept for non-destructive compatibility with older remote snapshots.
  category text null,
  material_name text null,
  description text null,
  supplier text null,
  cost text null,
  photo_url text null
);

alter table if exists public.material_selections
  add column if not exists selection_number text,
  add column if not exists customer_id uuid null references public.customers(id) on delete set null,
  add column if not exists title text,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.material_selections
  alter column status set default 'draft';

update public.material_selections
set title = coalesce(nullif(title, ''), nullif(material_name, ''), 'Material Selection')
where title is null or title = '';

update public.material_selections
set selection_number = coalesce(
  nullif(selection_number, ''),
  'MS-' || upper(substr(replace(id::text, '-', ''), 1, 8))
)
where selection_number is null or selection_number = '';

alter table if exists public.material_selections
  alter column title set not null;

create unique index if not exists material_selections_selection_number_key
  on public.material_selections (selection_number)
  where selection_number is not null;

create index if not exists material_selections_customer_id_idx
  on public.material_selections (customer_id);

create index if not exists material_selections_project_id_idx
  on public.material_selections (project_id);

create index if not exists material_selections_updated_at_idx
  on public.material_selections (updated_at desc);

drop trigger if exists trg_material_selections_updated_at
  on public.material_selections;

create trigger trg_material_selections_updated_at
  before update on public.material_selections
  for each row
  execute function public.set_updated_at();

create table if not exists public.material_selection_items (
  id uuid primary key default gen_random_uuid(),
  selection_id uuid not null references public.material_selections(id) on delete cascade,
  area_name text null,
  category text null,
  item_name text not null,
  brand text null,
  sku text null,
  size text null,
  color text null,
  finish text null,
  image_url text null,
  notes text null,
  status text not null default 'selected',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists material_selection_items_selection_id_idx
  on public.material_selection_items (selection_id);

create index if not exists material_selection_items_selection_sort_idx
  on public.material_selection_items (selection_id, sort_order, created_at);

drop trigger if exists trg_material_selection_items_updated_at
  on public.material_selection_items;

create trigger trg_material_selection_items_updated_at
  before update on public.material_selection_items
  for each row
  execute function public.set_updated_at();

alter table public.material_selections enable row level security;
alter table public.material_selection_items enable row level security;

grant select, insert, update, delete on table public.material_selections
  to anon, authenticated, service_role;

grant select, insert, update, delete on table public.material_selection_items
  to anon, authenticated, service_role;

drop policy if exists material_selections_select_all
  on public.material_selections;
create policy material_selections_select_all
  on public.material_selections
  for select
  to anon, authenticated
  using (true);

drop policy if exists material_selections_insert_all
  on public.material_selections;
create policy material_selections_insert_all
  on public.material_selections
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists material_selections_update_all
  on public.material_selections;
create policy material_selections_update_all
  on public.material_selections
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists material_selections_delete_all
  on public.material_selections;
create policy material_selections_delete_all
  on public.material_selections
  for delete
  to anon, authenticated
  using (true);

drop policy if exists material_selection_items_select_all
  on public.material_selection_items;
create policy material_selection_items_select_all
  on public.material_selection_items
  for select
  to anon, authenticated
  using (true);

drop policy if exists material_selection_items_insert_all
  on public.material_selection_items;
create policy material_selection_items_insert_all
  on public.material_selection_items
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists material_selection_items_update_all
  on public.material_selection_items;
create policy material_selection_items_update_all
  on public.material_selection_items
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists material_selection_items_delete_all
  on public.material_selection_items;
create policy material_selection_items_delete_all
  on public.material_selection_items
  for delete
  to anon, authenticated
  using (true);

notify pgrst, 'reload schema';
