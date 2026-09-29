begin;

select no_plan();

select has_function(
  'public',
  'link_unapplied_payment_to_invoice',
  array['uuid', 'uuid'],
  'atomic unapplied payment link RPC exists'
);

select ok(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.link_unapplied_payment_to_invoice(uuid,uuid)',
    'EXECUTE'
  )
    and not pg_catalog.has_function_privilege(
      'public',
      'public.link_unapplied_payment_to_invoice(uuid,uuid)',
      'EXECUTE'
    ),
  'link RPC denies anon and public execution'
);

select ok(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.link_unapplied_payment_to_invoice(uuid,uuid)',
    'EXECUTE'
  )
    and pg_catalog.has_function_privilege(
      'service_role',
      'public.link_unapplied_payment_to_invoice(uuid,uuid)',
      'EXECUTE'
    ),
  'link RPC allows authenticated and service_role execution'
);

select ok(
  not procedure.prosecdef
    and procedure.proconfig = array['search_path=""']::text[],
  'link RPC is security invoker with an empty search_path'
)
from pg_catalog.pg_proc procedure
where procedure.oid = 'public.link_unapplied_payment_to_invoice(uuid,uuid)'::regprocedure;

insert into auth.users (id, aud, role, email, raw_app_meta_data, is_anonymous)
values (
  '02400000-0000-4000-8000-000000000090',
  'authenticated',
  'authenticated',
  'link-unapplied-owner@example.test',
  '{"role":"owner"}'::jsonb,
  false
);
insert into public.organization_memberships (organization_id, user_id, role, status)
select o.id, '02400000-0000-4000-8000-000000000090'::uuid, 'owner', 'active'
from public.organizations o
join public.company_profile c on c.id = o.legacy_company_profile_id;

insert into public.projects (id, name, status, organization_id)
select fixture.id::uuid, fixture.name, 'active', org.id
from (
  values
    ('02400000-0000-4000-8000-000000000001', 'Link Project One'),
    ('02400000-0000-4000-8000-000000000002', 'Link Project Two')
) as fixture(id, name)
cross join (
  select o.id
  from public.organizations o
  join public.company_profile c on c.id = o.legacy_company_profile_id
  limit 1
) org;

insert into public.invoices (id, invoice_no, project_id, client_name, status, total)
values
  (
    '02400000-0000-4000-8000-000000000011',
    'LINK-A',
    '02400000-0000-4000-8000-000000000001',
    'Link Customer',
    'Sent',
    100
  ),
  (
    '02400000-0000-4000-8000-000000000012',
    'LINK-B',
    '02400000-0000-4000-8000-000000000001',
    'Link Customer',
    'Sent',
    100
  ),
  (
    '02400000-0000-4000-8000-000000000013',
    'LINK-C',
    '02400000-0000-4000-8000-000000000002',
    'Link Customer',
    'Sent',
    100
  ),
  (
    '02400000-0000-4000-8000-000000000014',
    'LINK-F',
    '02400000-0000-4000-8000-000000000001',
    'Link Customer',
    'Sent',
    100
  ),
  (
    '02400000-0000-4000-8000-000000000015',
    'LINK-G',
    '02400000-0000-4000-8000-000000000001',
    'Link Customer',
    'Sent',
    100
  );

select set_config(
  'request.jwt.claims',
  '{"sub":"02400000-0000-4000-8000-000000000090","role":"authenticated","app_metadata":{"role":"owner"},"is_anonymous":false}',
  true
);
select ok(
  auth.uid() = '02400000-0000-4000-8000-000000000090'::uuid
    and private.can_manage_company()
    and public.is_owner_or_admin(),
  'link fixture has authenticated same-organization financial authority'
);

select public.record_payment_received_atomic(
  'link-voided-reactivate',
  '02400000-0000-4000-8000-000000000011',
  '02400000-0000-4000-8000-000000000001',
  'Link Customer',
  '2026-09-04',
  25,
  'Check',
  'Operating',
  'Voided then linked',
  null
);

update public.invoice_payments
set status = 'Voided'
where payment_received_id = (
  select id from public.payments_received where idempotency_key = 'link-voided-reactivate'
);

create temp table link_fixture (payment_id uuid, allocation_id uuid);
insert into link_fixture (payment_id, allocation_id)
select payment.id, allocation.id
from public.payments_received payment
join public.invoice_payments allocation on allocation.payment_received_id = payment.id
where payment.idempotency_key = 'link-voided-reactivate';

