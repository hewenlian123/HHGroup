-- Optional company name on customer records (project/contractor workflows).
alter table if exists public.customers
  add column if not exists company_name text;
