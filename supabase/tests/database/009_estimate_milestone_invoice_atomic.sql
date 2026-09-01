begin;

select plan(35);

select has_function(
  'public',
  'create_estimate_milestone_invoice_atomic',
  array['text', 'jsonb', 'jsonb', 'uuid', 'uuid', 'uuid', 'text'],
  'atomic Estimate milestone Invoice RPC exists'
);

select ok(
  not (
    select p.prosecdef
    from pg_catalog.pg_proc as p
    where p.oid = 'public.create_estimate_milestone_invoice_atomic(text,jsonb,jsonb,uuid,uuid,uuid,text)'::regprocedure
  ),
  'milestone Invoice RPC remains security invoker'
);

select ok(
  position(
    'for update' in lower(
      pg_catalog.pg_get_functiondef(
        'public.create_estimate_milestone_invoice_atomic(text,jsonb,jsonb,uuid,uuid,uuid,text)'::regprocedure
      )
    )
  ) > 0,
  'milestone Invoice RPC serializes competing requests with a row lock'
);

select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.create_estimate_milestone_invoice_atomic(text,jsonb,jsonb,uuid,uuid,uuid,text)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.create_estimate_milestone_invoice_atomic(text,jsonb,jsonb,uuid,uuid,uuid,text)',
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'service_role',
    'public.create_estimate_milestone_invoice_atomic(text,jsonb,jsonb,uuid,uuid,uuid,text)',
    'EXECUTE'
  ),
  'milestone Invoice RPC is server-only'
);

insert into public.estimates (id, number, client, project, status)
values (
  '91000000-0000-4000-8000-000000000001',
  'EST-ATOMIC-MILESTONE-001',
  'Atomic Milestone Client',
  'Atomic Milestone Project',
  'Approved'
);
insert into public.estimate_items (estimate_id, cost_code, "desc", qty, unit, unit_cost, markup_pct)
values (
  '91000000-0000-4000-8000-000000000001',
  '010000',
  'Atomic milestone contract value',
  1,
  'EA',
  110,
  0
);

insert into public.estimate_payment_schedule_items (
  id,
  estimate_id,
  title,
  amount,
  status,
  sort_order
) values (
  '92000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  'Deposit',
  55,
  'draft',
  0
);

create temp table milestone_invoice_results (sequence integer generated always as identity, result jsonb);

insert into milestone_invoice_results (result)
select public.create_estimate_milestone_invoice_atomic(
  'invoice-milestone:91000000-0000-4000-8000-000000000001:92000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'invoice_no', 'ATOMIC-MILESTONE-INV-001',
    'project_id', null,
    'customer_id', null,
    'client_name', 'Atomic Milestone Client',
    'issue_date', '2026-08-31',
    'due_date', '2026-09-30',
    'status', 'Draft',
    'notes', 'Atomic Estimate milestone Invoice',
    'tax_pct', 10
  ),
  jsonb_build_array(
    jsonb_build_object('description', 'Milestone labor', 'qty', 2, 'unit_price', 25)
  ),
  '91000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001',
  'atomic-owner@example.com'
);

