-- Backfill sequence from existing number (CO-001 -> 1) where sequence is null.
-- Ensure column exists to avoid ordering issues on fresh reset.
alter table public.project_change_orders
  add column if not exists sequence integer;

update public.project_change_orders
set sequence = nullif(regexp_replace(number, '^CO-0*', ''), '')::int
where sequence is null and number ~ '^CO-[0-9]+$';

-- Create or replace function using sequence column.
create or replace function public.next_change_order_number(p_project_id uuid)
returns text
language plpgsql
as $$
declare
  next_seq integer;
begin
  select coalesce(max(sequence), 0) + 1
  into next_seq
  from public.project_change_orders
  where project_id = p_project_id;

  return 'CO-' || lpad(next_seq::text, 3, '0');
end;
$$;
