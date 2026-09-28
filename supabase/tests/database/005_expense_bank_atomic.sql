begin;

select plan(83);

select has_function('public', 'create_expense_atomic', 'atomic expense create RPC exists');
select has_function('public', 'update_expense_atomic', 'atomic expense update RPC exists');
select has_function('public', 'mutate_expense_line_atomic', 'atomic expense-line mutation RPC exists');
select has_function('public', 'reconcile_bank_transaction_expense_atomic', 'atomic bank reconcile RPC exists');
select has_column('public', 'expense_lines', 'category', 'expense lines retain canonical category');
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.expense_lines'::regclass
      and c.conname = 'expense_lines_category_not_null'
      and c.contype = 'c'
      and c.convalidated
  ),
  'expense line category has a validated non-null check'
);
select col_default_is('public', 'expense_lines', 'category', 'Other', 'expense line category defaults to Other');

select is(pg_catalog.has_function_privilege('anon', 'public.create_expense_atomic(text,jsonb)', 'EXECUTE'), false, 'anon cannot create expenses atomically');
select is(pg_catalog.has_function_privilege('authenticated', 'public.create_expense_atomic(text,jsonb)', 'EXECUTE'), true, 'authenticated can create expenses atomically');
select is(pg_catalog.has_function_privilege('service_role', 'public.create_expense_atomic(text,jsonb)', 'EXECUTE'), true, 'service role can create expenses atomically');
select is(pg_catalog.has_function_privilege('anon', 'public.update_expense_atomic(uuid,jsonb,jsonb,boolean,jsonb)', 'EXECUTE'), false, 'anon cannot update expenses atomically');
select is(pg_catalog.has_function_privilege('authenticated', 'public.update_expense_atomic(uuid,jsonb,jsonb,boolean,jsonb)', 'EXECUTE'), true, 'authenticated can update expenses atomically');
select is(pg_catalog.has_function_privilege('service_role', 'public.update_expense_atomic(uuid,jsonb,jsonb,boolean,jsonb)', 'EXECUTE'), true, 'service role can update expenses atomically');
select is(pg_catalog.has_function_privilege('anon', 'public.mutate_expense_line_atomic(uuid,text,uuid,jsonb,boolean)', 'EXECUTE'), false, 'anon cannot mutate expense lines atomically');
select is(pg_catalog.has_function_privilege('authenticated', 'public.mutate_expense_line_atomic(uuid,text,uuid,jsonb,boolean)', 'EXECUTE'), true, 'authenticated can mutate expense lines atomically');
select is(pg_catalog.has_function_privilege('service_role', 'public.mutate_expense_line_atomic(uuid,text,uuid,jsonb,boolean)', 'EXECUTE'), true, 'service role can mutate expense lines atomically');
select is(pg_catalog.has_function_privilege('anon', 'public.reconcile_bank_transaction_expense_atomic(text,uuid,text,text,jsonb)', 'EXECUTE'), false, 'anon cannot reconcile bank transactions');
select is(pg_catalog.has_function_privilege('authenticated', 'public.reconcile_bank_transaction_expense_atomic(text,uuid,text,text,jsonb)', 'EXECUTE'), true, 'authenticated can reconcile bank transactions');
select is(pg_catalog.has_function_privilege('service_role', 'public.reconcile_bank_transaction_expense_atomic(text,uuid,text,text,jsonb)', 'EXECUTE'), true, 'service role can reconcile bank transactions');

insert into public.projects (id, name)
values ('33333333-3333-3333-3333-333333333301', 'Atomic Expense Project')
on conflict (id) do update set name = excluded.name;

insert into public.subcontractors (id, name)
values ('33333333-3333-3333-3333-333333333302', 'Atomic Expense Subcontractor')
on conflict (id) do update set name = excluded.name;

insert into public.subcontracts (id, project_id, subcontractor_id, contract_amount, description)
values (
  '33333333-3333-3333-3333-333333333303',
  '33333333-3333-3333-3333-333333333301',
  '33333333-3333-3333-3333-333333333302',
  1000,
  'Atomic expense subcontract'
)
on conflict (id) do update set description = excluded.description;

create temp table expense_atomic_results (result jsonb);

