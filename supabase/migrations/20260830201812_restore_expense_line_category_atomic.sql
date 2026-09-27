begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.expense_lines
  add column if not exists category text;

update public.expense_lines el
set category = coalesce(nullif(btrim(e.category), ''), 'Other')
from public.expenses e
where e.id = el.expense_id
  and (el.category is null or btrim(el.category) = '');

update public.expense_lines
set category = 'Other'
where category is null or btrim(category) = '';

alter table public.expense_lines
  alter column category set default 'Other';

alter table public.expense_lines
  drop constraint if exists expense_lines_category_not_null;

alter table public.expense_lines
  add constraint expense_lines_category_not_null
  check (category is not null) not valid;

commit;

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.expense_lines
  validate constraint expense_lines_category_not_null;

commit;

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

comment on column public.expense_lines.category is
  'Canonical expense category for this individual line; mixed-category expenses retain one value per line.';

create or replace function public.create_expense_atomic(
  p_idempotency_key text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_fingerprint text;
  v_groups jsonb;
  v_group jsonb;
  v_lines jsonb;
  v_line jsonb;
  v_deduction jsonb;
  v_group_count integer;
  v_group_index integer := 0;
  v_line_count integer;
  v_existing_count integer;
  v_expense_id uuid;
  v_first_expense_id uuid;
  v_expense_ids uuid[] := array[]::uuid[];
  v_total numeric;
  v_line_amount numeric;
  v_project_id uuid;
  v_subcontract_id uuid;
  v_subcontractor_id uuid;
  v_deduction_project_id uuid;
  v_deduction_amount numeric;
begin
  if v_key = '' then
    raise exception using errcode = '22023', message = 'Expense idempotency key is required.';
  end if;
  if length(v_key) > 200 then
    raise exception using errcode = '22023', message = 'Expense idempotency key is too long.';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Expense payload must be a JSON object.';
  end if;

  v_groups := p_payload->'groups';
  if v_groups is null or jsonb_typeof(v_groups) <> 'array' or jsonb_array_length(v_groups) = 0 then
    raise exception using errcode = '22023', message = 'Expense payload requires at least one project group.';
  end if;
  v_group_count := jsonb_array_length(v_groups);
  v_fingerprint := encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_key, 0));

  select count(*)
  into v_existing_count
  from public.expenses e
  where e.idempotency_key = v_key;

  if v_existing_count > 0 then
    if exists (
      select 1
      from public.expenses e
      where e.idempotency_key = v_key
        and e.idempotency_fingerprint is distinct from v_fingerprint
    ) then
      raise exception using errcode = '23505', message = 'Expense idempotency key was reused with a different payload.';
    end if;
    if v_existing_count <> v_group_count or exists (
      select 1
      from public.expenses e
      where e.idempotency_key = v_key
        and (
          e.idempotency_completed_at is null
          or e.idempotency_group_count is distinct from v_group_count
          or e.idempotency_group_index is null
          or e.line_count is distinct from (
            select count(*)::integer from public.expense_lines el where el.expense_id = e.id
          )
          or e.amount is distinct from (
            select round(coalesce(sum(coalesce(el.amount, el.total)), 0), 2)
            from public.expense_lines el where el.expense_id = e.id
          )
          or e.total is distinct from (
            select round(coalesce(sum(coalesce(el.amount, el.total)), 0), 2)
            from public.expense_lines el where el.expense_id = e.id
          )
        )
    ) then
      raise exception using errcode = '23514', message = 'Existing expense idempotency result is incomplete.';
    end if;

    select array_agg(e.id order by e.idempotency_group_index)
    into v_expense_ids
    from public.expenses e
    where e.idempotency_key = v_key;
    return jsonb_build_object(
      'expense_id', v_expense_ids[1],
      'expense_ids', to_jsonb(v_expense_ids),
      'replayed', true
    );
  end if;

  if btrim(coalesce(p_payload->>'vendorName', '')) = '' then
    raise exception using errcode = '22023', message = 'Vendor name is required.';
  end if;

  for v_group in select value from jsonb_array_elements(v_groups)
  loop
    v_group_index := v_group_index + 1;
    v_lines := v_group->'lines';
    if v_lines is null or jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) = 0 then
      raise exception using errcode = '22023', message = 'Each expense group requires at least one line.';
    end if;
    v_line_count := jsonb_array_length(v_lines);
    v_total := 0;
    for v_line in select value from jsonb_array_elements(v_lines)
    loop
      begin
        v_line_amount := nullif(v_line->>'amount', '')::numeric;
      exception when invalid_text_representation then
        raise exception using errcode = '22023', message = 'Expense line amount must be a valid number.';
      end;
      if v_line_amount is null or v_line_amount::text in ('NaN', 'Infinity', '-Infinity') then
        raise exception using errcode = '22023', message = 'Expense line amount must be a valid number.';
      end if;
      v_total := v_total + v_line_amount;
    end loop;
    v_total := round(v_total, 2);
    if v_total < 0 then
      raise exception using errcode = '22023', message = 'Expense total cannot be negative.';
    end if;

    v_project_id := nullif(v_group->>'projectId', '')::uuid;
    insert into public.expenses (
      expense_date,
      vendor_name,
      vendor,
      payment_method,
      reference_no,
      notes,
      receipt_url,
      total,
      amount,
      line_count,
      status,
      card_name,
      account_id,
      payment_account_id,
      project_id,
      category,
      cost_code,
      source_type,
      source,
      source_id,
      idempotency_key,
      idempotency_fingerprint,
      idempotency_group_index,
      idempotency_group_count
    ) values (
      nullif(p_payload->>'expenseDate', '')::date,
      btrim(p_payload->>'vendorName'),
      btrim(p_payload->>'vendorName'),
      nullif(btrim(coalesce(p_payload->>'paymentMethod', '')), ''),
      nullif(btrim(coalesce(p_payload->>'referenceNo', '')), ''),
      nullif(p_payload->>'notes', ''),
      nullif(p_payload->>'receiptUrl', ''),
      v_total,
      v_total,
      v_line_count,
      coalesce(nullif(p_payload->>'status', ''), 'pending'),
      nullif(btrim(coalesce(p_payload->>'cardName', '')), ''),
      nullif(p_payload->>'accountId', '')::uuid,
      nullif(p_payload->>'paymentAccountId', '')::uuid,
      v_project_id,
      nullif(v_lines->0->>'category', ''),
      nullif(v_lines->0->>'costCode', ''),
      coalesce(nullif(p_payload->>'sourceType', ''), 'company'),
      nullif(p_payload->>'source', ''),
      nullif(p_payload->>'sourceId', ''),
      v_key,
      v_fingerprint,
      v_group_index,
      v_group_count
    )
    returning id into v_expense_id;

    if v_first_expense_id is null then
      v_first_expense_id := v_expense_id;
    end if;
    v_expense_ids := array_append(v_expense_ids, v_expense_id);

    for v_line in select value from jsonb_array_elements(v_lines)
    loop
      v_line_amount := (v_line->>'amount')::numeric;
      insert into public.expense_lines (
        expense_id,
        project_id,
        category,
        cost_code,
        description,
        qty,
        unit_cost,
        amount,
        total
      ) values (
        v_expense_id,
        nullif(v_line->>'projectId', '')::uuid,
        coalesce(nullif(v_line->>'category', ''), 'Other'),
        nullif(v_line->>'costCode', ''),
        nullif(v_line->>'memo', ''),
        1,
        v_line_amount,
        v_line_amount,
        v_line_amount
      );
    end loop;
  end loop;

  v_deduction := p_payload->'deduction';
  if v_deduction is not null and jsonb_typeof(v_deduction) = 'object' then
    v_deduction_amount := nullif(v_deduction->>'amount', '')::numeric;
    if v_deduction_amount is null or v_deduction_amount <= 0 then
      raise exception using errcode = '22023', message = 'Deduction amount must be greater than 0.';
    end if;
    v_deduction_project_id := nullif(v_deduction->>'projectId', '')::uuid;
    if v_deduction_project_id is null then
      raise exception using errcode = '22023', message = 'Choose a project before deducting from a subcontractor.';
    end if;
    v_subcontract_id := nullif(v_deduction->>'subcontractId', '')::uuid;
    v_subcontractor_id := nullif(v_deduction->>'subcontractorId', '')::uuid;

    if v_subcontract_id is not null then
      select s.subcontractor_id
      into v_subcontractor_id
      from public.subcontracts s
      where s.id = v_subcontract_id
        and s.project_id = v_deduction_project_id;
      if not found then
        raise exception using errcode = '22023', message = 'Selected subcontract was not found for this project.';
      end if;
    elsif v_subcontractor_id is not null then
      select s.id
      into v_subcontract_id
      from public.subcontracts s
      where s.project_id = v_deduction_project_id
        and s.subcontractor_id = v_subcontractor_id
      order by s.created_at desc
      limit 1;
      if not found then
        raise exception using errcode = '22023', message = 'Selected subcontractor does not have a subcontract on this project.';
      end if;
    else
      raise exception using errcode = '22023', message = 'Choose a subcontractor for this deduction.';
    end if;

    insert into public.subcontract_deductions (
      expense_id,
      project_id,
      subcontractor_id,
      subcontract_id,
      amount,
      note
    ) values (
      v_first_expense_id,
      v_deduction_project_id,
      v_subcontractor_id,
      v_subcontract_id,
      v_deduction_amount,
      nullif(v_deduction->>'note', '')
    );
  end if;

  update public.expenses e
  set idempotency_completed_at = clock_timestamp()
  where e.idempotency_key = v_key;

  return jsonb_build_object(
    'expense_id', v_first_expense_id,
    'expense_ids', to_jsonb(v_expense_ids),
    'replayed', false
  );
