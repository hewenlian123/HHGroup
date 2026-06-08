create table if not exists public.estimate_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  category text not null default 'General',
  default_tax_rate numeric null,
  default_terms text null,
  template_data jsonb not null default '{}'::jsonb,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.estimate_templates enable row level security;

create index if not exists estimate_templates_active_name_idx
  on public.estimate_templates (is_archived, name);

create index if not exists estimate_templates_category_idx
  on public.estimate_templates (category);
