-- Ensure critical module tables are readable by authenticated role (RLS-safe, idempotent).

do $$
begin
  if to_regclass('public.project_tasks') is not null then
    execute 'alter table public.project_tasks enable row level security';
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'project_tasks'
        and policyname = 'project_tasks_authenticated_select'
    ) then
      execute 'create policy project_tasks_authenticated_select on public.project_tasks for select to authenticated using (true)';
    end if;
  end if;

  if to_regclass('public.project_schedule') is not null then
    execute 'alter table public.project_schedule enable row level security';
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'project_schedule'
        and policyname = 'project_schedule_authenticated_select'
    ) then
      execute 'create policy project_schedule_authenticated_select on public.project_schedule for select to authenticated using (true)';
    end if;
  end if;

  if to_regclass('public.punch_list') is not null then
    execute 'alter table public.punch_list enable row level security';
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'punch_list'
        and policyname = 'punch_list_authenticated_select'
    ) then
      execute 'create policy punch_list_authenticated_select on public.punch_list for select to authenticated using (true)';
    end if;
  end if;

  if to_regclass('public.inspection_logs') is not null then
    execute 'alter table public.inspection_logs enable row level security';
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'inspection_logs'
        and policyname = 'inspection_logs_authenticated_select'
    ) then
      execute 'create policy inspection_logs_authenticated_select on public.inspection_logs for select to authenticated using (true)';
    end if;
  end if;

  if to_regclass('public.site_photos') is not null then
    execute 'alter table public.site_photos enable row level security';
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'site_photos'
        and policyname = 'site_photos_authenticated_select'
    ) then
      execute 'create policy site_photos_authenticated_select on public.site_photos for select to authenticated using (true)';
    end if;
  end if;

  if to_regclass('public.material_catalog') is not null then
    execute 'alter table public.material_catalog enable row level security';
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'material_catalog'
        and policyname = 'material_catalog_authenticated_select'
    ) then
      execute 'create policy material_catalog_authenticated_select on public.material_catalog for select to authenticated using (true)';
    end if;
  end if;

  if to_regclass('public.project_material_selections') is not null then
    execute 'alter table public.project_material_selections enable row level security';
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'project_material_selections'
        and policyname = 'project_material_selections_authenticated_select'
    ) then
      execute 'create policy project_material_selections_authenticated_select on public.project_material_selections for select to authenticated using (true)';
    end if;
  end if;

  if to_regclass('public.documents') is not null then
    execute 'alter table public.documents enable row level security';
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'documents'
        and policyname = 'documents_authenticated_select'
    ) then
      execute 'create policy documents_authenticated_select on public.documents for select to authenticated using (true)';
    end if;
  end if;

  if to_regclass('public.project_change_orders') is not null then
    execute 'alter table public.project_change_orders enable row level security';
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'project_change_orders'
        and policyname = 'project_change_orders_authenticated_select'
    ) then
      execute 'create policy project_change_orders_authenticated_select on public.project_change_orders for select to authenticated using (true)';
    end if;
  end if;

  if to_regclass('public.project_change_order_items') is not null then
    execute 'alter table public.project_change_order_items enable row level security';
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'project_change_order_items'
        and policyname = 'project_change_order_items_authenticated_select'
    ) then
      execute 'create policy project_change_order_items_authenticated_select on public.project_change_order_items for select to authenticated using (true)';
    end if;
  end if;

  if to_regclass('public.project_change_order_attachments') is not null then
    execute 'alter table public.project_change_order_attachments enable row level security';
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'project_change_order_attachments'
        and policyname = 'project_change_order_attachments_authenticated_select'
    ) then
      execute 'create policy project_change_order_attachments_authenticated_select on public.project_change_order_attachments for select to authenticated using (true)';
    end if;
  end if;

  if to_regclass('public.project_budget_items') is not null then
    execute 'alter table public.project_budget_items enable row level security';
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'project_budget_items'
        and policyname = 'project_budget_items_authenticated_select'
    ) then
      execute 'create policy project_budget_items_authenticated_select on public.project_budget_items for select to authenticated using (true)';
    end if;
  end if;
end $$;