insert into expense_atomic_results (result)
select public.create_expense_atomic(
  'expense-key-success',
  jsonb_build_object(
    'expenseDate', '2026-08-30',
    'vendorName', 'Atomic Expense Vendor',
    'paymentMethod', 'ACH',
    'referenceNo', 'ATOMIC-EXP-001',
    'notes', 'Atomic create',
    'receiptUrl', 'local://atomic-receipt.jpg',
    'sourceType', 'company',
    'status', 'pending',
    'groups', jsonb_build_array(
      jsonb_build_object(
        'projectId', '33333333-3333-3333-3333-333333333301',
        'lines', jsonb_build_array(
          jsonb_build_object('projectId', '33333333-3333-3333-3333-333333333301', 'category', 'Materials', 'memo', 'Line A', 'amount', 10),
          jsonb_build_object('projectId', '33333333-3333-3333-3333-333333333301', 'category', 'Travel', 'memo', 'Line B', 'amount', 20)
        )
      )
    ),
    'deduction', jsonb_build_object(
      'subcontractId', '33333333-3333-3333-3333-333333333303',
      'projectId', '33333333-3333-3333-3333-333333333301',
      'amount', 5,
      'note', 'Atomic deduction'
    )
  )
);

select is((select count(*) from public.expenses where idempotency_key = 'expense-key-success'), 1::bigint, 'create writes one expense header');
select is((select count(*) from public.expense_lines where expense_id = (select (result->>'expense_id')::uuid from expense_atomic_results limit 1)), 2::bigint, 'create writes every expense line');
select is((select array_agg(category order by description) from public.expense_lines where expense_id = (select (result->>'expense_id')::uuid from expense_atomic_results limit 1)), array['Materials','Travel']::text[], 'create preserves mixed line categories');
select is((select amount from public.expenses where idempotency_key = 'expense-key-success'), 30::numeric, 'create synchronizes the amount mirror');
select is((select total from public.expenses where idempotency_key = 'expense-key-success'), 30::numeric, 'create synchronizes total');
select is((select line_count from public.expenses where idempotency_key = 'expense-key-success'), 2, 'create synchronizes line count');
select is((select count(*) from public.subcontract_deductions where expense_id = (select (result->>'expense_id')::uuid from expense_atomic_results limit 1)), 1::bigint, 'create writes deduction metadata in the same intent');
select is((select source_type from public.expenses where idempotency_key = 'expense-key-success'), 'company', 'create writes source metadata');
select is((select receipt_url from public.expenses where idempotency_key = 'expense-key-success'), 'local://atomic-receipt.jpg', 'create writes receipt metadata in the same transaction');

create temp table expense_atomic_replays (result jsonb);
insert into expense_atomic_replays (result)
select public.create_expense_atomic(
  'expense-key-success',
  jsonb_build_object(
    'expenseDate', '2026-08-30',
    'vendorName', 'Atomic Expense Vendor',
    'paymentMethod', 'ACH',
    'referenceNo', 'ATOMIC-EXP-001',
    'notes', 'Atomic create',
    'receiptUrl', 'local://atomic-receipt.jpg',
    'sourceType', 'company',
    'status', 'pending',
    'groups', jsonb_build_array(
      jsonb_build_object(
        'projectId', '33333333-3333-3333-3333-333333333301',
        'lines', jsonb_build_array(
          jsonb_build_object('projectId', '33333333-3333-3333-3333-333333333301', 'category', 'Materials', 'memo', 'Line A', 'amount', 10),
          jsonb_build_object('projectId', '33333333-3333-3333-3333-333333333301', 'category', 'Travel', 'memo', 'Line B', 'amount', 20)
        )
      )
    ),
    'deduction', jsonb_build_object(
      'subcontractId', '33333333-3333-3333-3333-333333333303',
      'projectId', '33333333-3333-3333-3333-333333333301',
      'amount', 5,
      'note', 'Atomic deduction'
    )
  )
);
select is((select result->>'expense_id' from expense_atomic_replays limit 1), (select result->>'expense_id' from expense_atomic_results limit 1), 'same expense request returns the canonical expense');
select is((select (result->>'replayed')::boolean from expense_atomic_replays limit 1), true, 'same expense request reports an idempotent replay');
select is((select count(*) from public.expenses where idempotency_key = 'expense-key-success'), 1::bigint, 'expense replay creates no duplicate header');
select throws_ok(
  $$select public.create_expense_atomic('expense-key-success', jsonb_build_object('expenseDate','2026-08-30','vendorName','Changed Vendor','groups',jsonb_build_array(jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('amount',30))))))$$,
  '23505',
  'Expense idempotency key was reused with a different payload.',
  'same expense key with changed payload is rejected'
);