select is(
  (select status from public.invoice_payments where id = (select allocation_id from link_fixture)),
  'Voided',
  'fixture allocation is voided while the receipt stays open'
);
select is(
  (select status from public.payments_received where id = (select payment_id from link_fixture)),
  'completed',
  'voiding only the allocation leaves the receipt active'
);
select is(
  (select paid_total from public.invoices where id = '02400000-0000-4000-8000-000000000011'),
  0::numeric,
  'a voided allocation does not remain in invoice paid'
);

select throws_ok(
  $$
    select public.link_unapplied_payment_to_invoice(
      (select payment_id from link_fixture),
      '02400000-0000-4000-8000-000000000013'::uuid
    )
  $$,
  '23514',
  'Choose an open invoice for the same project.',
  'linking a voided allocation to another project fails'
);

select is(
  (select status from public.invoice_payments where id = (select allocation_id from link_fixture)),
  'Voided',
  'a rejected link leaves the voided allocation unchanged'
);
select is(
  (select invoice_id from public.payments_received where id = (select payment_id from link_fixture)),
  '02400000-0000-4000-8000-000000000011'::uuid,
  'a rejected link does not move the receipt pointer'
);
select is(
  (select invoice_id from public.deposits where payment_id = (select payment_id from link_fixture)),
  '02400000-0000-4000-8000-000000000011'::uuid,
  'a rejected link does not move the deposit pointer'
);
select is(
  (select paid_total from public.invoices where id = '02400000-0000-4000-8000-000000000013'),
  0::numeric,
  'a rejected link does not change the other invoice paid total'
);

create temp table link_results (result jsonb);
insert into link_results (result)
select public.link_unapplied_payment_to_invoice(
  (select payment_id from link_fixture),
  '02400000-0000-4000-8000-000000000012'::uuid
);

select is(
  (select result->>'invoice_payment_id' from link_results),
  (select allocation_id::text from link_fixture),
  'reactivation updates the existing voided allocation'
);
select is(
  (select (result->>'already_applied')::boolean from link_results),
  false,
  'reactivation is a new posted allocation'
);
select is(
  (select status from public.invoice_payments where id = (select allocation_id from link_fixture)),
  'Posted',
  'reactivated allocation is posted'
);
select is(
  (select invoice_id from public.invoice_payments where id = (select allocation_id from link_fixture)),
  '02400000-0000-4000-8000-000000000012'::uuid,
  'reactivated allocation moves to the target invoice'
);
select is(
  (select paid_at from public.invoice_payments where id = (select allocation_id from link_fixture)),
  '2026-09-04'::date,
  'reactivation sets paid_at from the receipt'
);
select is(
  (select payment_date from public.invoice_payments where id = (select allocation_id from link_fixture)),
  '2026-09-04'::date,
  'reactivation sets payment_date from the receipt'
);
select is(
  (select count(*) from public.invoice_payments where payment_received_id = (select payment_id from link_fixture)),
  1::bigint,
  'reactivation does not insert a second allocation'
);
select is(
  (select invoice_id from public.payments_received where id = (select payment_id from link_fixture)),
  '02400000-0000-4000-8000-000000000012'::uuid,
  'reactivation moves the receipt onto the target invoice'
);
select is(
  (select invoice_id from public.deposits where payment_id = (select payment_id from link_fixture)),
  '02400000-0000-4000-8000-000000000012'::uuid,
  'reactivation moves the deposit onto the target invoice'
);
select is(
  (select paid_total from public.invoices where id = '02400000-0000-4000-8000-000000000012'),
  25::numeric,
  'the target invoice paid total includes the reactivated allocation'
);
select is(
  (select balance_due from public.invoices where id = '02400000-0000-4000-8000-000000000012'),
  75::numeric,
  'the target invoice balance excludes the reactivated allocation'
);
select is(
  (select paid_total from public.invoices where id = '02400000-0000-4000-8000-000000000011'),
  0::numeric,
  'the original invoice stays unpaid after the voided allocation moves'
);

insert into link_results (result)
select public.link_unapplied_payment_to_invoice(
  (select payment_id from link_fixture),
  '02400000-0000-4000-8000-000000000012'::uuid
);

