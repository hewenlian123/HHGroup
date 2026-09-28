-- Estimate snapshot history is protected, append-only evidence. The product
-- already rejects deletion when history exists; enforce the same contract at
-- the foreign-key boundary so a concurrent snapshot cannot be cascade-deleted.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.estimate_snapshots
  drop constraint if exists estimate_snapshots_estimate_id_fkey;

alter table public.estimate_snapshots
  add constraint estimate_snapshots_estimate_id_fkey
  foreign key (estimate_id)
  references public.estimates(id)
  on delete restrict
  not valid;
commit;

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
alter table public.estimate_snapshots
  validate constraint estimate_snapshots_estimate_id_fkey;
commit;