create function pg_temp.fail_expense_line_insert()
returns trigger language plpgsql as $$ begin if new.description = 'FAIL-LINE' then raise exception 'injected expense line failure'; end if; return new; end; $$;
create trigger expense_atomic_fail_line before insert on public.expense_lines for each row execute function pg_temp.fail_expense_line_insert();
select throws_ok(
  $$select public.create_expense_atomic('expense-key-line-fail', jsonb_build_object('expenseDate','2026-08-30','vendorName','Line Failure Vendor','groups',jsonb_build_array(jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('memo','FAIL-LINE','amount',12))))))$$,
  'P0001',
  'injected expense line failure',
  'expense line failure aborts atomic create'
);
drop trigger expense_atomic_fail_line on public.expense_lines;
select is((select count(*) from public.expenses where idempotency_key = 'expense-key-line-fail'), 0::bigint, 'expense line failure rolls back the header');
select is((select count(*) from public.expense_lines el join public.expenses e on e.id = el.expense_id where e.idempotency_key = 'expense-key-line-fail'), 0::bigint, 'expense line failure leaves no partial lines');

create function pg_temp.fail_expense_deduction_insert()
returns trigger language plpgsql as $$ begin if new.note = 'FAIL-DEDUCTION' then raise exception 'injected expense deduction failure'; end if; return new; end; $$;
create trigger expense_atomic_fail_deduction before insert on public.subcontract_deductions for each row execute function pg_temp.fail_expense_deduction_insert();
select throws_ok(
  $$select public.create_expense_atomic('expense-key-deduction-fail', jsonb_build_object('expenseDate','2026-08-30','vendorName','Deduction Failure Vendor','groups',jsonb_build_array(jsonb_build_object('projectId','33333333-3333-3333-3333-333333333301','lines',jsonb_build_array(jsonb_build_object('projectId','33333333-3333-3333-3333-333333333301','amount',15)))),'deduction',jsonb_build_object('subcontractId','33333333-3333-3333-3333-333333333303','projectId','33333333-3333-3333-3333-333333333301','amount',5,'note','FAIL-DEDUCTION')))$$,
  'P0001',
  'injected expense deduction failure',
  'deduction failure aborts atomic create'
);
drop trigger expense_atomic_fail_deduction on public.subcontract_deductions;
select is((select count(*) from public.expenses where idempotency_key = 'expense-key-deduction-fail'), 0::bigint, 'deduction failure rolls back the header');
select is((select count(*) from public.expense_lines el join public.expenses e on e.id = el.expense_id where e.idempotency_key = 'expense-key-deduction-fail'), 0::bigint, 'deduction failure rolls back lines');

create function pg_temp.fail_expense_completion()
returns trigger language plpgsql as $$ begin if new.idempotency_key = 'expense-key-completion-fail' and new.idempotency_completed_at is not null then raise exception 'injected expense completion failure'; end if; return new; end; $$;
create trigger expense_atomic_fail_completion before update on public.expenses for each row execute function pg_temp.fail_expense_completion();
select throws_ok(
  $$select public.create_expense_atomic('expense-key-completion-fail', jsonb_build_object('expenseDate','2026-08-30','vendorName','Completion Failure Vendor','groups',jsonb_build_array(jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('amount',18))))))$$,
  'P0001',
  'injected expense completion failure',
  'completion metadata failure aborts atomic create'
);
drop trigger expense_atomic_fail_completion on public.expenses;
select is((select count(*) from public.expenses where idempotency_key = 'expense-key-completion-fail'), 0::bigint, 'completion failure rolls back the header');
select is((select count(*) from public.expense_lines el join public.expenses e on e.id = el.expense_id where e.idempotency_key = 'expense-key-completion-fail'), 0::bigint, 'completion failure rolls back lines');