select is(
  (select count(*) from public.invoices where idempotency_key = 'invoice-milestone:91000000-0000-4000-8000-000000000001:92000000-0000-4000-8000-000000000001'),
  1::bigint,
  'success creates exactly one Invoice header'
);
select is(
  (
    select count(*)
    from public.invoice_items as item
    join public.invoices as invoice on invoice.id = item.invoice_id
    where invoice.idempotency_key = 'invoice-milestone:91000000-0000-4000-8000-000000000001:92000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'success creates every Invoice line item once'
);
select is(
  (select subtotal from public.invoices where idempotency_key = 'invoice-milestone:91000000-0000-4000-8000-000000000001:92000000-0000-4000-8000-000000000001'),
  50::numeric,
  'milestone Invoice preserves the existing subtotal formula'
);
select is(
  (select tax_amount from public.invoices where idempotency_key = 'invoice-milestone:91000000-0000-4000-8000-000000000001:92000000-0000-4000-8000-000000000001'),
  5::numeric,
  'milestone Invoice preserves cent-rounded tax'
);
select is(
  (select total from public.invoices where idempotency_key = 'invoice-milestone:91000000-0000-4000-8000-000000000001:92000000-0000-4000-8000-000000000001'),
  55::numeric,
  'milestone Invoice preserves total = subtotal + tax'
);
select is(
  (
    select schedule.invoice_id::text
    from public.estimate_payment_schedule_items as schedule
    where schedule.id = '92000000-0000-4000-8000-000000000001'
  ),
  (select result->>'invoice_id' from milestone_invoice_results where sequence = 1),
  'success atomically links the created Invoice to the milestone'
);
select is(
  (
    select schedule.status
    from public.estimate_payment_schedule_items as schedule
    where schedule.id = '92000000-0000-4000-8000-000000000001'
  ),
  'invoiced',
  'success atomically advances the milestone status'
);
select is(
  (
    select count(*)
    from public.estimate_activity_events as event
    where event.estimate_id = '91000000-0000-4000-8000-000000000001'
      and event.event_type = 'draft_invoice_created'
  ),
  1::bigint,
  'success writes one authoritative Invoice activity event'
);

insert into milestone_invoice_results (result)
select public.create_estimate_milestone_invoice_atomic(
  'invoice-milestone:91000000-0000-4000-8000-000000000001:92000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'invoice_no', 'ATOMIC-MILESTONE-INV-001',
    'project_id', null,
    'customer_id', null,
    'client_name', 'Atomic Milestone Client',
    'issue_date', '2026-08-31',
    'due_date', '2026-09-30',
    'status', 'Draft',
    'notes', 'Atomic Estimate milestone Invoice',
    'tax_pct', 10
  ),
  jsonb_build_array(
    jsonb_build_object('description', 'Milestone labor', 'qty', 2, 'unit_price', 25)
  ),
  '91000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001',
  'atomic-owner@example.com'
);

select is(
  (select result->>'invoice_id' from milestone_invoice_results where sequence = 2),
  (select result->>'invoice_id' from milestone_invoice_results where sequence = 1),
  'retry after an ambiguous response returns the authoritative Invoice'
);
select is(
  (select count(*) from public.invoices where idempotency_key = 'invoice-milestone:91000000-0000-4000-8000-000000000001:92000000-0000-4000-8000-000000000001'),
  1::bigint,
  'retry does not duplicate the Invoice'
);
select is(
  (
    select count(*)
    from public.estimate_activity_events as event
    where event.estimate_id = '91000000-0000-4000-8000-000000000001'
      and event.event_type = 'draft_invoice_created'
  ),
  1::bigint,
  'retry does not duplicate the Invoice activity event'
);

insert into milestone_invoice_results (result)
select public.create_estimate_milestone_invoice_atomic(
  'invoice-milestone:91000000-0000-4000-8000-000000000001:92000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'invoice_no', 'ATOMIC-MILESTONE-INV-SHOULD-NOT-EXIST',
    'project_id', null,
    'customer_id', null,
    'client_name', 'Changed retry payload',
    'issue_date', '2026-08-31',
    'due_date', '2026-09-30',
    'status', 'Draft',
    'tax_pct', 0
  ),
  jsonb_build_array(
    jsonb_build_object('description', 'Changed item', 'qty', 1, 'unit_price', 999)
  ),
  '91000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001',
  'atomic-owner@example.com'
);

select is(
  (select result->>'invoice_id' from milestone_invoice_results where sequence = 3),
  (select result->>'invoice_id' from milestone_invoice_results where sequence = 1),
  'an already-linked milestone always returns its authoritative Invoice'
);
select is(
  (select count(*) from public.invoices where invoice_no = 'ATOMIC-MILESTONE-INV-SHOULD-NOT-EXIST'),
  0::bigint,
  'an already-linked milestone never creates or deletes a competing Invoice'
);

