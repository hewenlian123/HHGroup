alter table public.estimate_snapshots
  drop constraint if exists estimate_snapshots_estimate_id_fkey;

alter table public.estimate_snapshots
  add constraint estimate_snapshots_estimate_id_fkey
  foreign key (estimate_id)
  references public.estimates(id)
  on delete cascade;
