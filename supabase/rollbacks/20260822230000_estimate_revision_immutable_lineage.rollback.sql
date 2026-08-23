do $rollback_guard$
begin
  if exists (select 1 from public.estimates where revision_number > 0) then
    raise exception 'Cannot roll back Estimate lineage while revision records exist.';
  end if;
end
$rollback_guard$;

drop function if exists public.create_estimate_revision(uuid);
drop function if exists public.duplicate_estimate_as_draft(uuid);
drop function if exists public.copy_estimate_as_draft_core(uuid, uuid, integer, uuid);

drop trigger if exists trg_prevent_estimate_lineage_mutation on public.estimates;
drop trigger if exists trg_set_estimate_revision_defaults on public.estimates;
drop function if exists public.prevent_estimate_lineage_mutation();
drop function if exists public.set_estimate_revision_defaults();

alter table public.estimates
  drop constraint if exists estimates_previous_revision_key,
  drop constraint if exists estimates_number_revision_key,
  drop constraint if exists estimates_revision_root_number_key,
  drop constraint if exists estimates_previous_revision_id_fkey,
  drop constraint if exists estimates_revision_root_id_fkey,
  drop constraint if exists estimates_revision_shape_check,
  drop constraint if exists estimates_revision_number_nonnegative;

drop index if exists public.estimates_revision_root_id_idx;

alter table public.estimates
  drop column if exists previous_revision_id,
  drop column if exists revision_number,
  drop column if exists revision_root_id,
  add constraint estimates_number_key unique (number);

-- Restore the Phase 2B copy function after removing lineage columns.
-- Apply 20260822150000_duplicate_estimate_atomic_deep_copy.sql again before
-- accepting Duplicate/Copy Previous traffic.

notify pgrst, 'reload schema';