insert into public.estimate_payment_schedule_items (
  id,
  estimate_id,
  title,
  amount,
  status,
  sort_order
) values (
  '92000000-0000-4000-8000-000000000003',
  '91000000-0000-4000-8000-000000000001',
  'Second milestone with identical amount',
  55,
  'draft',
  1
);

select throws_ok(
  $$
    select public.create_estimate_milestone_invoice_atomic(
      'invoice-milestone:91000000-0000-4000-8000-000000000001:92000000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'invoice_no', 'ATOMIC-MILESTONE-INV-WRONG-IDENTITY',
        'project_id', null,
        'customer_id', null,
        'client_name', 'Atomic Milestone Client',
        'issue_date', '2026-08-31',
        'due_date', '2026-09-30',
        'status', 'Draft',
        'tax_pct', 10
      ),
      jsonb_build_array(
        jsonb_build_object('description', 'Milestone labor', 'qty', 2, 'unit_price', 25)
      ),
      '91000000-0000-4000-8000-000000000001',
      '92000000-0000-4000-8000-000000000003',
      '93000000-0000-4000-8000-000000000001',
      'atomic-owner@example.com'
    )
  $$,
  '22023',
  'Milestone Invoice idempotency key must match its Estimate and payment schedule item.',
  'one caller key cannot associate the same Invoice with two milestones'
);
select ok(
  (
    select schedule.invoice_id is null and schedule.status = 'draft'
    from public.estimate_payment_schedule_items as schedule
    where schedule.id = '92000000-0000-4000-8000-000000000003'
  ),
  'wrong milestone identity leaves the second milestone unchanged'
);
select is(
  (select count(*) from public.invoices where invoice_no = 'ATOMIC-MILESTONE-INV-WRONG-IDENTITY'),
  0::bigint,
  'wrong milestone identity creates no competing Invoice'
);

insert into public.estimates (id, number, client, project, status)
values (
  '91000000-0000-4000-8000-000000000002',
  'EST-ATOMIC-MILESTONE-002',
  'Atomic Rollback Client',
  'Atomic Rollback Project',
  'Approved'
);
insert into public.estimate_items (estimate_id, cost_code, "desc", qty, unit, unit_cost, markup_pct)
values (
  '91000000-0000-4000-8000-000000000002',
  '010000',
  'Atomic rollback contract value',
  1,
  'EA',
  25,
  0
);
insert into public.estimate_payment_schedule_items (
  id,
  estimate_id,
  title,
  amount,
  status,
  sort_order
) values (
  '92000000-0000-4000-8000-000000000002',
  '91000000-0000-4000-8000-000000000002',
  'Rollback Deposit',
  25,
  'draft',
  0
);

savepoint before_activity_failure_injection;
create function pg_temp.fail_target_milestone_activity()
returns trigger
language plpgsql
as $$
begin
  if new.estimate_id = '91000000-0000-4000-8000-000000000002'
    and new.event_type = 'draft_invoice_created'
  then
    raise exception 'injected milestone activity failure';
  end if;
  return new;
end;
$$;
create trigger fail_target_milestone_activity
before insert on public.estimate_activity_events
for each row execute function pg_temp.fail_target_milestone_activity();

select throws_ok(
  $$
    select public.create_estimate_milestone_invoice_atomic(
      'invoice-milestone:91000000-0000-4000-8000-000000000002:92000000-0000-4000-8000-000000000002',
      jsonb_build_object(
        'invoice_no', 'ATOMIC-MILESTONE-INV-ROLLBACK',
        'project_id', null,
        'customer_id', null,
        'client_name', 'Atomic Rollback Client',
        'issue_date', '2026-08-31',
        'due_date', '2026-09-30',
        'status', 'Draft',
        'tax_pct', 0
      ),
      jsonb_build_array(
        jsonb_build_object('description', 'Rollback item', 'qty', 1, 'unit_price', 25)
      ),
      '91000000-0000-4000-8000-000000000002',
      '92000000-0000-4000-8000-000000000002',
      '93000000-0000-4000-8000-000000000001',
      'atomic-owner@example.com'
    )
  $$,
  'P0001',
  'injected milestone activity failure',
  'activity failure aborts the combined Invoice and milestone operation'
);
rollback to savepoint before_activity_failure_injection;
release savepoint before_activity_failure_injection;

