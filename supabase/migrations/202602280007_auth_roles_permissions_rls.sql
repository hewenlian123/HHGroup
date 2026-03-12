-- Auth + Roles + Simple Permissions (Owner/Admin/Assistant)
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text null,
  role text not null default 'assistant' check (role in ('owner', 'admin', 'assistant')),
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
  (
    'owner',
    jsonb_build_object(
      'projects.view', true, 'projects.create', true, 'projects.update', true, 'projects.delete', true,
      'workers.view', true, 'workers.manage', true, 'workers.delete', true,
      'timesheets.submit', true, 'timesheets.approve', true,
      'finance.view', true, 'finance.manage', true, 'finance.pay', true,
      'settings.view', true, 'settings.company_edit', true, 'settings.permissions_manage', true
    )
  ),
  (
    'admin',
    jsonb_build_object(
      'projects.view', true, 'projects.create', true, 'projects.update', true, 'projects.delete', false,
      'workers.view', true, 'workers.manage', true, 'workers.delete', false,
      'timesheets.submit', true, 'timesheets.approve', true,
      'finance.view', false, 'finance.manage', false, 'finance.pay', false,
      'settings.view', true, 'settings.company_edit', false, 'settings.permissions_manage', false
    )
  ),
  (
    'assistant',
    jsonb_build_object(
      'projects.view', true, 'projects.create', true, 'projects.update', true, 'projects.delete', false,
      'workers.view', true, 'workers.manage', true, 'workers.delete', false,
      'timesheets.submit', true, 'timesheets.approve', false,
      'finance.view', false, 'finance.manage', false, 'finance.pay', false,
      'settings.view', false, 'settings.company_edit', false, 'settings.permissions_manage', false
    )
  )
on conflict (role) do update set perms = excluded.perms;

create or replace function public.upsert_my_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  user_email text;
  existing_role text;
  assigned_role text;
begin
  uid := auth.uid();
  if uid is null then
    return;
  end if;

  select email into user_email from auth.users where id = uid;
  select role into existing_role from public.profiles where id = uid;

  if existing_role is not null then
    update public.profiles
    set email = user_email
    where id = uid;
    return;
  end if;

  if not exists (select 1 from public.profiles) then
    assigned_role := 'owner';
  else
    assigned_role := 'assistant';
  end if;

  insert into public.profiles (id, email, role)
  values (uid, user_email, assigned_role)
  on conflict (id) do update
  set email = excluded.email;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_role text := 'assistant';
begin
  if not exists (select 1 from public.profiles) then
    assigned_role := 'owner';
  end if;

  insert into public.profiles (id, email, role)
  values (new.id, new.email, assigned_role)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'owner'
  );
$$;

create or replace function public.get_my_permissions()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r text;
  p jsonb;
begin
  select role into r from public.profiles where id = auth.uid();
  if r = 'owner' then
    return (
      select perms
      from public.role_permissions
      where role = 'owner'
      limit 1
    );
  end if;
  select perms into p from public.role_permissions where role = coalesce(r, 'assistant');
  return coalesce(p, '{}'::jsonb);
end;
$$;

