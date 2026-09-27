-- HH Group step-11 Production preflight (read-only).
--
-- This query exposes catalog facts and aggregate violation counts only. It does
-- not return business rows and cannot authorize or apply a migration. Run the
-- complete file against the exact linked target and preserve every result.

begin;
set transaction read only;

with required_versions(version) as (
  values
    ('20260830014500'),
    ('20260830014501'),
    ('20260830092709'),
    ('20260830092716'),
    ('20260830102523'),
    ('20260830120000'),
    ('20260830192501'),
    ('20260830201812'),
    ('20260830203159'),
    ('20260830204500')
)
select
  required.version,
  count(history.version) as recorded_count
from required_versions as required
left join supabase_migrations.schema_migrations as history
  on history.version = required.version
group by required.version
order by required.version;

select
  count(*) filter (where version = '20260901042341') as step_11_recorded_count,
  max(version) as latest_recorded_version
from supabase_migrations.schema_migrations;

with required_tables(table_name) as (
  values
    ('estimates'),
    ('estimate_payment_schedule_items'),
    ('invoices'),
    ('estimate_activity_events')
)
select
  required.table_name,
  pg_catalog.to_regclass('public.' || required.table_name) is not null as exists
from required_tables as required
order by required.table_name;

with required_functions(
  signature,
  expected_anon_execute,
  expected_authenticated_execute,
  expected_service_role_execute
) as (
  values
    ('public.create_invoice_atomic(text,jsonb,jsonb)', false, true, true),
    (
      'public.link_estimate_milestone_invoice_with_activity(uuid,uuid,uuid,uuid,text)',
      false,
      false,
      true
    )
), resolved as (
  select
    required.*,
    pg_catalog.to_regprocedure(required.signature) as function_oid
  from required_functions as required
), observed as (
  select
    resolved.*,
    procedure.prosecdef,
    case when resolved.function_oid is null then null else
      pg_catalog.has_function_privilege('anon', resolved.function_oid, 'EXECUTE')
    end as anon_execute,
    case when resolved.function_oid is null then null else
      pg_catalog.has_function_privilege('authenticated', resolved.function_oid, 'EXECUTE')
    end as authenticated_execute,
    case when resolved.function_oid is null then null else
      pg_catalog.has_function_privilege('service_role', resolved.function_oid, 'EXECUTE')
    end as service_role_execute
  from resolved
  left join pg_catalog.pg_proc as procedure on procedure.oid = resolved.function_oid
)
select
  signature,
  function_oid is not null as exists,
  case when function_oid is null then null else not prosecdef end as security_invoker,
  anon_execute,
  expected_anon_execute,
  authenticated_execute,
  expected_authenticated_execute,
  service_role_execute,
  expected_service_role_execute,
  function_oid is not null
    and not prosecdef
    and anon_execute = expected_anon_execute
    and authenticated_execute = expected_authenticated_execute
    and service_role_execute = expected_service_role_execute as contract_matches
from observed
order by signature;

with required_indexes(
  index_name,
  table_name,
  expected_columns,
  expected_predicate
) as (
  values
    (
      'idx_payments_received_idempotency_key',
      'payments_received',
      array['idempotency_key']::text[],
      'idempotency_keyisnotnull'
    ),
    (
      'idx_invoice_payments_payment_received_id_unique',
      'invoice_payments',
      array['payment_received_id']::text[],
      'payment_received_idisnotnull'
    ),
    (
      'idx_invoices_idempotency_key',
      'invoices',
      array['idempotency_key']::text[],
      'idempotency_keyisnotnull'
    ),
    (
      'idx_expenses_worker_reimbursement_source',
      'expenses',
      array['source', 'source_id']::text[],
      'source=''worker_reimbursement''andsource_idisnotnull'
    ),
    (
      'idx_expenses_atomic_idempotency_group',
      'expenses',
      array['idempotency_key', 'idempotency_group_index']::text[],
      'idempotency_keyisnotnull'
    ),
    (
      'idx_expenses_bank_transaction_source',
      'expenses',
      array['source', 'source_id']::text[],
      'source=''bank_transaction''andsource_idisnotnull'
    ),
    (
      'idx_bank_transactions_reconcile_idempotency_key',
      'bank_transactions',
      array['reconcile_idempotency_key']::text[],
      'reconcile_idempotency_keyisnotnull'
    )
), observed as (
  select
    required.*,
    index_record.indexrelid,
    index_record.indisunique,
    index_record.indisvalid,
    index_record.indisready,
    index_record.indimmediate,
    (
      select pg_catalog.array_agg(attribute.attname::text order by keys.ordinality)
      from pg_catalog.unnest(index_record.indkey::smallint[])
        with ordinality as keys(attnum, ordinality)
      join pg_catalog.pg_attribute as attribute
        on attribute.attrelid = index_record.indrelid
        and attribute.attnum = keys.attnum
      where keys.ordinality <= index_record.indnkeyatts
    ) as actual_columns,
    pg_catalog.regexp_replace(
      pg_catalog.replace(
        pg_catalog.lower(pg_catalog.pg_get_expr(index_record.indpred, index_record.indrelid)),
        '::text',
        ''
      ),
      '[()[:space:]]',
      '',
      'g'
    ) as actual_predicate,
    pg_catalog.pg_get_indexdef(index_record.indexrelid) as definition
  from required_indexes as required
  left join pg_catalog.pg_namespace as namespace
    on namespace.nspname = 'public'
  left join pg_catalog.pg_class as table_record
    on table_record.relnamespace = namespace.oid
    and table_record.relname = required.table_name
  left join pg_catalog.pg_class as index_name
    on index_name.relnamespace = namespace.oid
    and index_name.relname = required.index_name
  left join pg_catalog.pg_index as index_record
    on index_record.indrelid = table_record.oid
    and index_record.indexrelid = index_name.oid
)
select
  index_name,
  table_name,
  indexrelid is not null as exists,
  indisunique as is_unique,
  indisvalid as is_valid,
  indisready as is_ready,
  indimmediate as is_immediate,
  actual_columns,
  expected_columns,
  actual_predicate,
  expected_predicate,
  indexrelid is not null
    and indisunique
    and indisvalid
    and indisready
    and indimmediate
    and actual_columns = expected_columns
    and actual_predicate = expected_predicate as contract_matches,
  definition
