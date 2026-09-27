-- T3 A: nullable source preserves unclassified history and the approved Expense bridge.
set lock_timeout = '5s';
set statement_timeout = '60s';
alter table public.worker_reimbursements
  add column source_worker_receipt_id uuid,
  add constraint worker_reimbursements_source_worker_receipt_id_fkey
    foreign key (source_worker_receipt_id) references public.worker_receipts(id)
    on update restrict on delete restrict,
  add constraint worker_reimbursements_source_worker_receipt_id_key
    unique (source_worker_receipt_id);
alter table public.worker_receipts
  add constraint worker_receipts_reimbursement_id_key unique (reimbursement_id);
comment on column public.worker_reimbursements.source_worker_receipt_id is
  'Canonical Worker Receipt identity, unique when present. NULL is unclassified historical/non-receipt compatibility, NOT approval or payment authority. Payment requires an explicit matching Approved legacy receipt link or approved Expense source/source_id link. No inferred or automatic backfill.';
notify pgrst, 'reload schema';
