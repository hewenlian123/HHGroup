begin;

select plan(16);

create function pg_temp.function_execute_grantees(p_signature text)
returns text[]
language sql
stable
as $$
  select coalesce(
    array_agg(
      case when acl.grantee = 0 then 'PUBLIC' else role.rolname end
      order by case when acl.grantee = 0 then 'PUBLIC' else role.rolname end
    ),
    array[]::text[]
  )
  from pg_catalog.pg_proc procedure
  cross join lateral pg_catalog.aclexplode(
    coalesce(
      procedure.proacl,
      pg_catalog.acldefault('f', procedure.proowner)
    )
  ) acl
  left join pg_catalog.pg_roles role on role.oid = acl.grantee
  where procedure.oid = pg_catalog.to_regprocedure(p_signature)
    and acl.privilege_type = 'EXECUTE'
    and acl.grantee <> procedure.proowner;
$$;

select ok(
  not exists (
    select 1
    from unnest(array[
      'public.record_payment_received_atomic(text,uuid,uuid,text,date,numeric,text,text,text,text,jsonb)',
      'public.update_payment_received_atomic(uuid,date,numeric,text,text,text,uuid)',
      'public.record_worker_payroll_settlement(text,uuid,uuid,numeric,text,date,text,uuid[],uuid[],uuid[],numeric)',
      'public.require_paid_reimbursement_payment_link()',
      'public.create_paid_reimbursement_expense()',
      'public.record_worker_reimbursement_payment_atomic(text,uuid,text,date,text,uuid[])',
      'public.create_invoice_atomic(text,jsonb,jsonb)',
      'public.update_invoice_atomic(uuid,jsonb,jsonb)',
      'public.void_payment_received_atomic(uuid)'
    ]) signature
    where pg_catalog.to_regprocedure(signature) is null
  ),
  'All nine protected financial functions exist with the audited signatures'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc procedure
    where procedure.oid = any(array[
      'public.record_payment_received_atomic(text,uuid,uuid,text,date,numeric,text,text,text,text,jsonb)'::regprocedure,
      'public.update_payment_received_atomic(uuid,date,numeric,text,text,text,uuid)'::regprocedure,
      'public.record_worker_payroll_settlement(text,uuid,uuid,numeric,text,date,text,uuid[],uuid[],uuid[],numeric)'::regprocedure,
      'public.require_paid_reimbursement_payment_link()'::regprocedure,
      'public.create_paid_reimbursement_expense()'::regprocedure,
      'public.record_worker_reimbursement_payment_atomic(text,uuid,text,date,text,uuid[])'::regprocedure,
      'public.create_invoice_atomic(text,jsonb,jsonb)'::regprocedure,
      'public.update_invoice_atomic(uuid,jsonb,jsonb)'::regprocedure,
      'public.void_payment_received_atomic(uuid)'::regprocedure
    ]::oid[])
      and procedure.prosecdef
  ),
  'All nine protected financial functions remain security invoker'
);

select is(
  pg_temp.function_execute_grantees('public.void_payment_received_atomic(uuid)'),
  array['authenticated', 'service_role']::text[],
  'Payment Void RPC is executable only by authenticated and service_role'
);

select ok(
  not pg_catalog.has_function_privilege('anon', 'public.void_payment_received_atomic(uuid)', 'EXECUTE'),
  'Payment Void RPC denies anon execution'
);

select ok(
  pg_catalog.has_function_privilege('authenticated', 'public.void_payment_received_atomic(uuid)', 'EXECUTE')
    and pg_catalog.has_function_privilege('service_role', 'public.void_payment_received_atomic(uuid)', 'EXECUTE'),
  'Payment Void RPC allows the existing owner/admin session and server roles'
);

select is(
  pg_temp.function_execute_grantees('public.record_payment_received_atomic(text,uuid,uuid,text,date,numeric,text,text,text,text,jsonb)'),
  array['authenticated', 'service_role']::text[],
  'Payment create RPC is executable only by authenticated and service_role'
);

select is(
  pg_temp.function_execute_grantees('public.update_payment_received_atomic(uuid,date,numeric,text,text,text,uuid)'),
  array['authenticated', 'service_role']::text[],
  'Payment update RPC is executable only by authenticated and service_role'
);

select is(
  pg_temp.function_execute_grantees('public.record_worker_payroll_settlement(text,uuid,uuid,numeric,text,date,text,uuid[],uuid[],uuid[],numeric)'),
  array['service_role']::text[],
  'Payroll settlement RPC is executable only by service_role'
);

select is(
  pg_temp.function_execute_grantees('public.require_paid_reimbursement_payment_link()'),
  array[]::text[],
  'Paid reimbursement validation trigger helper has no API execute grantee'
);

select is(
  pg_temp.function_execute_grantees('public.create_paid_reimbursement_expense()'),
  array[]::text[],
  'Paid reimbursement expense trigger helper has no API execute grantee'
);

select is(
  pg_temp.function_execute_grantees('public.record_worker_reimbursement_payment_atomic(text,uuid,text,date,text,uuid[])'),
  array['service_role']::text[],
  'Reimbursement payment RPC is executable only by service_role'
);

select is(
  pg_temp.function_execute_grantees('public.create_invoice_atomic(text,jsonb,jsonb)'),
  array['authenticated', 'service_role']::text[],
  'Invoice create RPC is executable only by authenticated and service_role'
);

select is(
  pg_temp.function_execute_grantees('public.update_invoice_atomic(uuid,jsonb,jsonb)'),
  array['authenticated', 'service_role']::text[],
  'Invoice update RPC is executable only by authenticated and service_role'
);

select ok(
  (
    select bool_and(
      not pg_catalog.has_function_privilege('anon', signature, 'EXECUTE')
      and pg_catalog.has_function_privilege('authenticated', signature, 'EXECUTE')
      and pg_catalog.has_function_privilege('service_role', signature, 'EXECUTE')
    )
    from unnest(array[
      'public.record_payment_received_atomic(text,uuid,uuid,text,date,numeric,text,text,text,text,jsonb)',
      'public.update_payment_received_atomic(uuid,date,numeric,text,text,text,uuid)',
      'public.create_invoice_atomic(text,jsonb,jsonb)',
      'public.update_invoice_atomic(uuid,jsonb,jsonb)'
    ]) signature
  ),
  'Owner/admin session fallback RPCs deny anon and allow authenticated plus service_role'
);

select ok(
  (
    select bool_and(
      not pg_catalog.has_function_privilege('anon', signature, 'EXECUTE')
      and not pg_catalog.has_function_privilege('authenticated', signature, 'EXECUTE')
      and pg_catalog.has_function_privilege('service_role', signature, 'EXECUTE')
    )
    from unnest(array[
      'public.record_worker_payroll_settlement(text,uuid,uuid,numeric,text,date,text,uuid[],uuid[],uuid[],numeric)',
      'public.record_worker_reimbursement_payment_atomic(text,uuid,text,date,text,uuid[])'
    ]) signature
  ),
  'Server-only payroll and reimbursement RPCs deny browser roles and allow service_role'
);

select ok(
  (
    select bool_and(
      not pg_catalog.has_function_privilege('anon', signature, 'EXECUTE')
      and not pg_catalog.has_function_privilege('authenticated', signature, 'EXECUTE')
      and not pg_catalog.has_function_privilege('service_role', signature, 'EXECUTE')
    )
    from unnest(array[
      'public.require_paid_reimbursement_payment_link()',
      'public.create_paid_reimbursement_expense()'
    ]) signature
  ),
  'Trigger helpers deny direct execution to every API role'
);

select * from finish();

rollback;