from observed
order by index_name;

with required_triggers(
  trigger_name,
  table_name,
  expected_function,
  expected_trigger_type,
  expected_update_columns
) as (
  values
    (
      'trg_require_paid_reimbursement_payment_link',
      'worker_reimbursements',
      'public.require_paid_reimbursement_payment_link()',
      23::smallint,
      array['status', 'payment_id']::text[]
    ),
    (
      'trg_create_paid_reimbursement_expense',
      'worker_reimbursements',
      'public.create_paid_reimbursement_expense()',
      21::smallint,
      array['status', 'payment_id']::text[]
    )
), observed as (
  select
    required.*,
    trigger_record.oid as trigger_oid,
    trigger_record.tgenabled,
    trigger_record.tgtype,
    procedure_record.prosecdef,
    case
      when procedure_record.oid is null then null
      else pg_catalog.format(
        '%I.%I()',
        procedure_namespace.nspname,
        procedure_record.proname
      )
    end as actual_function,
    (
      select pg_catalog.array_agg(attribute.attname::text order by keys.ordinality)
      from pg_catalog.unnest(trigger_record.tgattr::smallint[])
        with ordinality as keys(attnum, ordinality)
      join pg_catalog.pg_attribute as attribute
        on attribute.attrelid = trigger_record.tgrelid
        and attribute.attnum = keys.attnum
    ) as actual_update_columns,
    pg_catalog.pg_get_triggerdef(trigger_record.oid, true) as definition
  from required_triggers as required
  left join pg_catalog.pg_namespace as table_namespace
    on table_namespace.nspname = 'public'
  left join pg_catalog.pg_class as table_record
    on table_record.relnamespace = table_namespace.oid
    and table_record.relname = required.table_name
  left join pg_catalog.pg_trigger as trigger_record
    on trigger_record.tgrelid = table_record.oid
    and trigger_record.tgname = required.trigger_name
    and not trigger_record.tgisinternal
  left join pg_catalog.pg_proc as procedure_record
    on procedure_record.oid = trigger_record.tgfoid
  left join pg_catalog.pg_namespace as procedure_namespace
    on procedure_namespace.oid = procedure_record.pronamespace
)
select
  trigger_name,
  table_name,
  trigger_oid is not null as exists,
  tgenabled as enabled_mode,
  tgtype as trigger_type,
  expected_trigger_type,
  case when trigger_oid is null then null else not prosecdef end as security_invoker,
  actual_function,
  expected_function,
  actual_update_columns,
  expected_update_columns,
  trigger_oid is not null
    and tgenabled = 'O'
    and tgtype = expected_trigger_type
    and not prosecdef
    and actual_function = expected_function
    and actual_update_columns = expected_update_columns as contract_matches,
  definition
from observed
order by trigger_name;

select
  count(*) filter (
    where schedule.invoice_id is not null
      and schedule.status is distinct from 'invoiced'
  ) as linked_invoice_wrong_status_count,
  count(*) filter (
    where schedule.invoice_id is null
      and schedule.status = 'invoiced'
  ) as invoiced_status_missing_invoice_count,
  count(*) filter (
    where schedule.invoice_id is not null
      and invoice.id is null
  ) as orphan_invoice_link_count,
  count(*) filter (
    where schedule.invoice_id is not null
      and not exists (
        select 1
        from public.estimate_activity_events as event
        where event.estimate_id = schedule.estimate_id
          and event.event_type = 'draft_invoice_created'
          and event.related_record_type = 'invoice'
          and event.related_record_id = schedule.invoice_id
      )
  ) as linked_invoice_missing_activity_count