create or replace function public.has_perm(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  role_name text;
  perms jsonb;
begin
  if auth.uid() is null then
    return false;
  end if;

  select role into role_name
  from public.profiles
  where id = auth.uid();

  if role_name = 'owner' then
    return true;
  end if;

  select rp.perms into perms
  from public.role_permissions rp
  where rp.role = coalesce(role_name, 'assistant');

  return coalesce((perms ->> p_key)::boolean, false);
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
using (public.is_owner());

drop policy if exists profiles_update_owner on public.profiles;
create policy profiles_update_owner
on public.profiles
for update
to authenticated
using (public.is_owner())
with check (public.is_owner());

drop policy if exists role_permissions_owner_select on public.role_permissions;
create policy role_permissions_owner_select
on public.role_permissions
for select
to authenticated
using (public.is_owner());

drop policy if exists role_permissions_owner_write on public.role_permissions;
create policy role_permissions_owner_write
on public.role_permissions
for all
to authenticated
using (public.is_owner())
with check (public.is_owner());

create or replace function public.reset_table_policies(target_table text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = target_table
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, target_table);
  end loop;
end;
$$;

create or replace function public.apply_perm_policies(
  target_table text,
  select_expr text,
  insert_expr text,
  update_expr text,
  delete_expr text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass(format('public.%I', target_table)) is null then
    return;
  end if;

  execute format('alter table public.%I enable row level security', target_table);
  perform public.reset_table_policies(target_table);

  execute format(
    'create policy %I on public.%I for select to authenticated using (%s)',
    target_table || '_perm_select',
    target_table,
    select_expr
  );
  execute format(
    'create policy %I on public.%I for insert to authenticated with check (%s)',
    target_table || '_perm_insert',
    target_table,
    insert_expr
  );
  execute format(
    'create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
    target_table || '_perm_update',
    target_table,
    update_expr,
    update_expr
  );
  execute format(
    'create policy %I on public.%I for delete to authenticated using (%s)',
    target_table || '_perm_delete',
    target_table,
    delete_expr
  );
end;
$$;

-- Projects module
select public.apply_perm_policies('projects', 'public.has_perm(''projects.view'')', 'public.has_perm(''projects.create'')', 'public.has_perm(''projects.update'')', 'public.has_perm(''projects.delete'')');
select public.apply_perm_policies('customers', 'public.has_perm(''projects.view'')', 'public.has_perm(''projects.create'')', 'public.has_perm(''projects.update'')', 'public.has_perm(''projects.delete'')');

-- Workers module
select public.apply_perm_policies('workers', 'public.has_perm(''workers.view'')', 'public.has_perm(''workers.manage'')', 'public.has_perm(''workers.manage'')', 'public.has_perm(''workers.delete'')');
select public.apply_perm_policies('subcontractors', 'public.has_perm(''workers.view'')', 'public.has_perm(''workers.manage'')', 'public.has_perm(''workers.manage'')', 'public.has_perm(''workers.delete'')');
select public.apply_perm_policies('project_subcontractors', 'public.has_perm(''workers.view'')', 'public.has_perm(''workers.manage'')', 'public.has_perm(''workers.manage'')', 'public.has_perm(''workers.delete'')');

-- Timesheets module (only if table names exist)
select public.apply_perm_policies('timesheets', 'public.has_perm(''timesheets.submit'') or public.has_perm(''timesheets.approve'')', 'public.has_perm(''timesheets.submit'')', 'public.has_perm(''timesheets.submit'')', 'public.has_perm(''timesheets.approve'')');
select public.apply_perm_policies('labor_entries', 'public.has_perm(''timesheets.submit'') or public.has_perm(''timesheets.approve'')', 'public.has_perm(''timesheets.submit'')', 'public.has_perm(''timesheets.submit'')', 'public.has_perm(''timesheets.approve'')');

-- Finance module
select public.apply_perm_policies('bills', 'public.has_perm(''finance.view'')', 'public.has_perm(''finance.manage'')', 'public.has_perm(''finance.manage'')', 'public.has_perm(''finance.manage'')');
select public.apply_perm_policies('bill_items', 'public.has_perm(''finance.view'')', 'public.has_perm(''finance.manage'')', 'public.has_perm(''finance.manage'')', 'public.has_perm(''finance.manage'')');
select public.apply_perm_policies('bill_payments', 'public.has_perm(''finance.view'')', 'public.has_perm(''finance.pay'')', 'public.has_perm(''finance.pay'')', 'public.has_perm(''finance.pay'')');
select public.apply_perm_policies('invoices', 'public.has_perm(''finance.view'')', 'public.has_perm(''finance.manage'')', 'public.has_perm(''finance.manage'')', 'public.has_perm(''finance.manage'')');
select public.apply_perm_policies('expenses', 'public.has_perm(''finance.view'')', 'public.has_perm(''finance.manage'')', 'public.has_perm(''finance.manage'')', 'public.has_perm(''finance.manage'')');
select public.apply_perm_policies('vendors', 'public.has_perm(''finance.view'')', 'public.has_perm(''finance.manage'')', 'public.has_perm(''finance.manage'')', 'public.has_perm(''finance.manage'')');
select public.apply_perm_policies('categories', 'public.has_perm(''finance.view'')', 'public.has_perm(''finance.manage'')', 'public.has_perm(''finance.manage'')', 'public.has_perm(''finance.manage'')');
select public.apply_perm_policies('payment_methods', 'public.has_perm(''finance.view'')', 'public.has_perm(''finance.manage'')', 'public.has_perm(''finance.manage'')', 'public.has_perm(''finance.manage'')');

-- Settings module
select public.apply_perm_policies('company_profile', 'public.has_perm(''settings.view'')', 'public.has_perm(''settings.company_edit'')', 'public.has_perm(''settings.company_edit'')', 'public.has_perm(''settings.company_edit'')');

-- Local attachments metadata table
select public.apply_perm_policies('attachments', 'public.has_perm(''finance.view'') or public.has_perm(''workers.view'')', 'public.has_perm(''finance.manage'') or public.has_perm(''workers.manage'')', 'public.has_perm(''finance.manage'') or public.has_perm(''workers.manage'')', 'public.has_perm(''finance.manage'') or public.has_perm(''workers.manage'')');

-- Storage policy refresh for attachments + branding
drop policy if exists attachments_bucket_select_all on storage.objects;
drop policy if exists attachments_bucket_insert_all on storage.objects;
drop policy if exists attachments_bucket_update_all on storage.objects;
drop policy if exists attachments_bucket_delete_all on storage.objects;

create policy attachments_bucket_select_auth
on storage.objects
for select
to authenticated
using (
  bucket_id = 'attachments'
  and (public.has_perm('finance.view') or public.has_perm('workers.view'))
);

create policy attachments_bucket_insert_auth
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'attachments'
  and (public.has_perm('finance.manage') or public.has_perm('workers.manage'))
);

create policy attachments_bucket_update_auth
on storage.objects
for update
to authenticated
using (
  bucket_id = 'attachments'
  and (public.has_perm('finance.manage') or public.has_perm('workers.manage'))
)
with check (
  bucket_id = 'attachments'
  and (public.has_perm('finance.manage') or public.has_perm('workers.manage'))
);

create policy attachments_bucket_delete_auth
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'attachments'
  and (public.has_perm('finance.manage') or public.has_perm('workers.manage'))
);

drop policy if exists branding_insert_anon on storage.objects;
drop policy if exists branding_update_anon on storage.objects;
drop policy if exists branding_delete_anon on storage.objects;

create policy branding_insert_auth
on storage.objects
for insert
to authenticated
with check (bucket_id = 'branding' and public.has_perm('settings.company_edit'));

create policy branding_update_auth
on storage.objects
for update
to authenticated
using (bucket_id = 'branding' and public.has_perm('settings.company_edit'))
with check (bucket_id = 'branding' and public.has_perm('settings.company_edit'));

create policy branding_delete_auth
on storage.objects
for delete
to authenticated
using (bucket_id = 'branding' and public.has_perm('settings.company_edit'));