insert into public.expenses (id, expense_date, vendor_name, vendor, amount, total, line_count, status)
values ('33333333-3333-3333-3333-333333333311', '2026-08-30', 'Original Update Vendor', 'Original Update Vendor', 20, 20, 1, 'pending');
insert into public.expense_lines (id, expense_id, project_id, description, amount, total, qty, unit_cost)
values ('33333333-3333-3333-3333-333333333312', '33333333-3333-3333-3333-333333333311', '33333333-3333-3333-3333-333333333301', 'Original line', 20, 20, 1, 20);
insert into public.subcontract_deductions (expense_id, project_id, subcontractor_id, subcontract_id, amount, note)
values ('33333333-3333-3333-3333-333333333311', '33333333-3333-3333-3333-333333333301', '33333333-3333-3333-3333-333333333302', '33333333-3333-3333-3333-333333333303', 4, 'Original deduction');

select is(
  public.update_expense_atomic(
    '33333333-3333-3333-3333-333333333311',
    jsonb_build_object('vendorName','Updated Vendor'),
    jsonb_build_object('lineId','33333333-3333-3333-3333-333333333312','category','Lodging','amount',25),
    true,
    jsonb_build_object('subcontractId','33333333-3333-3333-3333-333333333303','projectId','33333333-3333-3333-3333-333333333301','amount',6,'note','Updated deduction')
  )->>'expense_id',
  '33333333-3333-3333-3333-333333333311',
  'atomic update returns the expense id'
);
select is((select vendor_name from public.expenses where id = '33333333-3333-3333-3333-333333333311'), 'Updated Vendor', 'atomic update writes the header');
select is((select amount from public.expense_lines where id = '33333333-3333-3333-3333-333333333312'), 25::numeric, 'atomic update writes the line');
select is((select category from public.expense_lines where id = '33333333-3333-3333-3333-333333333312'), 'Lodging', 'atomic update writes the line category');
select is((select amount from public.expenses where id = '33333333-3333-3333-3333-333333333311'), 25::numeric, 'atomic update synchronizes amount');
select is((select total from public.expenses where id = '33333333-3333-3333-3333-333333333311'), 25::numeric, 'atomic update synchronizes total');
select is((select note from public.subcontract_deductions where expense_id = '33333333-3333-3333-3333-333333333311'), 'Updated deduction', 'atomic update writes deduction metadata');

select lives_ok(
  $$select public.mutate_expense_line_atomic('33333333-3333-3333-3333-333333333311','update','33333333-3333-3333-3333-333333333312',jsonb_build_object('category','Travel'),false)$$,
  'line mutation accepts canonical category metadata'
);
select is((select category from public.expenses where id = '33333333-3333-3333-3333-333333333311'), 'Travel', 'line mutation synchronizes category to the expense header');
select is((select category from public.expense_lines where id = '33333333-3333-3333-3333-333333333312'), 'Travel', 'line mutation persists the canonical line category');
select lives_ok(
  $$select public.mutate_expense_line_atomic('33333333-3333-3333-3333-333333333311','add',null,jsonb_build_object('category','Equipment','memo','Added category line','amount',0),false)$$,
  'line mutation adds an independently categorized line'
);
select is((select category from public.expense_lines where expense_id = '33333333-3333-3333-3333-333333333311' and description = 'Added category line'), 'Equipment', 'added line persists its own category');

create function pg_temp.fail_expense_line_update()
returns trigger language plpgsql as $$ begin if old.id = '33333333-3333-3333-3333-333333333312' then raise exception 'injected expense line update failure'; end if; return new; end; $$;
create trigger expense_atomic_fail_line_update before update on public.expense_lines for each row execute function pg_temp.fail_expense_line_update();
select throws_ok(
  $$select public.update_expense_atomic('33333333-3333-3333-3333-333333333311', jsonb_build_object('vendorName','Must Roll Back'), jsonb_build_object('lineId','33333333-3333-3333-3333-333333333312','amount',99), false, null)$$,
  'P0001',
  'injected expense line update failure',
  'line update failure aborts atomic expense update'
);
drop trigger expense_atomic_fail_line_update on public.expense_lines;
select is((select vendor_name from public.expenses where id = '33333333-3333-3333-3333-333333333311'), 'Updated Vendor', 'line failure rolls back header update');
select is((select amount from public.expense_lines where id = '33333333-3333-3333-3333-333333333312'), 25::numeric, 'line failure preserves the old line');

