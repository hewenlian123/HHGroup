-- HH Group four-migration Production operator procedure
--
-- Operator-only and non-authorizing. Run only after the release record's
-- read-only preflight, backup evidence, owner approval, and approved window.
--
-- Invoke from any directory with PostgreSQL 17+ psql:
--   psql -X "$HH_PROD_DATABASE_URL" -f FOUR_MIGRATION_OPERATOR_PROCEDURE.sql
--
-- This procedure intentionally uses transaction-scoped advisory locks. Each
-- unit performs exactly one reviewed migration and one `(version, name)` ledger
-- record in one transaction. `\if :ERROR` explicitly rolls back and exits on
-- every failure boundary; never continue, replay, repair, renumber, or use
-- Supabase migration automation after a failure.

\set ON_ERROR_STOP off
\set ON_ERROR_ROLLBACK off
\pset pager off

\echo 'HH Group controlled four-migration rollout: operator preflight and approval are required.'

-- Step 1 — 20260811190000_financial_protected_access_contract.sql
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select pg_advisory_xact_lock(hashtext('hh:receipt-hardening:selective-ledger'));
\if :ERROR
  \warn 'STOP: step 1 could not begin or acquire the approved advisory lock; rolling back.'
  rollback;
  \quit
\endif
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'supabase_migrations'
         and table_name = 'schema_migrations'
         and column_name = 'version'
     )
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'supabase_migrations'
         and table_name = 'schema_migrations'
         and column_name = 'name'
     ) then
    raise exception 'migration ledger must expose supabase_migrations.schema_migrations(version, name)';
  end if;

  if (select count(*) from supabase_migrations.schema_migrations where version = '20260811190000') <> 0 then
    raise exception 'STOP: 20260811190000 is already recorded; do not replay or repair it';
  end if;
end
$$;
\if :ERROR
  \warn 'STOP: step 1 ledger precondition failed; rolling back.'
  rollback;
  \quit
\endif
\ir ../../../supabase/migrations/20260811190000_financial_protected_access_contract.sql
\if :ERROR
  \warn 'STOP: step 1 migration failed; rolling back without a ledger record.'
  rollback;
  \quit
\endif
insert into supabase_migrations.schema_migrations (version, name)
values ('20260811190000', 'financial_protected_access_contract');
\if :ERROR
  \warn 'STOP: step 1 ledger insert failed; rolling back the migration.'
  rollback;
  \quit
\endif
do $$
declare
  target_table text;
begin
  if (select count(*) from supabase_migrations.schema_migrations
      where version = '20260811190000' and name = 'financial_protected_access_contract') <> 1 then
    raise exception 'step 1 requires exactly one matching ledger record';
  end if;

  foreach target_table in array array[
    'invoices', 'invoice_items', 'invoice_payments', 'payments_received',
    'payment_received_attachments', 'deposits', 'ap_bills', 'ap_bill_payments',
    'subcontract_payments', 'expense_lines', 'commissions', 'commission_payments',
    'subcontractors', 'subcontracts'
  ] loop
    if not (select relrowsecurity from pg_class where oid = format('public.%I', target_table)::regclass)
       or has_table_privilege('anon', format('public.%I', target_table)::regclass, 'select, insert, update, delete')
       or not exists (
         select 1 from pg_policies
         where schemaname = 'public'
           and tablename = target_table
           and policyname = 'financial_owner_admin_' || target_table
       ) then
      raise exception 'step 1 verification failed for public.%', target_table;
    end if;
  end loop;
end
$$;
\if :ERROR
  \warn 'STOP: step 1 immediate verification failed; rolling back migration and ledger.'
  rollback;
  \quit
\endif
commit;
\if :ERROR
  \warn 'STOP: step 1 commit failed; stop and preserve evidence.'
  rollback;
  \quit
\endif
select pg_try_advisory_xact_lock(hashtext('hh:receipt-hardening:selective-ledger')) as step_1_lock_released \gset
\if :step_1_lock_released
  \echo 'Step 1 committed and transaction-scoped lock release was confirmed.'
\else
  \warn 'STOP: step 1 lock release could not be confirmed.'
  \quit
\endif

-- Step 2 — 20260811233656_project_change_orders_owner_admin_access.sql
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select pg_advisory_xact_lock(hashtext('hh:receipt-hardening:selective-ledger'));
\if :ERROR
  \warn 'STOP: step 2 could not begin or acquire the approved advisory lock; rolling back.'
  rollback;
  \quit
\endif
do $$
begin
  if (select count(*) from supabase_migrations.schema_migrations where version = '20260811233656') <> 0 then
    raise exception 'STOP: 20260811233656 is already recorded; do not replay or repair it';
  end if;
end
$$;
\if :ERROR
  \warn 'STOP: step 2 ledger precondition failed; rolling back.'
  rollback;
  \quit