select is(
  (select count(*) from public.invoices where idempotency_key = 'invoice-milestone:91000000-0000-4000-8000-000000000002:92000000-0000-4000-8000-000000000002'),
  0::bigint,
  'activity failure rolls back the Invoice header and items'
);
select ok(
  (
    select schedule.invoice_id is null and schedule.status = 'draft'
    from public.estimate_payment_schedule_items as schedule
    where schedule.id = '92000000-0000-4000-8000-000000000002'
  ),
  'activity failure rolls back milestone linkage and status'
);

insert into public.estimates (id, number, client, project, status)
values (
  '91000000-0000-4000-8000-000000000004',
  'EST-ATOMIC-MILESTONE-004',
  'Ineligible Estimate Client',
  'Ineligible Estimate Project',
  'Draft'
);
insert into public.estimate_items (estimate_id, cost_code, "desc", qty, unit, unit_cost, markup_pct)
values (
  '91000000-0000-4000-8000-000000000004',
  '010000',
  'Ineligible Estimate contract value',
  1,
  'EA',
  25,
  0
);
insert into public.estimate_payment_schedule_items (
  id,
  estimate_id,
  title,
  amount,
  status,
  sort_order
) values (
  '92000000-0000-4000-8000-000000000004',
  '91000000-0000-4000-8000-000000000004',
  'Ineligible Estimate deposit',
  25,
  'draft',
  0
);

select throws_ok(
  $$
    select public.create_estimate_milestone_invoice_atomic(
      'invoice-milestone:91000000-0000-4000-8000-000000000004:92000000-0000-4000-8000-000000000004',
      jsonb_build_object(
        'invoice_no', 'ATOMIC-MILESTONE-INV-INELIGIBLE',
        'project_id', null,
        'customer_id', null,
        'client_name', 'Ineligible Estimate Client',
        'issue_date', '2026-08-31',
        'due_date', '2026-09-30',
        'status', 'Draft',
        'tax_pct', 0
      ),
      jsonb_build_array(
        jsonb_build_object('description', 'Ineligible item', 'qty', 1, 'unit_price', 25)
      ),
      '91000000-0000-4000-8000-000000000004',
      '92000000-0000-4000-8000-000000000004',
      '93000000-0000-4000-8000-000000000001',
      'atomic-owner@example.com'
    )
  $$,
  '23514',
  'Only Approved or Converted Estimates can create milestone Invoices.',
  'non-eligible Estimate status fails before any persistent write'
);
select is(
  (select count(*) from public.invoices where invoice_no = 'ATOMIC-MILESTONE-INV-INELIGIBLE'),
  0::bigint,
  'non-eligible Estimate creates no Invoice'
);
select is(
  (select count(*) from public.estimate_activity_events where estimate_id = '91000000-0000-4000-8000-000000000004'),
  0::bigint,
  'non-eligible Estimate creates no activity event'
);
select ok(
  (
    select schedule.invoice_id is null and schedule.status = 'draft'
    from public.estimate_payment_schedule_items as schedule
    where schedule.id = '92000000-0000-4000-8000-000000000004'
  ),
  'non-eligible Estimate leaves its milestone unchanged'
);

insert into public.estimates (id, number, client, project, status)
values (
  '91000000-0000-4000-8000-000000000005',
  'EST-ATOMIC-MILESTONE-005',
  'Stale Amount Client',
  'Stale Amount Project',
  'Approved'
);
insert into public.estimate_items (estimate_id, cost_code, "desc", qty, unit, unit_cost, markup_pct)
values (
  '91000000-0000-4000-8000-000000000005',
  '010000',
  'Stale amount contract value',
  1,
  'EA',
  25,
  0
);
insert into public.estimate_payment_schedule_items (
  id,
  estimate_id,
  title,
  amount,
  status,
  sort_order
) values (
  '92000000-0000-4000-8000-000000000005',
  '91000000-0000-4000-8000-000000000005',
  'Authoritative 25.00 deposit',
  25,
  'draft',
  0
);

