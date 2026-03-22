-- Single-tenant: keep one company_profile row and prevent accidental duplicates.
-- Safe to run multiple times (DELETE is a no-op when already one row).

do $body$
begin
  if to_regclass('public.company_profile') is null then
    raise notice 'company_profile: table missing, skip singleton cleanup';
    return;
  end if;

  delete from public.company_profile cp
  where cp.id not in (
    select c.id
    from public.company_profile c
    order by c.updated_at desc nulls last, c.created_at desc nulls last, c.id desc
    limit 1
  );
end;
$body$;

drop index if exists public.company_profile_single_row;

-- Constant expression index: at most one row (every row maps to the same key).
create unique index company_profile_single_row on public.company_profile ((true));
