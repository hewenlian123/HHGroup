-- Sync labor_workers from workers so labor_entries.worker_id (if FK references labor_workers) can resolve.
-- Uses only (id, name) so it works whether or not labor_workers has created_at.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'labor_workers')
     and exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'workers') then
    insert into public.labor_workers (id, name)
    select id, name from public.workers
    on conflict (id) do update set name = excluded.name;
  end if;
end $$;
