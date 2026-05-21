-- Estimate builder advanced persistence.
-- Non-destructive: adds document notes plus line item ordering/status used by the composer.

alter table public.estimate_items
  add column if not exists sort_order integer;

with ranked as (
  select
    id,
    row_number() over (
      partition by estimate_id
      order by cost_code asc, id asc
    ) - 1 as next_sort_order
  from public.estimate_items
  where sort_order is null
)
update public.estimate_items as item
set sort_order = ranked.next_sort_order
from ranked
where item.id = ranked.id;

alter table public.estimate_items
  alter column sort_order set default 0,
  alter column sort_order set not null;

create index if not exists estimate_items_estimate_sort_idx
  on public.estimate_items (estimate_id, sort_order);

alter table public.estimate_items
  add column if not exists status text;

update public.estimate_items
set status = 'included'
where status is null
  or status = ''
  or status not in ('included', 'optional', 'allowance', 'excluded', 'owner_supplied');

alter table public.estimate_items
  alter column status set default 'included',
  alter column status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'estimate_items_status_check'
      and conrelid = 'public.estimate_items'::regclass
  ) then
    alter table public.estimate_items
      add constraint estimate_items_status_check
      check (status in ('included', 'optional', 'allowance', 'excluded', 'owner_supplied'));
  end if;
end $$;

alter table public.estimate_meta
  add column if not exists document_notes jsonb;

update public.estimate_meta
set document_notes = '[]'::jsonb
where document_notes is null;

alter table public.estimate_meta
  alter column document_notes set default '[]'::jsonb,
  alter column document_notes set not null;

notify pgrst, 'reload schema';
