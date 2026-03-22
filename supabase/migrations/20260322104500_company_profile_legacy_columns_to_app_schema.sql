-- Align legacy company_profile shapes (e.g. company_name, address_line1) with the app schema (org_name, address1).
-- Safe to re-run: each step is conditional.

do $body$
begin
  if to_regclass('public.company_profile') is null then
    raise notice 'company_profile: table missing, skip legacy column alignment';
    return;
  end if;

  -- company_name → org_name
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'company_profile' and column_name = 'company_name'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'company_profile' and column_name = 'org_name'
  ) then
    execute 'alter table public.company_profile rename column company_name to org_name';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'company_profile' and column_name = 'address_line1'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'company_profile' and column_name = 'address1'
  ) then
    execute 'alter table public.company_profile rename column address_line1 to address1';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'company_profile' and column_name = 'address_line2'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'company_profile' and column_name = 'address2'
  ) then
    execute 'alter table public.company_profile rename column address_line2 to address2';
  end if;
end;
$body$;

alter table public.company_profile add column if not exists org_name text;
alter table public.company_profile add column if not exists address1 text;
alter table public.company_profile add column if not exists address2 text;
alter table public.company_profile add column if not exists default_tax_pct numeric;
alter table public.company_profile add column if not exists invoice_footer text;
alter table public.company_profile add column if not exists default_terms text;
alter table public.company_profile add column if not exists notes text;
alter table public.company_profile add column if not exists logo_path text;

update public.company_profile
set org_name = 'HH Group'
where org_name is null or btrim(org_name) = '';

alter table public.company_profile alter column org_name set default 'HH Group';

do $body$
begin
  if exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'company_profile' and c.column_name = 'org_name'
  ) and not exists (
    select 1 from public.company_profile where org_name is null
  ) then
    execute 'alter table public.company_profile alter column org_name set not null';
  end if;
exception
  when others then
    raise notice 'company_profile org_name set not null skipped: %', sqlerrm;
end;
$body$;
