\set ON_ERROR_STOP on

begin;

do $test$
declare
  v_estimate_id constant uuid := '11111111-1111-4111-8111-111111111163';
  v_subtotal numeric;
  v_tax numeric;
  v_discount numeric;
  v_total numeric;
  v_deposit numeric;
  v_final numeric;
  v_remaining numeric;
  v_before_tax numeric;
  v_count integer;
  v_orders integer[];
  v_field text;
begin
  if (
    select p.prosecdef
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'update_estimate_meta_atomic'
      and p.proargtypes = '2950 3802'::pg_catalog.oidvector
  ) is distinct from false then
    raise exception 'RPC must remain SECURITY INVOKER.';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.update_estimate_meta_atomic(uuid,jsonb)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.update_estimate_meta_atomic(uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'Browser-facing roles must not execute the atomic Estimate RPC.';
  end if;
  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.update_estimate_meta_atomic(uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'service_role must be able to execute the atomic Estimate RPC.';
  end if;

  insert into public.estimates (id, number, client, project, status)
  values (v_estimate_id, 'EST-P0-0063', 'Financial Baseline', 'Persistence Hardening', 'Draft');

  insert into public.estimate_meta (
    estimate_id,
    client_name,
    project_name,
    tax,
    discount,
    overhead_pct,
    profit_pct
  ) values (
    v_estimate_id,
    'Financial Baseline',
    'Persistence Hardening',
    48.06,
    106.81,
    0.05,
    0.10
  );

  insert into public.estimate_items (
    estimate_id,
    cost_code,
    "desc",
    qty,
    unit,
    unit_cost,
    markup_pct,
    sort_order,
    status
  ) values (
    v_estimate_id,
    '010000',
    'EST-0063 financial baseline',
    1,
    'EA',
    1020.01,
    0,
    0,
    'included'
  );

  insert into public.estimate_payment_schedule_items (
    estimate_id,
    sort_order,
    title,
    amount,
    status
  ) values
    (v_estimate_id, 0, 'Deposit', 384.50, 'paid'),
    (v_estimate_id, 1, 'Final', 576.76, 'paid');

  select
    sum(i.qty * i.unit_cost),
    m.tax,
    m.discount,
    sum(i.qty * i.unit_cost) + m.tax - m.discount,
    max(s.amount) filter (where s.title = 'Deposit'),
    max(s.amount) filter (where s.title = 'Final'),
    sum(i.qty * i.unit_cost) + m.tax - m.discount - sum(s.amount)
  into
    v_subtotal,
    v_tax,
    v_discount,
    v_total,
    v_deposit,
    v_final,
    v_remaining
  from public.estimate_meta as m
  join public.estimate_items as i on i.estimate_id = m.estimate_id
  join public.estimate_payment_schedule_items as s on s.estimate_id = m.estimate_id
  where m.estimate_id = v_estimate_id
  group by m.tax, m.discount;

  -- The schedule join duplicates the single item once per milestone, so the
  -- authoritative subtotal is read independently before asserting the ledger.
  select sum(i.qty * i.unit_cost)
  into v_subtotal
  from public.estimate_items as i
  where i.estimate_id = v_estimate_id;
  v_total := v_subtotal + v_tax - v_discount;
  v_remaining := v_total - v_deposit - v_final;

  if row(v_subtotal, v_tax, v_discount, v_total, v_deposit, v_final, v_remaining)
    is distinct from row(1020.01::numeric, 48.06::numeric, 106.81::numeric, 961.26::numeric, 384.50::numeric, 576.76::numeric, 0.00::numeric)
  then
    raise exception 'EST-0063 baseline mismatch before atomic persistence verification.';
  end if;

  -- Normal success: all related Estimate surfaces change in one RPC.
  perform *
  from public.update_estimate_meta_atomic(
    v_estimate_id,
    jsonb_build_object(
      'client_name', 'Financial Baseline Updated',
      'project_name', 'Persistence Hardening Updated',
      'tax', 48.06,
      'discount', 106.81,
      'notes', 'Atomic success',
      'document_style', 'itemized',
      'category_names', jsonb_build_array(
        jsonb_build_object('cost_code', '020000', 'display_name', 'Second section'),
        jsonb_build_object('cost_code', '010000', 'display_name', 'First section')
      )
    )
  );

  if not exists (
    select 1
    from public.estimates as e
    join public.estimate_meta as m on m.estimate_id = e.id
    where e.id = v_estimate_id
      and e.client = 'Financial Baseline Updated'
      and e.project = 'Persistence Hardening Updated'
      and m.client_name = 'Financial Baseline Updated'
      and m.project_name = 'Persistence Hardening Updated'
      and m.notes = 'Atomic success'
      and m.cost_category_names #>> '{__hh,documentStyle}' = 'itemized'
  ) then
    raise exception 'Normal atomic Estimate persistence did not save every surface.';
  end if;

  -- Legitimate numeric zero remains distinguishable from missing input.
  perform *
  from public.update_estimate_meta_atomic(v_estimate_id, '{"tax":0,"discount":0}'::jsonb);
  select m.tax, m.discount into v_tax, v_discount
  from public.estimate_meta as m where m.estimate_id = v_estimate_id;
  if row(v_tax, v_discount) is distinct from row(0::numeric, 0::numeric) then
    raise exception 'Legitimate financial zero was not preserved.';
  end if;

  perform *
  from public.update_estimate_meta_atomic(
    v_estimate_id,
    '{"tax":48.06,"discount":106.81}'::jsonb
  );

  -- Malformed tax and discount fail without changing persisted amounts.
  foreach v_field in array array['tax', 'discount'] loop
    begin
      perform *
      from public.update_estimate_meta_atomic(
        v_estimate_id,
        jsonb_build_object(v_field, 'not-a-number')
      );
      raise exception 'Malformed % unexpectedly succeeded.', v_field;
    exception
      when sqlstate '22023' then null;
    end;
  end loop;
  if not exists (
    select 1 from public.estimate_meta as m
    where m.estimate_id = v_estimate_id and m.tax = 48.06 and m.discount = 106.81
  ) then
    raise exception 'Malformed financial input changed persisted amounts.';
  end if;

  -- Force a failure after estimate_meta is updated. The bad customer FK makes
  -- the later estimates update fail, and PostgreSQL must roll back the tax write.
  select m.tax into v_before_tax
  from public.estimate_meta as m where m.estimate_id = v_estimate_id;
  begin
    perform *
    from public.update_estimate_meta_atomic(
      v_estimate_id,
      '{"tax":99.99,"customer_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}'::jsonb
    );
    raise exception 'Forced partial-write failure unexpectedly succeeded.';
  exception
    when foreign_key_violation then null;
  end;
  if (select m.tax from public.estimate_meta as m where m.estimate_id = v_estimate_id)
    is distinct from v_before_tax
  then
    raise exception 'Partial-write failure did not roll back estimate_meta.';
  end if;

  -- Deterministic retry and duplicate retry converge on one persisted state.
  perform *
  from public.update_estimate_meta_atomic(
    v_estimate_id,
    '{"tax":48.06,"discount":106.81,"category_names":[{"cost_code":"020000","display_name":"Second section"},{"cost_code":"010000","display_name":"First section"}]}'::jsonb
  );
  perform *
  from public.update_estimate_meta_atomic(
    v_estimate_id,
    '{"tax":48.06,"discount":106.81,"category_names":[{"cost_code":"020000","display_name":"Second section"},{"cost_code":"010000","display_name":"First section"}]}'::jsonb
  );

  select count(*), array_agg(c.order_index order by c.cost_code)
  into v_count, v_orders
  from public.estimate_categories as c
  where c.estimate_id = v_estimate_id
    and c.cost_code in ('010000', '020000');
  if v_count <> 2 or v_orders is distinct from array[1, 0] then
    raise exception 'Duplicate retry changed category cardinality or order: count %, orders %.', v_count, v_orders;
  end if;

  -- A non-editable status fails before any financial write.
  update public.estimates set status = 'Approved' where id = v_estimate_id;
  begin
    perform *
    from public.update_estimate_meta_atomic(v_estimate_id, '{"tax":1}'::jsonb);
    raise exception 'Approved Estimate mutation unexpectedly succeeded.';
  exception
    when sqlstate '55000' then null;
  end;
  if (select m.tax from public.estimate_meta as m where m.estimate_id = v_estimate_id) <> 48.06 then
    raise exception 'Rejected status mutation changed financial data.';
  end if;

  -- Re-read every baseline value from persisted rows after all retries.
  select
    sum(i.qty * i.unit_cost),
    m.tax,
    m.discount
  into v_subtotal, v_tax, v_discount
  from public.estimate_meta as m
  join public.estimate_items as i on i.estimate_id = m.estimate_id
  where m.estimate_id = v_estimate_id
  group by m.tax, m.discount;
  select s.amount into v_deposit
  from public.estimate_payment_schedule_items as s
  where s.estimate_id = v_estimate_id and s.title = 'Deposit';
  select s.amount into v_final
  from public.estimate_payment_schedule_items as s
  where s.estimate_id = v_estimate_id and s.title = 'Final';
  v_total := v_subtotal + v_tax - v_discount;
  v_remaining := v_total - v_deposit - v_final;
  if row(v_subtotal, v_tax, v_discount, v_total, v_deposit, v_final, v_remaining)
    is distinct from row(1020.01::numeric, 48.06::numeric, 106.81::numeric, 961.26::numeric, 384.50::numeric, 576.76::numeric, 0.00::numeric)
  then
    raise exception 'Unexpected EST-0063 financial delta after retries.';
  end if;
  raise notice
    'EST-0063 verified: Subtotal %, Tax %, Discount %, Total %, Deposit %, Final %, Remaining %; unexpected delta ZERO.',
    v_subtotal,
    v_tax,
    v_discount,
    v_total,
    v_deposit,
    v_final,
    v_remaining;
end
$test$;

rollback;