create function pg_temp.fail_expense_total_sync()
returns trigger language plpgsql as $$ begin if old.id = '33333333-3333-3333-3333-333333333311' and new.amount <> old.amount then raise exception 'injected expense total sync failure'; end if; return new; end; $$;
create trigger expense_atomic_fail_total_sync before update on public.expenses for each row execute function pg_temp.fail_expense_total_sync();
select throws_ok(
  $$select public.mutate_expense_line_atomic('33333333-3333-3333-3333-333333333311','update','33333333-3333-3333-3333-333333333312',jsonb_build_object('amount',35),false)$$,
  'P0001',
  'injected expense total sync failure',
  'header total failure aborts line mutation'
);
drop trigger expense_atomic_fail_total_sync on public.expenses;
select is((select amount from public.expense_lines where id = '33333333-3333-3333-3333-333333333312'), 25::numeric, 'header sync failure rolls back line mutation');
select is((select amount from public.expenses where id = '33333333-3333-3333-3333-333333333311'), 25::numeric, 'header sync failure preserves header amount');

insert into public.bank_transactions (id, txn_date, description, amount, status)
values
  ('33333333-3333-3333-3333-333333333321', '2026-08-30', 'Atomic bank success', -30, 'unmatched'),
  ('33333333-3333-3333-3333-333333333322', '2026-08-30', 'Atomic bank line failure', -12, 'unmatched'),
  ('33333333-3333-3333-3333-333333333323', '2026-08-30', 'Atomic bank link failure', -14, 'unmatched'),
  ('33333333-3333-3333-3333-333333333324', '2026-08-30', 'Atomic bank mismatch', -10, 'unmatched');

create temp table bank_atomic_results (result jsonb);
insert into bank_atomic_results (result)
select public.reconcile_bank_transaction_expense_atomic(
  'bank-key-success',
  '33333333-3333-3333-3333-333333333321',
  'Atomic Bank Vendor',
  'ACH',
  jsonb_build_array(
    jsonb_build_object('projectId','33333333-3333-3333-3333-333333333301','category','Materials','memo','Bank line A','amount',10),
    jsonb_build_object('projectId','33333333-3333-3333-3333-333333333301','category','Travel','memo','Bank line B','amount',20)
  )
);
select isnt((select result->>'expense_id' from bank_atomic_results limit 1), null, 'bank reconcile returns an expense id');
select is((select status from public.bank_transactions where id = '33333333-3333-3333-3333-333333333321'), 'reconciled', 'bank reconcile marks the locked bank row reconciled');
select is((select source from public.expenses where id = (select (result->>'expense_id')::uuid from bank_atomic_results limit 1)), 'bank_transaction', 'bank reconcile writes durable source metadata');
select is((select amount from public.expenses where id = (select (result->>'expense_id')::uuid from bank_atomic_results limit 1)), 30::numeric, 'bank reconcile supplies required expenses.amount');
select is((select total from public.expenses where id = (select (result->>'expense_id')::uuid from bank_atomic_results limit 1)), 30::numeric, 'bank reconcile synchronizes total');
select is((select count(*) from public.expense_lines where expense_id = (select (result->>'expense_id')::uuid from bank_atomic_results limit 1)), 2::bigint, 'bank reconcile writes all lines');
select is((select array_agg(category order by description) from public.expense_lines where expense_id = (select (result->>'expense_id')::uuid from bank_atomic_results limit 1)), array['Materials','Travel']::text[], 'bank reconcile preserves mixed line categories');

create temp table bank_atomic_replays (result jsonb);
insert into bank_atomic_replays (result)
select public.reconcile_bank_transaction_expense_atomic(
  'bank-key-success',
  '33333333-3333-3333-3333-333333333321',
  'Atomic Bank Vendor',
  'ACH',
  jsonb_build_array(
    jsonb_build_object('projectId','33333333-3333-3333-3333-333333333301','category','Materials','memo','Bank line A','amount',10),
    jsonb_build_object('projectId','33333333-3333-3333-3333-333333333301','category','Travel','memo','Bank line B','amount',20)
  )
);
select is((select (result->>'replayed')::boolean from bank_atomic_replays limit 1), true, 'same bank request reports replay');
select is((select count(*) from public.expenses where source = 'bank_transaction' and source_id = '33333333-3333-3333-3333-333333333321'), 1::bigint, 'bank replay creates one canonical expense');
select throws_ok(
  $$select public.reconcile_bank_transaction_expense_atomic('bank-key-success','33333333-3333-3333-3333-333333333321','Changed Bank Vendor','ACH',jsonb_build_array(jsonb_build_object('amount',30)))$$,
  '23505',
  'Bank reconciliation idempotency key was reused with a different payload.',
  'same bank key with changed payload is rejected'
);
select throws_ok(
  $$select public.reconcile_bank_transaction_expense_atomic('bank-key-different','33333333-3333-3333-3333-333333333321','Atomic Bank Vendor','ACH',jsonb_build_array(jsonb_build_object('projectId','33333333-3333-3333-3333-333333333301','category','Materials','memo','Bank line A','amount',10),jsonb_build_object('projectId','33333333-3333-3333-3333-333333333301','category','Travel','memo','Bank line B','amount',20)))$$,
  '23505',
  'Bank transaction is already reconciled by a different request.',
  'same bank row with a different key cannot create another expense'
);
select is((select count(*) from public.expenses where source = 'bank_transaction' and source_id = '33333333-3333-3333-3333-333333333321'), 1::bigint, 'different-key retry still leaves one canonical bank expense');