\endif
\ir ../../../supabase/migrations/20260811233656_project_change_orders_owner_admin_access.sql
\if :ERROR
  \warn 'STOP: step 2 migration failed; rolling back without a ledger record.'
  rollback;
  \quit
\endif
insert into supabase_migrations.schema_migrations (version, name)
values ('20260811233656', 'project_change_orders_owner_admin_access');
\if :ERROR
  \warn 'STOP: step 2 ledger insert failed; rolling back the migration.'
  rollback;
  \quit
\endif
do $$
declare
  target_table text;
begin
  if (select count(*) from supabase_migrations.schema_migrations
      where version = '20260811233656' and name = 'project_change_orders_owner_admin_access') <> 1 then
    raise exception 'step 2 requires exactly one matching ledger record';
  end if;

  foreach target_table in array array['projects', 'project_change_orders', 'project_change_order_items'] loop
    if not (select relrowsecurity from pg_class where oid = format('public.%I', target_table)::regclass)
       or has_table_privilege('anon', format('public.%I', target_table)::regclass, 'select, insert, update, delete')
       or not exists (
         select 1 from pg_policies
         where schemaname = 'public'
           and tablename = target_table
           and policyname = 'project_change_order_owner_admin_' || target_table
       ) then
      raise exception 'step 2 verification failed for public.%', target_table;
    end if;
  end loop;

  if not has_column_privilege('anon', 'public.projects', 'id', 'select')
     or not has_column_privilege('anon', 'public.projects', 'name', 'select')
     or has_column_privilege('anon', 'public.projects', 'status', 'select')
     or not exists (
       select 1 from pg_policies
       where schemaname = 'public'
         and tablename = 'projects'
         and policyname = 'worker_receipt_options_projects_anon_select'
     ) then
    raise exception 'step 2 receipt-project option contract verification failed';
  end if;
end
$$;
\if :ERROR
  \warn 'STOP: step 2 immediate verification failed; rolling back migration and ledger.'
  rollback;
  \quit
\endif
commit;
\if :ERROR
  \warn 'STOP: step 2 commit failed; stop and preserve evidence.'
  rollback;
  \quit
\endif
select pg_try_advisory_xact_lock(hashtext('hh:receipt-hardening:selective-ledger')) as step_2_lock_released \gset
\if :step_2_lock_released
  \echo 'Step 2 committed and transaction-scoped lock release was confirmed.'
\else
  \warn 'STOP: step 2 lock release could not be confirmed.'
  \quit
\endif

-- Step 3 — 20260812103821_production_security_baseline_closure.sql
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select pg_advisory_xact_lock(hashtext('hh:receipt-hardening:selective-ledger'));
\if :ERROR
  \warn 'STOP: step 3 could not begin or acquire the approved advisory lock; rolling back.'
  rollback;
  \quit
\endif
do $$
begin
  if (select count(*) from supabase_migrations.schema_migrations where version = '20260812103821') <> 0 then
    raise exception 'STOP: 20260812103821 is already recorded; do not replay or repair it';
  end if;
end
$$;
\if :ERROR
  \warn 'STOP: step 3 ledger precondition failed; rolling back.'
  rollback;
  \quit
\endif
\ir ../../../supabase/migrations/20260812103821_production_security_baseline_closure.sql
\if :ERROR
  \warn 'STOP: step 3 migration failed; rolling back without a ledger record.'
  rollback;
  \quit
\endif
insert into supabase_migrations.schema_migrations (version, name)
values ('20260812103821', 'production_security_baseline_closure');
\if :ERROR
  \warn 'STOP: step 3 ledger insert failed; rolling back the migration.'
  rollback;
  \quit
\endif
do $$
begin
  if (select count(*) from supabase_migrations.schema_migrations
      where version = '20260812103821' and name = 'production_security_baseline_closure') <> 1 then
    raise exception 'step 3 requires exactly one matching ledger record';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.audit_logs'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.tmp_backup_worker_advances_haijun'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.labor_workers'::regclass)
     or has_table_privilege('anon', 'public.audit_logs', 'select, insert, update, delete')
     or has_table_privilege('authenticated', 'public.audit_logs', 'select, insert, update, delete')
     or has_table_privilege('service_role', 'public.audit_logs', 'select, insert, update, delete')
     or has_table_privilege('anon', 'public.tmp_backup_worker_advances_haijun', 'select, insert, update, delete')
     or has_table_privilege('authenticated', 'public.tmp_backup_worker_advances_haijun', 'select, insert, update, delete')
     or has_table_privilege('service_role', 'public.tmp_backup_worker_advances_haijun', 'select, insert, update, delete')
     or not has_table_privilege('authenticated', 'public.labor_workers', 'select')
     or has_table_privilege('authenticated', 'public.labor_workers', 'insert, update, delete')
     or not has_table_privilege('service_role', 'public.labor_workers', 'select, insert, update, delete')
     or not exists (
       select 1 from pg_policies
       where schemaname = 'public' and tablename = 'labor_workers'
         and policyname = 'labor_workers_owner_admin_select'
     )
     or to_regprocedure('public.hh_sync_worker_to_labor_workers_projection()') is null
     or not exists (
       select 1 from pg_trigger
       where tgrelid = 'public.workers'::regclass
         and tgname = 'hh_sync_worker_to_labor_workers_projection_trigger'
         and not tgisinternal
     ) then
    raise exception 'step 3 production-security-baseline verification failed';
  end if;
