begin;
select no_plan();

select is(
  (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'private.guard_expense_review_blockers()'::regprocedure
  ),
  true,
  'review blocker guard stays security definer'
);
select ok(
  (
    select proconfig::text
    from pg_catalog.pg_proc
    where oid = 'private.guard_expense_review_blockers()'::regprocedure
  ) like '%search_path=%',
  'review blocker guard pins search_path'
);

select is(
  position(
    'where o.id=old.source_id' in pg_catalog.pg_get_functiondef('private.guard_expense_review_blockers()'::regprocedure)
  ) > 0,
  (
    select atttypid = 'uuid'::regtype
    from pg_catalog.pg_attribute
    where attrelid = 'public.expenses'::regclass
      and attname = 'source_id'
      and not attisdropped
  ),
  'uuid source_id compares o.id=old.source_id'
);
select is(
  position(
    'o.id::text=old.source_id' in pg_catalog.pg_get_functiondef('private.guard_expense_review_blockers()'::regprocedure)
  ) > 0,
  (
    select atttypid = 'text'::regtype
    from pg_catalog.pg_attribute
    where attrelid = 'public.expenses'::regclass
      and attname = 'source_id'
      and not attisdropped
  ),
  'text source_id keeps o.id::text=old.source_id'
);

insert into public.expenses (amount, status, vendor_name)
values (1, 'approved', 'PW review blocker');
select lives_ok(
  $$update public.expenses set vendor_name = 'PW review blocker saved' where vendor_name = 'PW review blocker'$$,
  'an expense update is not rejected by the source id comparison'
);

select * from finish();
rollback;
