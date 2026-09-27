-- Preserve the existing server-calculated estimate values and lifecycle authority.
-- Only the authorized server may supply the pricing payload; this is not a browser RPC.
set lock_timeout = '5s';
set statement_timeout = '60s';

create or replace function public.convert_estimate_to_project_atomic(
  p_estimate_id uuid, p_project jsonb, p_actor_user_id uuid, p_actor_label text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_estimate public.estimates%rowtype;
  v_project public.projects%rowtype;
  v_organization_id uuid;
  v_field text;
begin
  select o.id into v_organization_id
  from public.organizations o
  join public.company_profile c on c.id = o.legacy_company_profile_id
  join public.organization_memberships m on m.organization_id = o.id
  join auth.users u on u.id = m.user_id
  where m.user_id = p_actor_user_id and m.status = 'active'
    and m.role in ('owner', 'admin') and not coalesce(u.is_anonymous, false)
    and u.raw_app_meta_data->>'role' in ('owner', 'admin');
  if v_organization_id is null then
    raise exception 'Company administrator authorization required' using errcode = '42501';
  end if;

  select * into v_estimate from public.estimates where id = p_estimate_id for update;
  if not found then raise exception 'Estimate not found' using errcode = 'P0002'; end if;
  select * into v_project from public.projects where source_estimate_id = p_estimate_id;
  if found then
    if v_project.organization_id is distinct from v_organization_id then
      raise exception 'Project organization mismatch' using errcode = '42501';
    end if;
    if v_estimate.status <> 'Converted' then
      raise exception 'Estimate and existing project require reconciliation' using errcode = '23514';
    end if;
  else
    if v_estimate.status <> 'Approved' then
      raise exception 'Only Approved estimates can be converted' using errcode = '23514';
    end if;
    if p_project is null or jsonb_typeof(p_project) <> 'object'
      or nullif(btrim(p_project->>'name'), '') is null then
      raise exception 'Project setup is required' using errcode = '22023';
    end if;
    foreach v_field in array array['budget','snapshotRevenue','snapshotBudgetCost'] loop
      if jsonb_typeof(p_project->v_field) is distinct from 'number' then
        raise exception 'Project pricing is incomplete' using errcode = '22023';
      end if;
    end loop;
    if jsonb_typeof(p_project->'snapshotBreakdown') is distinct from 'object' then
      raise exception 'Project cost breakdown is required' using errcode = '22023';
    end if;
    foreach v_field in array array['materials','labor','vendor','other'] loop
      if jsonb_typeof(p_project->'snapshotBreakdown'->v_field) is distinct from 'number' then
        raise exception 'Project cost breakdown is incomplete' using errcode = '22023';
      end if;
    end loop;
    insert into public.projects (
      name, status, budget, spent, customer_id, client, client_name, address,
      project_manager, start_date, end_date, notes, estimate_ref, source_estimate_id,
      snapshot_revenue, snapshot_budget_cost, snapshot_breakdown, organization_id
    ) values (
      btrim(p_project->>'name'), 'active', (p_project->>'budget')::numeric, 0,
      v_estimate.customer_id, nullif(btrim(p_project->>'client'), ''),
      nullif(btrim(p_project->>'client'), ''), nullif(btrim(p_project->>'address'), ''),
      nullif(btrim(p_project->>'projectManager'), ''),
      nullif(p_project->>'startDate', '')::date, nullif(p_project->>'endDate', '')::date,
      nullif(btrim(p_project->>'notes'), ''), nullif(btrim(p_project->>'estimateRef'), ''),
      p_estimate_id, (p_project->>'snapshotRevenue')::numeric,
      (p_project->>'snapshotBudgetCost')::numeric, p_project->'snapshotBreakdown', v_organization_id
    ) returning * into v_project;
    if not public.transition_estimate_status_with_activity(
      p_estimate_id, 'Converted', p_actor_user_id, p_actor_label, v_project.id, 'project'
    ) then
      raise exception 'Estimate conversion failed' using errcode = '23514';
    end if;
  end if;
  return jsonb_build_object(
    'projectId', v_project.id, 'sourceEstimateId', p_estimate_id,
    'sourceSnapshotId', 'estimate-' || p_estimate_id::text, 'sourceVersion', 1,
    'snapshotRevenue', v_project.snapshot_revenue,
    'snapshotBudgetCost', v_project.snapshot_budget_cost,
    'snapshotBudgetBreakdown', v_project.snapshot_breakdown
  );
end;
$$;
revoke all on function public.convert_estimate_to_project_atomic(uuid,jsonb,uuid,text)
  from public, anon, authenticated;
grant execute on function public.convert_estimate_to_project_atomic(uuid,jsonb,uuid,text)
  to service_role;
