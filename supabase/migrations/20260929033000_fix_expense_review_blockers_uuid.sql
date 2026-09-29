-- Production already applied this version with expenses.source_id as uuid.
-- The recorded hotfix compares worker_reimbursements.id to source_id directly:
--   where o.id=old.source_id
-- Fresh replay keeps source_id as text, where that comparison is uuid = text and
-- rejects every expense update. Text replay therefore keeps the previous
-- text comparison. Do not edit 20260929020000 or 20260929022100.

begin;
set lock_timeout = '5s';
set statement_timeout = '60s';

do $fix$
declare
  source_type oid;
begin
  select atttypid into source_type
  from pg_catalog.pg_attribute
  where attrelid = 'public.expenses'::regclass
    and attname = 'source_id'
    and not attisdropped;

  if source_type = 'uuid'::regtype then
    execute $fn$
      create or replace function private.guard_expense_review_blockers()
      returns trigger language plpgsql security definer set search_path = '' as $body$
      begin
        -- Existing canonical guard independently verifies the exact trusted reversal.
        if old.status='paid' and new.status='approved' and old.source='worker_reimbursement'
          and exists(select 1 from public.worker_reimbursements o join public.worker_payment_reversals r on r.payment_id=o.payment_id
            where o.id=old.source_id) then return new; end if;
        if new.status is distinct from old.status and new.status in ('approved','reviewed','paid','reimbursed','reimbursable')
          and exists(select 1 from public.expense_review_issues where expense_id=old.id and resolved_at is null) then
          raise exception 'Expense has unresolved review blockers.' using errcode='23514';
        end if;
        return new;
      end $body$
    $fn$;
  elsif source_type = 'text'::regtype then
    execute $fn$
      create or replace function private.guard_expense_review_blockers()
      returns trigger language plpgsql security definer set search_path = '' as $body$
      begin
        -- Existing canonical guard independently verifies the exact trusted reversal.
        if old.status='paid' and new.status='approved' and old.source='worker_reimbursement'
          and exists(select 1 from public.worker_reimbursements o join public.worker_payment_reversals r on r.payment_id=o.payment_id
            where o.id::text=old.source_id) then return new; end if;
        if new.status is distinct from old.status and new.status in ('approved','reviewed','paid','reimbursed','reimbursable')
          and exists(select 1 from public.expense_review_issues where expense_id=old.id and resolved_at is null) then
          raise exception 'Expense has unresolved review blockers.' using errcode='23514';
        end if;
        return new;
      end $body$
    $fn$;
  else
    raise exception 'Unsupported expenses.source_id type; review blocker fix requires review';
  end if;
end
$fix$;

commit;