create function pg_temp.fail_bank_expense_line()
returns trigger language plpgsql as $$ begin if new.description = 'FAIL-BANK-LINE' then raise exception 'injected bank expense line failure'; end if; return new; end; $$;
create trigger bank_atomic_fail_line before insert on public.expense_lines for each row execute function pg_temp.fail_bank_expense_line();
select throws_ok(
  $$select public.reconcile_bank_transaction_expense_atomic('bank-key-line-fail','33333333-3333-3333-3333-333333333322','Bank Line Failure','ACH',jsonb_build_array(jsonb_build_object('memo','FAIL-BANK-LINE','amount',12)))$$,
  'P0001',
  'injected bank expense line failure',
  'bank line failure aborts reconciliation'
);
drop trigger bank_atomic_fail_line on public.expense_lines;
select is((select count(*) from public.expenses where source = 'bank_transaction' and source_id = '33333333-3333-3333-3333-333333333322'), 0::bigint, 'bank line failure rolls back expense header');
select is((select status from public.bank_transactions where id = '33333333-3333-3333-3333-333333333322'), 'unmatched', 'bank line failure preserves unmatched state');

create function pg_temp.fail_bank_final_link()
returns trigger language plpgsql as $$ begin if old.id = '33333333-3333-3333-3333-333333333323' and new.status = 'reconciled' then raise exception 'injected bank final link failure'; end if; return new; end; $$;
create trigger bank_atomic_fail_final_link before update on public.bank_transactions for each row execute function pg_temp.fail_bank_final_link();
select throws_ok(
  $$select public.reconcile_bank_transaction_expense_atomic('bank-key-link-fail','33333333-3333-3333-3333-333333333323','Bank Link Failure','ACH',jsonb_build_array(jsonb_build_object('amount',14)))$$,
  'P0001',
  'injected bank final link failure',
  'bank final-link failure aborts reconciliation'
);
drop trigger bank_atomic_fail_final_link on public.bank_transactions;
select is((select count(*) from public.expenses where source = 'bank_transaction' and source_id = '33333333-3333-3333-3333-333333333323'), 0::bigint, 'bank link failure rolls back expense header');
select is((select count(*) from public.expense_lines el join public.expenses e on e.id = el.expense_id where e.source = 'bank_transaction' and e.source_id = '33333333-3333-3333-3333-333333333323'), 0::bigint, 'bank link failure rolls back lines');
select is((select status from public.bank_transactions where id = '33333333-3333-3333-3333-333333333323'), 'unmatched', 'bank link failure preserves unmatched state');

select throws_ok(
  $$select public.reconcile_bank_transaction_expense_atomic('bank-key-mismatch','33333333-3333-3333-3333-333333333324','Bank Mismatch','ACH',jsonb_build_array(jsonb_build_object('amount',9)))$$,
  '22023',
  'Bank expense lines must equal the absolute bank transaction amount.',
  'bank amount mismatch is rejected'
);
select is((select count(*) from public.expenses where source = 'bank_transaction' and source_id = '33333333-3333-3333-3333-333333333324'), 0::bigint, 'bank amount mismatch creates no expense');

select has_index('public', 'expenses', 'idx_expenses_atomic_idempotency_group', 'expense create idempotency has a unique index');
select has_index('public', 'bank_transactions', 'idx_bank_transactions_reconcile_idempotency_key', 'bank reconcile idempotency has a unique index');
select has_index('public', 'expenses', 'idx_expenses_bank_transaction_source', 'bank source identity has a unique index');

select * from finish();
rollback;
