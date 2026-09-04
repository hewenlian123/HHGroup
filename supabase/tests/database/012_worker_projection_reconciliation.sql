begin;

select plan(7);

select is(
  pg_catalog.to_regprocedure('public.sync_worker_to_labor_workers()'),
  null,
  'legacy worker projection function is absent'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'sync_worker_to_labor_workers'
  ),
  0,
  'legacy worker projection function has no remaining overloads'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'workers'
      and not t.tgisinternal
      and t.tgname = 'sync_worker_to_labor_workers_trigger'
  ),
  0,
  'legacy worker projection trigger is absent'
);

select isnt(
  pg_catalog.to_regprocedure('public.hh_sync_worker_to_labor_workers_projection()'),
  null,
  'authoritative worker projection function remains present'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'workers'
      and not t.tgisinternal
      and t.tgname = 'hh_sync_worker_to_labor_workers_projection_trigger'
      and t.tgenabled = 'O'
      and t.tgfoid = 'public.hh_sync_worker_to_labor_workers_projection()'::regprocedure
  ),
  1,
  'authoritative worker projection trigger remains enabled'
);

select ok(
  not (
    select p.prosecdef
    from pg_catalog.pg_proc p
    where p.oid = 'public.hh_sync_worker_to_labor_workers_projection()'::regprocedure
  ),
  'authoritative worker projection function remains security invoker'
);

select ok(
  (
    select bool_and(
      not pg_catalog.has_function_privilege(
        role_name,
        'public.hh_sync_worker_to_labor_workers_projection()',
        'EXECUTE'
      )
    )
    from unnest(array['public', 'anon', 'authenticated', 'service_role']) role_name
  ),
  'authoritative worker projection function remains non-executable by API roles'
);

select * from finish();

rollback;