end
$$;
\if :ERROR
  \warn 'STOP: step 3 immediate verification failed; rolling back migration and ledger.'
  rollback;
  \quit
\endif
commit;
\if :ERROR
  \warn 'STOP: step 3 commit failed; stop and preserve evidence.'
  rollback;
  \quit
\endif
select pg_try_advisory_xact_lock(hashtext('hh:receipt-hardening:selective-ledger')) as step_3_lock_released \gset
\if :step_3_lock_released
  \echo 'Step 3 committed and transaction-scoped lock release was confirmed.'
\else
  \warn 'STOP: step 3 lock release could not be confirmed.'
  \quit
\endif

-- Step 4 — 20260813002206_final_anonymous_crud_closure.sql
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select pg_advisory_xact_lock(hashtext('hh:receipt-hardening:selective-ledger'));
\if :ERROR
  \warn 'STOP: step 4 could not begin or acquire the approved advisory lock; rolling back.'
  rollback;
  \quit
\endif
do $$
begin
  if (select count(*) from supabase_migrations.schema_migrations where version = '20260813002206') <> 0 then
    raise exception 'STOP: 20260813002206 is already recorded; do not replay or repair it';
  end if;
end
$$;
\if :ERROR
  \warn 'STOP: step 4 ledger precondition failed; rolling back.'
  rollback;
  \quit
\endif
\ir ../../../supabase/migrations/20260813002206_final_anonymous_crud_closure.sql
\if :ERROR
  \warn 'STOP: step 4 migration failed; rolling back without a ledger record.'
  rollback;
  \quit
\endif
insert into supabase_migrations.schema_migrations (version, name)
values ('20260813002206', 'final_anonymous_crud_closure');
\if :ERROR
  \warn 'STOP: step 4 ledger insert failed; rolling back the migration.'
  rollback;
  \quit
\endif
do $$
declare
  target_table text;
begin
  if (select count(*) from supabase_migrations.schema_migrations
      where version = '20260813002206' and name = 'final_anonymous_crud_closure') <> 1 then
    raise exception 'step 4 requires exactly one matching ledger record';
  end if;

  foreach target_table in array array['cost_allocations', 'material_selections', 'material_selection_items'] loop
    if not (select relrowsecurity from pg_class where oid = format('public.%I', target_table)::regclass)
       or exists (
         select 1 from pg_policies
         where schemaname = 'public' and tablename = target_table
       ) then
      raise exception 'step 4 policy/RLS verification failed for public.%', target_table;
    end if;
  end loop;

  if has_table_privilege('anon', 'public.cost_allocations', 'select, insert, update, delete')
     or has_table_privilege('authenticated', 'public.cost_allocations', 'select, insert, update, delete')
     or has_table_privilege('service_role', 'public.cost_allocations', 'select, insert, update, delete')
     or has_table_privilege('anon', 'public.material_selections', 'select, insert, update, delete')
     or has_table_privilege('authenticated', 'public.material_selections', 'select, insert, update, delete')
     or not has_table_privilege('service_role', 'public.material_selections', 'select, insert, update, delete')
     or has_table_privilege('anon', 'public.material_selection_items', 'select, insert, update, delete')
     or has_table_privilege('authenticated', 'public.material_selection_items', 'select, insert, update, delete')
     or not has_table_privilege('service_role', 'public.material_selection_items', 'select, insert, update, delete') then
    raise exception 'step 4 direct Data API grant verification failed';
  end if;
end
$$;
\if :ERROR
  \warn 'STOP: step 4 immediate verification failed; rolling back migration and ledger.'
  rollback;
  \quit
\endif
commit;
\if :ERROR
  \warn 'STOP: step 4 commit failed; stop and preserve evidence.'
  rollback;
  \quit
\endif
select pg_try_advisory_xact_lock(hashtext('hh:receipt-hardening:selective-ledger')) as step_4_lock_released \gset
\if :step_4_lock_released
  \echo 'Step 4 committed and transaction-scoped lock release was confirmed.'
\else
  \warn 'STOP: step 4 lock release could not be confirmed.'
  \quit
\endif

\echo 'All four migration-and-ledger transactions committed. Run the recorded post-window evidence and smoke separately.'