select throws_ok(
  $$
    select public.create_estimate_milestone_invoice_atomic(
      'invoice-milestone:91000000-0000-4000-8000-000000000005:92000000-0000-4000-8000-000000000005',
      jsonb_build_object(
        'invoice_no', 'ATOMIC-MILESTONE-INV-STALE-AMOUNT',
        'project_id', null,
        'customer_id', null,
        'client_name', 'Stale Amount Client',
        'issue_date', '2026-08-31',
        'due_date', '2026-09-30',
        'status', 'Draft',
        'tax_pct', 0
      ),
      jsonb_build_array(
        jsonb_build_object('description', 'Stale amount item', 'qty', 1, 'unit_price', 24.99)
      ),
      '91000000-0000-4000-8000-000000000005',
      '92000000-0000-4000-8000-000000000005',
      '93000000-0000-4000-8000-000000000001',
      'atomic-owner@example.com'
    )
  $$,
  '23514',
  'Invoice total must match the locked payment schedule amount.',
  'a stale client amount is rejected against the locked milestone amount'
);
select is(
  (select count(*) from public.invoices where invoice_no = 'ATOMIC-MILESTONE-INV-STALE-AMOUNT'),
  0::bigint,
  'stale amount rejection rolls back the Invoice'
);
select is(
  (select count(*) from public.estimate_activity_events where estimate_id = '91000000-0000-4000-8000-000000000005'),
  0::bigint,
  'stale amount rejection creates no activity event'
);
select ok(
  (
    select schedule.invoice_id is null and schedule.status = 'draft'
    from public.estimate_payment_schedule_items as schedule
    where schedule.id = '92000000-0000-4000-8000-000000000005'
  ),
  'stale amount rejection leaves its milestone unchanged'
);

create extension if not exists dblink with schema extensions;
select extensions.dblink_connect(
  'milestone_concurrent_a',
  'host=supabase_db_hh-unified-web port=5432 dbname=postgres user=postgres password=postgres'
);
select extensions.dblink_connect(
  'milestone_concurrent_b',
  'host=supabase_db_hh-unified-web port=5432 dbname=postgres user=postgres password=postgres'
);

select extensions.dblink_exec(
  'milestone_concurrent_a',
  $remote$
    insert into public.estimates (id, number, client, project, status)
    values (
      '91000000-0000-4000-8000-000000000006',
      'EST-ATOMIC-MILESTONE-006',
      'Concurrent Client',
      'Concurrent Project',
      'Approved'
    );
    insert into public.estimate_items (estimate_id, cost_code, "desc", qty, unit, unit_cost, markup_pct)
    values (
      '91000000-0000-4000-8000-000000000006',
      '010000',
      'Concurrent contract value',
      1,
      'EA',
      25,
      0
    );
    insert into public.estimate_payment_schedule_items (
      id,
      estimate_id,
      title,
      amount,
      status,
      sort_order
    ) values (
      '92000000-0000-4000-8000-000000000006',
      '91000000-0000-4000-8000-000000000006',
      'Concurrent deposit',
      25,
      'draft',
      0
    );
  $remote$
);

