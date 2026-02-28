-- Company profile + branding storage (single-tenant bootstrap)
create extension if not exists pgcrypto;

create table if not exists public.company_profile (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  org_name text not null default 'HH Group',
  legal_name text null,
  phone text null,
  email text null,
  website text null,
  license_number text null,
  tax_id text null,
  address1 text null,
  address2 text null,
  city text null,
  state text null,
  zip text null,
  country text null default 'US',
  invoice_footer text null,
  default_terms text null,
  notes text null,
  logo_path text null,
  logo_url text null
);

create or replace function public.set_company_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_company_profile_updated_at on public.company_profile;
create trigger trg_company_profile_updated_at
before update on public.company_profile
for each row
execute function public.set_company_profile_updated_at();

alter table public.company_profile enable row level security;

drop policy if exists "company_profile_select_all" on public.company_profile;
create policy "company_profile_select_all"
on public.company_profile
for select
to anon
using (true);

drop policy if exists "company_profile_insert_all" on public.company_profile;
create policy "company_profile_insert_all"
on public.company_profile
for insert
to anon
with check (true);

drop policy if exists "company_profile_update_all" on public.company_profile;
create policy "company_profile_update_all"
on public.company_profile
for update
to anon
using (true)
with check (true);

insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "branding_select_public" on storage.objects;
create policy "branding_select_public"
on storage.objects
for select
to public
using (bucket_id = 'branding');

drop policy if exists "branding_insert_anon" on storage.objects;
create policy "branding_insert_anon"
on storage.objects
for insert
to anon
with check (bucket_id = 'branding');

drop policy if exists "branding_update_anon" on storage.objects;
create policy "branding_update_anon"
on storage.objects
for update
to anon
using (bucket_id = 'branding')
with check (bucket_id = 'branding');

drop policy if exists "branding_delete_anon" on storage.objects;
create policy "branding_delete_anon"
on storage.objects
for delete
to anon
using (bucket_id = 'branding');