from public.estimate_payment_schedule_items as schedule
left join public.invoices as invoice on invoice.id = schedule.invoice_id;

select count(*) as invoice_linked_to_multiple_milestones_count
from (
  select schedule.invoice_id
  from public.estimate_payment_schedule_items as schedule
  where schedule.invoice_id is not null
  group by schedule.invoice_id
  having count(*) > 1
) as duplicate_links;

with required_columns(table_name, column_name) as (
  values
    ('estimates', 'id'),
    ('estimates', 'status'),
    ('estimate_payment_schedule_items', 'id'),
    ('estimate_payment_schedule_items', 'estimate_id'),
    ('estimate_payment_schedule_items', 'amount'),
    ('estimate_payment_schedule_items', 'status'),
    ('estimate_payment_schedule_items', 'invoice_id'),
    ('invoices', 'id'),
    ('invoices', 'total'),
    ('invoices', 'idempotency_key'),
    ('invoices', 'atomic_completed_at'),
    ('estimate_activity_events', 'estimate_id'),
    ('estimate_activity_events', 'event_type'),
    ('estimate_activity_events', 'related_record_type'),
    ('estimate_activity_events', 'related_record_id')
), column_material as (
  select pg_catalog.string_agg(
    pg_catalog.concat_ws(
      '|',
      required.table_name,
      required.column_name,
      columns.data_type,
      columns.udt_schema,
      columns.udt_name,
      columns.is_nullable,
      coalesce(columns.column_default, '')
    ),
    E'\n' order by required.table_name, required.column_name
  ) as value
  from required_columns as required
  left join information_schema.columns as columns
    on columns.table_schema = 'public'
    and columns.table_name = required.table_name
    and columns.column_name = required.column_name
), required_functions(signature) as (
  values
    ('public.create_invoice_atomic(text,jsonb,jsonb)'),
    ('public.link_estimate_milestone_invoice_with_activity(uuid,uuid,uuid,uuid,text)')
), function_material as (
  select pg_catalog.string_agg(
    pg_catalog.concat_ws(
      '|',
      required.signature,
      procedure.prosecdef,
      pg_catalog.pg_get_functiondef(procedure.oid),
      pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE'),
      pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE'),
      pg_catalog.has_function_privilege('service_role', procedure.oid, 'EXECUTE')
    ),
    E'\n' order by required.signature
  ) as value
  from required_functions as required
  left join pg_catalog.pg_proc as procedure
    on procedure.oid = pg_catalog.to_regprocedure(required.signature)
), constraint_material as (
  select pg_catalog.string_agg(
    pg_catalog.concat_ws(
      '|',
      table_name.relname,
      constraint_record.conname,
      constraint_record.contype,
      constraint_record.convalidated,
      pg_catalog.pg_get_constraintdef(constraint_record.oid, true)
    ),
    E'\n' order by table_name.relname, constraint_record.conname
  ) as value
  from pg_catalog.pg_constraint as constraint_record
  join pg_catalog.pg_class as table_name on table_name.oid = constraint_record.conrelid
  join pg_catalog.pg_namespace as namespace on namespace.oid = table_name.relnamespace
  where namespace.nspname = 'public'
    and table_name.relname in (
      'estimates',
      'estimate_payment_schedule_items',
      'invoices',
      'estimate_activity_events'
    )
), index_material as (
  select pg_catalog.string_agg(
    pg_catalog.concat_ws(
      '|',
      table_name.relname,
      index_name.relname,
      index_record.indisunique,
      index_record.indisvalid,
      index_record.indisready,
      pg_catalog.pg_get_indexdef(index_record.indexrelid)
    ),
    E'\n' order by table_name.relname, index_name.relname
  ) as value
  from pg_catalog.pg_index as index_record
  join pg_catalog.pg_class as table_name on table_name.oid = index_record.indrelid
  join pg_catalog.pg_class as index_name on index_name.oid = index_record.indexrelid
  join pg_catalog.pg_namespace as namespace on namespace.oid = table_name.relnamespace
  where namespace.nspname = 'public'
    and table_name.relname in (
      'estimates',
      'estimate_payment_schedule_items',
      'invoices',
      'estimate_activity_events'
    )
)
select pg_catalog.md5(
  coalesce(column_material.value, '') || E'\n--functions--\n' ||
  coalesce(function_material.value, '') || E'\n--constraints--\n' ||
  coalesce(constraint_material.value, '') || E'\n--indexes--\n' ||
  coalesce(index_material.value, '')
) as step_11_prerequisite_fingerprint
from column_material
cross join function_material
cross join constraint_material
cross join index_material;

rollback;