select extensions.dblink_exec('milestone_concurrent_a', 'begin');
create temp table concurrent_milestone_results (request text primary key, result jsonb);
insert into concurrent_milestone_results (request, result)
select 'a', result
from extensions.dblink(
  'milestone_concurrent_a',
  $remote$
    select public.create_estimate_milestone_invoice_atomic(
      'invoice-milestone:91000000-0000-4000-8000-000000000006:92000000-0000-4000-8000-000000000006',
      jsonb_build_object(
        'invoice_no', 'ATOMIC-MILESTONE-INV-CONCURRENT',
        'project_id', null,
        'customer_id', null,
        'client_name', 'Concurrent Client',
        'issue_date', '2026-08-31',
        'due_date', '2026-09-30',
        'status', 'Draft',
        'tax_pct', 0
      ),
      jsonb_build_array(
        jsonb_build_object('description', 'Concurrent item', 'qty', 1, 'unit_price', 25)
      ),
      '91000000-0000-4000-8000-000000000006',
      '92000000-0000-4000-8000-000000000006',
      '93000000-0000-4000-8000-000000000001',
      'atomic-owner@example.com'
    )
  $remote$
) as concurrent_call(result jsonb);

select extensions.dblink_send_query(
  'milestone_concurrent_b',
  $remote$
    select public.create_estimate_milestone_invoice_atomic(
      'invoice-milestone:91000000-0000-4000-8000-000000000006:92000000-0000-4000-8000-000000000006',
      jsonb_build_object(
        'invoice_no', 'ATOMIC-MILESTONE-INV-CONCURRENT',
        'project_id', null,
        'customer_id', null,
        'client_name', 'Concurrent Client',
        'issue_date', '2026-08-31',
        'due_date', '2026-09-30',
        'status', 'Draft',
        'tax_pct', 0
      ),
      jsonb_build_array(
        jsonb_build_object('description', 'Concurrent item', 'qty', 1, 'unit_price', 25)
      ),
      '91000000-0000-4000-8000-000000000006',
      '92000000-0000-4000-8000-000000000006',
      '93000000-0000-4000-8000-000000000001',
      'atomic-owner@example.com'
    )
  $remote$
);
select pg_catalog.pg_sleep(0.2);
select is(
  extensions.dblink_is_busy('milestone_concurrent_b'),
  1,
  'a competing create remains blocked while the first milestone transaction holds the row lock'
);
select extensions.dblink_exec('milestone_concurrent_a', 'commit');
insert into concurrent_milestone_results (request, result)
select 'b', result
from extensions.dblink_get_result('milestone_concurrent_b') as concurrent_call(result jsonb);

select is(
  (select result->>'invoice_id' from concurrent_milestone_results where request = 'b'),
  (select result->>'invoice_id' from concurrent_milestone_results where request = 'a'),
  'the blocked retry returns the single authoritative Invoice after the first commit'
);
select is(
  (select count(*) from public.invoices where idempotency_key = 'invoice-milestone:91000000-0000-4000-8000-000000000006:92000000-0000-4000-8000-000000000006'),
  1::bigint,
  'two concurrent sessions create exactly one Invoice'
);
select is(
  (select count(*) from public.estimate_activity_events where estimate_id = '91000000-0000-4000-8000-000000000006' and event_type = 'draft_invoice_created'),
  1::bigint,
  'two concurrent sessions create exactly one activity event'
);

select extensions.dblink_exec(
  'milestone_concurrent_a',
  $remote$
    delete from public.estimate_activity_events
    where estimate_id = '91000000-0000-4000-8000-000000000006';
    delete from public.estimate_payment_schedule_items
    where estimate_id = '91000000-0000-4000-8000-000000000006';
    delete from public.invoice_items
    where invoice_id in (
      select id from public.invoices
      where idempotency_key = 'invoice-milestone:91000000-0000-4000-8000-000000000006:92000000-0000-4000-8000-000000000006'
    );
    delete from public.invoices
    where idempotency_key = 'invoice-milestone:91000000-0000-4000-8000-000000000006:92000000-0000-4000-8000-000000000006';
    delete from public.estimate_items
    where estimate_id = '91000000-0000-4000-8000-000000000006';
    delete from public.estimates
    where id = '91000000-0000-4000-8000-000000000006';
  $remote$
);
select extensions.dblink_disconnect('milestone_concurrent_a');
select extensions.dblink_disconnect('milestone_concurrent_b');

select * from finish();

rollback;
