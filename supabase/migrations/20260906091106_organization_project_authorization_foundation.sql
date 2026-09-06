-- Organization/project authorization foundation. Local verification only; no deployment.
-- Existing company_profile remains the single-company branding/settings authority.
-- organizations is an authorization identity, not a second company settings system.
set lock_timeout = '5s';
set statement_timeout = '120s';

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Organization',
  legacy_company_profile_id uuid unique references public.company_profile(id) on delete restrict
);
create table if not exists public.organization_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'assistant')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  primary key (organization_id, user_id)
);
create index if not exists organization_memberships_user_idx
  on public.organization_memberships(user_id, organization_id) where status = 'active';
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
revoke all on public.organizations, public.organization_memberships from public, anon, authenticated;
grant select on public.organizations, public.organization_memberships to authenticated;
-- Membership provisioning is a trusted database/control-plane operation, never a client write.

create or replace function private.is_org_member(org_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.organization_memberships m
    join auth.users u on u.id = m.user_id
    where m.organization_id = org_id and m.user_id = auth.uid()
      and m.status = 'active' and not coalesce(u.is_anonymous, false)
  );
$$;
create or replace function private.is_org_admin(org_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_org_member(org_id) and exists (
    select 1 from public.organization_memberships m
    where m.organization_id = org_id and m.user_id = auth.uid()
      and m.role in ('owner', 'admin') and m.status = 'active'
  );
$$;
create or replace function private.current_organization_id()
returns uuid language sql stable security definer set search_path = '' as $$
  -- Attribute old internal/seed inserts to the verified legacy company only.
  -- This default grants NO access: authenticated/anon requests still pass RLS.
  -- A signed-in user with zero/multiple memberships must provide a validated org.
  select case when count(*) = 1 then (array_agg(o.id))[1] else null end
  from public.organizations o
  where case when auth.uid() is null
    then o.legacy_company_profile_id is not null
    else private.is_org_member(o.id) end;
$$;

alter table public.projects add column if not exists organization_id uuid
  references public.organizations(id) on delete restrict;
alter table public.material_catalog add column if not exists organization_id uuid
  references public.organizations(id) on delete restrict;
alter table public.documents add column if not exists organization_id uuid
  references public.organizations(id) on delete restrict;
alter table public.material_selections add column if not exists organization_id uuid
  references public.organizations(id) on delete restrict;

-- One-time, evidence-based backfill. Replay never reactivates a revoked member.
-- A singleton company + explicit trusted owner/admin was the old authorization model.
-- Default assistant profiles, user_metadata, email, workers and creators are not evidence.
do $$
declare legacy_id uuid; first_bootstrap boolean;
begin
  if (select count(*) from public.company_profile) = 1 then
    select id into legacy_id from public.company_profile;
    select not exists(select 1 from public.organizations where id = legacy_id)
      into first_bootstrap;
    insert into public.organizations(id, name, legacy_company_profile_id)
      select id, org_name, id from public.company_profile on conflict do nothing;
    if first_bootstrap then
      insert into public.organization_memberships(organization_id,user_id,role,status)
      select legacy_id, id, raw_app_meta_data->>'role', 'active' from auth.users
      where raw_app_meta_data->>'role' in ('owner','admin')
        and not coalesce(is_anonymous,false)
      on conflict do nothing;
      update public.projects set organization_id = legacy_id where organization_id is null;
      update public.material_catalog set organization_id = legacy_id where organization_id is null;
      update public.documents d set organization_id = coalesce(
        (select p.organization_id from public.projects p where p.id = d.project_id),
        case when d.project_id is null then legacy_id end)
      where organization_id is null;
      update public.material_selections s set organization_id = coalesce(
        (select p.organization_id from public.projects p where p.id = s.project_id),
        case when s.project_id is null then legacy_id end)
      where organization_id is null;
    end if;
  else
    raise notice 'Authorization backfill unresolved: company_profile is not a singleton; map organizations, users and resources explicitly.';
  end if;
end $$;

alter table public.projects alter column organization_id set default private.current_organization_id();
alter table public.material_catalog alter column organization_id set default private.current_organization_id();
alter table public.documents alter column organization_id set default private.current_organization_id();
alter table public.material_selections alter column organization_id set default private.current_organization_id();
create index if not exists projects_organization_idx on public.projects(organization_id);
create index if not exists material_catalog_organization_idx on public.material_catalog(organization_id);
create index if not exists documents_organization_idx on public.documents(organization_id);
create index if not exists material_selections_organization_idx on public.material_selections(organization_id);

create or replace function private.can_access_project(project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.projects p where p.id = project_id
      and private.is_org_member(p.organization_id)
  );
$$;
create or replace function private.can_manage_project(project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.projects p where p.id = project_id
      and private.is_org_admin(p.organization_id)
  );
$$;

-- Keep tenant attribution stable even when a user belongs to two organizations.
-- Nullable columns retain unmapped old rows without inventing ownership; new writes fail closed.
create or replace function private.validate_resource_organization()
returns trigger language plpgsql security definer set search_path = '' as $$
declare project_org uuid;
begin
  if new.organization_id is null then
    raise exception 'Organization mapping required' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.organization_id is not null
     and new.organization_id is distinct from old.organization_id then
    raise exception 'Organization reassignment is not permitted' using errcode = '23514';
  end if;
  if tg_table_name in ('documents','material_selections') then
    if new.project_id is not null then
      select p.organization_id into project_org from public.projects p where p.id = new.project_id;
      if project_org is distinct from new.organization_id then
        raise exception 'Resource and project organizations must match' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['projects','material_catalog','documents','material_selections'] loop
    execute format('drop trigger if exists authorization_resource_organization on public.%I',t);
    execute format('create trigger authorization_resource_organization before insert or update on public.%I for each row execute function private.validate_resource_organization()',t);
  end loop;
end $$;

-- Avoid accepting a catalog ID from another tenant, including a user who belongs to both.
create or replace function private.material_matches_project(material_id uuid, project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_access_project(project_id) and (material_id is null or exists (
    select 1 from public.material_catalog m join public.projects p
      on p.organization_id = m.organization_id
    where m.id = material_id and p.id = project_id
  ));
$$;

-- Parent-only resources also retain their original organization when an actor manages both.
create or replace function private.validate_resource_parent_organization()
returns trigger language plpgsql security definer set search_path = '' as $$
declare old_org uuid; new_org uuid;
begin
  if tg_table_name = 'material_selection_items' then
    if new.selection_id is not distinct from old.selection_id then return new; end if;
    select organization_id into old_org from public.material_selections where id = old.selection_id;
    select organization_id into new_org from public.material_selections where id = new.selection_id;
  else
    if new.project_id is not distinct from old.project_id then return new; end if;
    select organization_id into old_org from public.projects where id = old.project_id;
    select organization_id into new_org from public.projects where id = new.project_id;
  end if;
  if old_org is distinct from new_org then
    raise exception 'Resource cannot move between organizations' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.validate_resource_parent_organization() from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['material_selection_items','project_material_selections',
    'project_tasks','project_schedule','punch_list','inspection_logs','inspection_log',
    'site_photos','activity_logs'] loop
    execute format('drop trigger if exists authorization_parent_organization on public.%I',t);
    execute format('create trigger authorization_parent_organization before update on public.%I for each row execute function private.validate_resource_parent_organization()',t);
  end loop;
end $$;

-- Future attachments layout: organizations/<org>/projects/<project>/documents/<resource>/<name>.
-- Exact metadata + org + project relationships authorize reads, never the filename.
-- No Storage grant/policy is opened in this foundation task.
create or replace function private.can_read_project_document_object(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.documents d join public.projects p on p.id = d.project_id
    where d.file_path = object_name and d.organization_id = p.organization_id
      and private.can_access_project(p.id)
      and split_part(object_name,'/',1) = 'organizations'
      and split_part(object_name,'/',2) = d.organization_id::text
      and split_part(object_name,'/',3) = 'projects'
      and split_part(object_name,'/',4) = p.id::text
      and split_part(object_name,'/',5) = 'documents'
      and split_part(object_name,'/',6) = d.id::text
      and split_part(object_name,'/',7) <> ''
      and array_length(string_to_array(object_name,'/'),1) = 7
  );
$$;

revoke all on function private.is_org_member(uuid), private.is_org_admin(uuid),
  private.current_organization_id(), private.can_access_project(uuid),
  private.can_manage_project(uuid), private.material_matches_project(uuid,uuid),
  private.can_read_project_document_object(text), private.validate_resource_organization()
from public, anon, authenticated;
grant execute on function private.is_org_member(uuid), private.is_org_admin(uuid),
  private.current_organization_id(), private.can_access_project(uuid),
  private.can_manage_project(uuid), private.material_matches_project(uuid,uuid),
  private.can_read_project_document_object(text) to authenticated;
-- Existing privileged seed/server inserts retain their attribution default only.
grant usage on schema private to service_role;
grant execute on function private.current_organization_id() to service_role;

drop policy if exists organizations_member_read on public.organizations;
create policy organizations_member_read on public.organizations for select to authenticated
  using (private.is_org_member(id));
drop policy if exists organization_memberships_self_read on public.organization_memberships;
create policy organization_memberships_self_read on public.organization_memberships for select to authenticated
  using (user_id = (select auth.uid()) and private.is_org_member(organization_id));

-- Replace permissive legacy policies only on the scoped operations/material/document tables.
-- Never change finance, labor, contact permissions or existing global role helpers here.
do $$
declare t text; policy_record record; read_rule text; write_rule text;
begin
  foreach t in array array[
    'projects','material_catalog','documents','material_selections','material_selection_items',
    'project_material_selections','project_tasks','project_schedule','punch_list',
    'inspection_logs','inspection_log','site_photos','activity_logs'
  ] loop
    if to_regclass(format('public.%I',t)) is null then
      raise exception 'Authorization prerequisite missing: public.%',t;
    end if;
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select, insert, update, delete on public.%I to authenticated',t);
    for policy_record in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I',policy_record.policyname,t);
    end loop;
    if t in ('projects','material_catalog','documents','material_selections') then
      read_rule := 'private.is_org_member(organization_id)';
      write_rule := 'private.is_org_admin(organization_id)';
    elsif t = 'material_selection_items' then
      read_rule := 'exists (select 1 from public.material_selections s where s.id = selection_id and private.is_org_member(s.organization_id))';
      write_rule := 'exists (select 1 from public.material_selections s where s.id = selection_id and private.is_org_admin(s.organization_id))';
    else
      read_rule := 'private.can_access_project(project_id)';
      write_rule := 'private.can_manage_project(project_id)';
    end if;
    if t = 'project_material_selections' then
      read_rule := read_rule || ' and private.material_matches_project(material_id, project_id)';
      write_rule := write_rule || ' and private.material_matches_project(material_id, project_id)';
    end if;
    execute format('create policy organization_read on public.%I for select to authenticated using (%s)',t,read_rule);
    execute format('create policy organization_insert on public.%I for insert to authenticated with check (%s)',t,write_rule);
    execute format('create policy organization_update on public.%I for update to authenticated using (%s) with check (%s)',t,write_rule,write_rule);
    execute format('create policy organization_delete on public.%I for delete to authenticated using (%s)',t,write_rule);
  end loop;
end $$;

-- Closeout keeps its existing operation permission and grant restrictions, with an added boundary.
do $$
declare t text; rule text;
begin
  foreach t in array array['final_punch_lists','final_punch_list_items','completion_certificates','warranties'] loop
    rule := case when t = 'final_punch_list_items'
      then 'exists (select 1 from public.final_punch_lists p where p.id = punch_list_id and private.can_access_project(p.project_id))'
      else 'private.can_access_project(project_id)' end;
    execute format('revoke all on public.%I from public, anon',t);
    execute format('drop policy if exists organization_boundary on public.%I',t);
    execute format('create policy organization_boundary on public.%I as restrictive for all to authenticated using (%s) with check (%s)',t,rule,rule);
  end loop;
end $$;
notify pgrst, 'reload schema';