end;
$$;

create or replace function public.update_expense_atomic(
  p_expense_id uuid,
  p_header_patch jsonb,
  p_line_patch jsonb,
  p_apply_deduction boolean,
  p_deduction jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_line_id uuid;
  v_line_amount numeric;
  v_line_count integer;
  v_total numeric;
  v_subcontract_id uuid;
  v_subcontractor_id uuid;
  v_project_id uuid;
  v_deduction_amount numeric;
  v_result jsonb;
begin
  perform 1 from public.expenses e where e.id = p_expense_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Expense not found.';
  end if;

  p_header_patch := coalesce(p_header_patch, '{}'::jsonb);
  p_line_patch := coalesce(p_line_patch, '{}'::jsonb);
  if jsonb_typeof(p_header_patch) <> 'object' or jsonb_typeof(p_line_patch) <> 'object' then
    raise exception using errcode = '22023', message = 'Expense update patches must be JSON objects.';
  end if;

  update public.expenses e
  set
    expense_date = case when p_header_patch ? 'expenseDate' then nullif(p_header_patch->>'expenseDate', '')::date else e.expense_date end,
    vendor_name = case when p_header_patch ? 'vendorName' then nullif(btrim(coalesce(p_header_patch->>'vendorName', '')), '') else e.vendor_name end,
    vendor = case when p_header_patch ? 'vendorName' then nullif(btrim(coalesce(p_header_patch->>'vendorName', '')), '') else e.vendor end,
    payment_method = case when p_header_patch ? 'paymentMethod' then nullif(btrim(coalesce(p_header_patch->>'paymentMethod', '')), '') else e.payment_method end,
    reference_no = case when p_header_patch ? 'referenceNo' then nullif(btrim(coalesce(p_header_patch->>'referenceNo', '')), '') else e.reference_no end,
    notes = case when p_header_patch ? 'notes' then nullif(p_header_patch->>'notes', '') else e.notes end,
    status = case when p_header_patch ? 'status' then nullif(p_header_patch->>'status', '') else e.status end,
    worker_id = case when p_header_patch ? 'workerId' then nullif(p_header_patch->>'workerId', '')::uuid else e.worker_id end,
    source_type = case when p_header_patch ? 'sourceType' then nullif(p_header_patch->>'sourceType', '') else e.source_type end,
    source = case when p_header_patch ? 'source' then nullif(p_header_patch->>'source', '') else e.source end,
    source_id = case when p_header_patch ? 'sourceId' then nullif(p_header_patch->>'sourceId', '') else e.source_id end,
    card_name = case when p_header_patch ? 'cardName' then nullif(btrim(coalesce(p_header_patch->>'cardName', '')), '') else e.card_name end,
    account_id = case when p_header_patch ? 'accountId' then nullif(p_header_patch->>'accountId', '')::uuid else e.account_id end,
    payment_account_id = case when p_header_patch ? 'paymentAccountId' then nullif(p_header_patch->>'paymentAccountId', '')::uuid else e.payment_account_id end,
    project_id = case when p_header_patch ? 'projectId' then nullif(p_header_patch->>'projectId', '')::uuid else e.project_id end,
    category = case when p_line_patch ? 'category' then nullif(p_line_patch->>'category', '') else e.category end,
    cost_code = case when p_line_patch ? 'costCode' then nullif(p_line_patch->>'costCode', '') else e.cost_code end
  where e.id = p_expense_id;

  if p_line_patch <> '{}'::jsonb then
    v_line_id := nullif(p_line_patch->>'lineId', '')::uuid;
    if v_line_id is null then
      select el.id into v_line_id
      from public.expense_lines el
      where el.expense_id = p_expense_id
      order by el.id
      limit 1
      for update;
    else
      perform 1 from public.expense_lines el
      where el.id = v_line_id and el.expense_id = p_expense_id
      for update;
    end if;
    if v_line_id is null or not found then
      raise exception using errcode = 'P0002', message = 'Expense line not found.';
    end if;
    if p_line_patch ? 'amount' then
      begin
        v_line_amount := nullif(p_line_patch->>'amount', '')::numeric;
      exception when invalid_text_representation then
        raise exception using errcode = '22023', message = 'Expense line amount must be a valid number.';
      end;
      if v_line_amount is null or v_line_amount::text in ('NaN', 'Infinity', '-Infinity') then
        raise exception using errcode = '22023', message = 'Expense line amount must be a valid number.';
      end if;
    end if;
    update public.expense_lines el
    set
      project_id = case when p_line_patch ? 'projectId' then nullif(p_line_patch->>'projectId', '')::uuid else el.project_id end,
      category = case when p_line_patch ? 'category' then coalesce(nullif(p_line_patch->>'category', ''), 'Other') else el.category end,
      cost_code = case when p_line_patch ? 'costCode' then nullif(p_line_patch->>'costCode', '') else el.cost_code end,
      description = case when p_line_patch ? 'memo' then nullif(p_line_patch->>'memo', '') else el.description end,
      amount = case when p_line_patch ? 'amount' then v_line_amount else el.amount end,
      total = case when p_line_patch ? 'amount' then v_line_amount else el.total end,
      unit_cost = case when p_line_patch ? 'amount' then v_line_amount else el.unit_cost end
    where el.id = v_line_id and el.expense_id = p_expense_id;
  end if;

  select count(*)::integer, round(coalesce(sum(coalesce(el.amount, el.total)), 0), 2)
  into v_line_count, v_total
  from public.expense_lines el
  where el.expense_id = p_expense_id;
  if v_line_count > 0 then
    update public.expenses e
    set amount = v_total, total = v_total, line_count = v_line_count
    where e.id = p_expense_id;
  end if;

  if coalesce(p_apply_deduction, false) then
    if p_deduction is null or jsonb_typeof(p_deduction) = 'null' then
      delete from public.subcontract_deductions sd where sd.expense_id = p_expense_id;
    elsif jsonb_typeof(p_deduction) <> 'object' then
      raise exception using errcode = '22023', message = 'Expense deduction must be a JSON object or null.';
    else
      v_deduction_amount := nullif(p_deduction->>'amount', '')::numeric;
      if v_deduction_amount is null or v_deduction_amount <= 0 then
        raise exception using errcode = '22023', message = 'Deduction amount must be greater than 0.';
      end if;
      v_project_id := nullif(p_deduction->>'projectId', '')::uuid;
      if v_project_id is null then
        raise exception using errcode = '22023', message = 'Choose a project before deducting from a subcontractor.';
      end if;
      v_subcontract_id := nullif(p_deduction->>'subcontractId', '')::uuid;
      v_subcontractor_id := nullif(p_deduction->>'subcontractorId', '')::uuid;
      if v_subcontract_id is not null then
        select s.subcontractor_id into v_subcontractor_id
        from public.subcontracts s
        where s.id = v_subcontract_id and s.project_id = v_project_id;
        if not found then
          raise exception using errcode = '22023', message = 'Selected subcontract was not found for this project.';
        end if;
      elsif v_subcontractor_id is not null then
        select s.id into v_subcontract_id
        from public.subcontracts s
        where s.project_id = v_project_id and s.subcontractor_id = v_subcontractor_id
        order by s.created_at desc
        limit 1;
        if not found then
          raise exception using errcode = '22023', message = 'Selected subcontractor does not have a subcontract on this project.';
        end if;
      else
        raise exception using errcode = '22023', message = 'Choose a subcontractor for this deduction.';
      end if;
      insert into public.subcontract_deductions (
        expense_id, project_id, subcontractor_id, subcontract_id, amount, note
      ) values (
        p_expense_id, v_project_id, v_subcontractor_id, v_subcontract_id,
        v_deduction_amount, nullif(p_deduction->>'note', '')
      )
      on conflict (expense_id) do update set
        project_id = excluded.project_id,
        subcontractor_id = excluded.subcontractor_id,
        subcontract_id = excluded.subcontract_id,
        amount = excluded.amount,
        note = excluded.note;
    end if;
  end if;

  select to_jsonb(e) || jsonb_build_object('expense_id', e.id)
  into v_result
  from public.expenses e
  where e.id = p_expense_id;
  return v_result;
end;
$$;

create or replace function public.mutate_expense_line_atomic(
  p_expense_id uuid,
  p_operation text,
  p_line_id uuid,
  p_line_patch jsonb,
  p_preserve_last_line boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_operation text := lower(btrim(coalesce(p_operation, '')));
  v_patch jsonb := coalesce(p_line_patch, '{}'::jsonb);
  v_line_id uuid := p_line_id;
  v_amount numeric;
  v_total numeric;
  v_line_count integer;
  v_result_line jsonb;
begin
  perform 1 from public.expenses e where e.id = p_expense_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Expense not found.';
  end if;
  if jsonb_typeof(v_patch) <> 'object' then
    raise exception using errcode = '22023', message = 'Expense line patch must be a JSON object.';
  end if;
  if v_patch ? 'amount' then
    begin
      v_amount := nullif(v_patch->>'amount', '')::numeric;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'Expense line amount must be a valid number.';
    end;
    if v_amount is null or v_amount::text in ('NaN', 'Infinity', '-Infinity') then
      raise exception using errcode = '22023', message = 'Expense line amount must be a valid number.';
    end if;
  end if;

  if v_operation = 'add' then
    insert into public.expense_lines (
      expense_id, project_id, category, cost_code, description, qty, unit_cost, amount, total
    ) values (
      p_expense_id,
      nullif(v_patch->>'projectId', '')::uuid,
      coalesce(nullif(v_patch->>'category', ''), 'Other'),
      nullif(v_patch->>'costCode', ''),
      nullif(v_patch->>'memo', ''),
      1,
      coalesce(v_amount, 0),
      coalesce(v_amount, 0),
      coalesce(v_amount, 0)
    ) returning id into v_line_id;
  elsif v_operation = 'update' then
    if v_line_id is null then
      raise exception using errcode = '22023', message = 'Expense line is required.';
    end if;
    perform 1 from public.expense_lines el
    where el.id = v_line_id and el.expense_id = p_expense_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Expense line not found.';
    end if;
    update public.expense_lines el
    set
      project_id = case when v_patch ? 'projectId' then nullif(v_patch->>'projectId', '')::uuid else el.project_id end,
      category = case when v_patch ? 'category' then coalesce(nullif(v_patch->>'category', ''), 'Other') else el.category end,
      cost_code = case when v_patch ? 'costCode' then nullif(v_patch->>'costCode', '') else el.cost_code end,
      description = case when v_patch ? 'memo' then nullif(v_patch->>'memo', '') else el.description end,
      amount = case when v_patch ? 'amount' then v_amount else el.amount end,
      total = case when v_patch ? 'amount' then v_amount else el.total end,
      unit_cost = case when v_patch ? 'amount' then v_amount else el.unit_cost end
    where el.id = v_line_id and el.expense_id = p_expense_id;
  elsif v_operation = 'delete' then
    if v_line_id is null then
      raise exception using errcode = '22023', message = 'Expense line is required.';
    end if;
    perform 1 from public.expense_lines el
    where el.id = v_line_id and el.expense_id = p_expense_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Expense line not found.';
    end if;
    select count(*)::integer into v_line_count
    from public.expense_lines el where el.expense_id = p_expense_id;
    if coalesce(p_preserve_last_line, false) and v_line_count <= 1 then
      update public.expense_lines el
      set project_id = null, category = 'Other', cost_code = null, description = null, amount = 0, total = 0, unit_cost = 0
      where el.id = v_line_id and el.expense_id = p_expense_id;
    else
      delete from public.expense_lines el
      where el.id = v_line_id and el.expense_id = p_expense_id;
      v_line_id := null;
    end if;
  else
    raise exception using errcode = '22023', message = 'Unsupported expense line operation.';
  end if;

  if v_patch ? 'category' then
    update public.expenses e
    set category = coalesce(nullif(v_patch->>'category', ''), 'Other')
    where e.id = p_expense_id;
  end if;

  select count(*)::integer, round(coalesce(sum(coalesce(el.amount, el.total)), 0), 2)
  into v_line_count, v_total
  from public.expense_lines el
  where el.expense_id = p_expense_id;
  update public.expenses e
  set amount = v_total, total = v_total, line_count = v_line_count
  where e.id = p_expense_id;

  if v_line_id is not null then
    select jsonb_build_object(
      'id', el.id,
      'expense_id', el.expense_id,
      'project_id', el.project_id,
      'category', coalesce(el.category, 'Other'),
      'cost_code', el.cost_code,
      'memo', el.description,
      'amount', coalesce(el.amount, el.total, 0)
    ) into v_result_line
    from public.expense_lines el
    join public.expenses e on e.id = el.expense_id
    where el.id = v_line_id;
  end if;
  return jsonb_build_object('expense_id', p_expense_id, 'line', v_result_line, 'amount', v_total);
end;
$$;

create or replace function public.reconcile_bank_transaction_expense_atomic(
  p_idempotency_key text,
  p_bank_transaction_id uuid,
  p_vendor_name text,
  p_payment_method text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_payload jsonb;
  v_fingerprint text;
  v_bank public.bank_transactions%rowtype;
  v_expense_id uuid;
  v_line jsonb;
  v_line_amount numeric;
  v_total numeric := 0;
  v_header_total numeric;
  v_line_count integer;
  v_updated integer;
begin
  if v_key = '' then
    raise exception using errcode = '22023', message = 'Bank reconciliation idempotency key is required.';
  end if;
  if length(v_key) > 200 then
    raise exception using errcode = '22023', message = 'Bank reconciliation idempotency key is too long.';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception using errcode = '22023', message = 'Bank Expense reconciliation requires at least one line.';
  end if;
  v_payload := jsonb_build_object(
    'bankTransactionId', p_bank_transaction_id,
    'vendorName', btrim(coalesce(p_vendor_name, '')),
    'paymentMethod', btrim(coalesce(p_payment_method, '')),
    'lines', p_lines
  );
  v_fingerprint := encode(extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_key, 0));
  if exists (
    select 1 from public.bank_transactions b
    where b.reconcile_idempotency_key = v_key and b.id <> p_bank_transaction_id
  ) then
    raise exception using errcode = '23505', message = 'Bank reconciliation idempotency key was reused with a different payload.';
  end if;

  select * into v_bank
  from public.bank_transactions b
  where b.id = p_bank_transaction_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Bank transaction not found.';
  end if;

  if v_bank.reconcile_idempotency_key is not null then
    if v_bank.reconcile_idempotency_key <> v_key then
      raise exception using errcode = '23505', message = 'Bank transaction is already reconciled by a different request.';
    end if;
    if v_bank.reconcile_fingerprint is distinct from v_fingerprint then
      raise exception using errcode = '23505', message = 'Bank reconciliation idempotency key was reused with a different payload.';
    end if;
    v_expense_id := v_bank.linked_expense_id;
    if v_bank.status <> 'reconciled' or v_bank.reconcile_type <> 'Expense' or v_expense_id is null
      or not exists (
        select 1
        from public.expenses e
        where e.id = v_expense_id
          and e.source = 'bank_transaction'
          and e.source_id = p_bank_transaction_id::text
          and e.line_count = (select count(*)::integer from public.expense_lines el where el.expense_id = e.id)
          and e.amount = (select round(coalesce(sum(coalesce(el.amount, el.total)), 0), 2) from public.expense_lines el where el.expense_id = e.id)
          and e.total = (select round(coalesce(sum(coalesce(el.amount, el.total)), 0), 2) from public.expense_lines el where el.expense_id = e.id)
      )
    then
      raise exception using errcode = '23514', message = 'Existing bank reconciliation result is incomplete.';
    end if;
    return jsonb_build_object('expense_id', v_expense_id, 'bank_transaction_id', p_bank_transaction_id, 'replayed', true);
  end if;

  if v_bank.status <> 'unmatched' or v_bank.linked_expense_id is not null then
    raise exception using errcode = '23505', message = 'Bank transaction is already reconciled by a different request.';
  end if;
  if btrim(coalesce(p_vendor_name, '')) = '' then
    raise exception using errcode = '22023', message = 'Bank Expense vendor name is required.';
  end if;

  v_line_count := jsonb_array_length(p_lines);
  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    begin
      v_line_amount := nullif(v_line->>'amount', '')::numeric;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'Bank expense line amount must be a valid number.';
    end;
    if v_line_amount is null or v_line_amount::text in ('NaN', 'Infinity', '-Infinity') or v_line_amount < 0 then
      raise exception using errcode = '22023', message = 'Bank expense line amount must be a non-negative number.';
    end if;
    v_total := v_total + v_line_amount;
  end loop;
  if v_total <> abs(v_bank.amount) then
    raise exception using errcode = '22023', message = 'Bank expense lines must equal the absolute bank transaction amount.';
  end if;
  v_header_total := round(v_total, 2);

  insert into public.expenses (
    expense_date,
    vendor_name,
    vendor,
    payment_method,
    notes,
    total,
    amount,
    line_count,
    status,
    project_id,
    category,
    source_type,
    source,
    source_id
  ) values (
    v_bank.txn_date,
    btrim(p_vendor_name),
    btrim(p_vendor_name),
    coalesce(nullif(btrim(coalesce(p_payment_method, '')), ''), 'ACH'),
    v_bank.description,
    v_header_total,
    v_header_total,
    v_line_count,
    'pending',
    nullif(p_lines->0->>'projectId', '')::uuid,
    coalesce(nullif(p_lines->0->>'category', ''), 'Other'),
    'bank_import',
    'bank_transaction',
    p_bank_transaction_id::text
  ) returning id into v_expense_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_line_amount := (v_line->>'amount')::numeric;
    insert into public.expense_lines (
      expense_id, project_id, category, cost_code, description, qty, unit_cost, amount, total
    ) values (
      v_expense_id,
      nullif(v_line->>'projectId', '')::uuid,
      coalesce(nullif(v_line->>'category', ''), 'Other'),
      nullif(v_line->>'costCode', ''),
      nullif(v_line->>'memo', ''),
      1,
      v_line_amount,
      v_line_amount,
      v_line_amount
    );
  end loop;

  update public.bank_transactions b
  set
    status = 'reconciled',
    reconcile_type = 'Expense',
    reconciled_at = clock_timestamp(),
    linked_expense_id = v_expense_id,
    vendor_name = btrim(p_vendor_name),
    payment_method = coalesce(nullif(btrim(coalesce(p_payment_method, '')), ''), 'ACH'),
    reconcile_idempotency_key = v_key,
    reconcile_fingerprint = v_fingerprint
  where b.id = p_bank_transaction_id
    and b.status = 'unmatched'
    and b.linked_expense_id is null;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception using errcode = '40001', message = 'Bank transaction reconciliation lost its compare-and-set race.';
  end if;

  return jsonb_build_object('expense_id', v_expense_id, 'bank_transaction_id', p_bank_transaction_id, 'replayed', false);
end;
$$;

revoke all on function public.create_expense_atomic(text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.update_expense_atomic(uuid, jsonb, jsonb, boolean, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.mutate_expense_line_atomic(uuid, text, uuid, jsonb, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.reconcile_bank_transaction_expense_atomic(text, uuid, text, text, jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.create_expense_atomic(text, jsonb)
  to authenticated, service_role;
grant execute on function public.update_expense_atomic(uuid, jsonb, jsonb, boolean, jsonb)
  to authenticated, service_role;
grant execute on function public.mutate_expense_line_atomic(uuid, text, uuid, jsonb, boolean)
  to authenticated, service_role;
grant execute on function public.reconcile_bank_transaction_expense_atomic(text, uuid, text, text, jsonb)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