select is(
  (select (result->>'already_applied')::boolean from link_results order by ctid desc limit 1),
  true,
  'linking the posted allocation again is idempotent'
);
select is(
  (select paid_total from public.invoices where id = '02400000-0000-4000-8000-000000000012'),
  25::numeric,
  'an idempotent link does not double the paid total'
);
select is(
  (select count(*) from public.invoice_payments where payment_received_id = (select payment_id from link_fixture)),
  1::bigint,
  'an idempotent link keeps a single allocation'
);

select public.record_payment_received_atomic(
  'link-already-posted',
  '02400000-0000-4000-8000-000000000011',
  '02400000-0000-4000-8000-000000000001',
  'Link Customer',
  '2026-09-05',
  10,
  'ACH',
  'Operating',
  'Already posted',
  null
);

select throws_ok(
  $$
    select public.link_unapplied_payment_to_invoice(
      (select id from public.payments_received where idempotency_key = 'link-already-posted'),
      '02400000-0000-4000-8000-000000000012'::uuid
    )
  $$,
  '23514',
  'This payment is already applied to another invoice.',
  'a posted allocation cannot be relinked by pretending it is unapplied'
);
select is(
  (select invoice_id from public.payments_received where idempotency_key = 'link-already-posted'),
  '02400000-0000-4000-8000-000000000011'::uuid,
  'a rejected relink leaves the posted receipt on its invoice'
);
select is(
  (select paid_total from public.invoices where id = '02400000-0000-4000-8000-000000000011'),
  10::numeric,
  'a rejected relink leaves the posted amount on the original invoice'
);

select throws_ok(
  $$
    update public.invoice_payments
    set invoice_id = '02400000-0000-4000-8000-000000000012'::uuid
    where payment_received_id = (
      select id from public.payments_received where idempotency_key = 'link-already-posted'
    )
  $$,
  '23514',
  'Invoice allocation reassignment is not permitted.',
  'posted allocations still cannot move between invoices'
);

insert into public.payments_received (
  id,
  invoice_id,
  project_id,
  customer_name,
  payment_date,
  amount,
  payment_method,
  notes,
  status
)
values (
  '02400000-0000-4000-8000-000000000021',
  '02400000-0000-4000-8000-000000000014',
  '02400000-0000-4000-8000-000000000001',
  'Link Customer',
  '2026-09-12',
  15,
  'Check',
  'Fresh link',
  'completed'
);

select is(
  (
    select count(*)
    from public.invoice_payments
    where payment_received_id = '02400000-0000-4000-8000-000000000021'
  ),
  0::bigint,
  'a fresh receipt starts with no allocation'
);

insert into link_results (result)
select public.link_unapplied_payment_to_invoice(
  '02400000-0000-4000-8000-000000000021',
  '02400000-0000-4000-8000-000000000015'
);

select is(
  (select result->>'invoice_payment_id' is not null from link_results order by ctid desc limit 1),
  true,
  'a receipt with no allocation gets a posted allocation id'
);
select is(
  (
    select status
    from public.invoice_payments
    where payment_received_id = '02400000-0000-4000-8000-000000000021'
  ),
  'Posted',
  'a fresh link posts the allocation'
);
select is(
  (
    select paid_at
    from public.invoice_payments
    where payment_received_id = '02400000-0000-4000-8000-000000000021'
  ),
  '2026-09-12'::date,
  'a fresh link sets paid_at'
);
select is(
  (
    select payment_date
    from public.invoice_payments
    where payment_received_id = '02400000-0000-4000-8000-000000000021'
  ),
  '2026-09-12'::date,
  'a fresh link sets payment_date'
);
select is(
  (select invoice_id from public.payments_received where id = '02400000-0000-4000-8000-000000000021'),
  '02400000-0000-4000-8000-000000000015'::uuid,
  'a fresh link moves the receipt pointer'
);
select is(
  (select invoice_id from public.deposits where payment_id = '02400000-0000-4000-8000-000000000021'),
  '02400000-0000-4000-8000-000000000015'::uuid,
  'a fresh link moves the deposit pointer'
);
select is(
  (select paid_total from public.invoices where id = '02400000-0000-4000-8000-000000000015'),
  15::numeric,
  'a fresh link updates the target invoice paid total'
);
select is(
  (select paid_total from public.invoices where id = '02400000-0000-4000-8000-000000000014'),
  0::numeric,
  'a fresh link does not leave paid amount on the previous invoice pointer'
);

select * from finish();

rollback;
