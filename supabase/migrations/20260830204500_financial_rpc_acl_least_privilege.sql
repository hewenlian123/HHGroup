-- Least-privilege EXECUTE closure for the atomic financial functions introduced
-- by the Estimate pre-deploy hardening migrations.
--
-- Payment and Invoice mutations are called by strict owner/admin Server Actions.
-- They prefer a server-only service-role client and retain the existing
-- authenticated session fallback, whose writes remain constrained by the
-- owner/admin financial RLS policies.
--
-- Payroll and reimbursement settlement mutations are called only by strict
-- owner/admin Route Handlers using a server-only service-role client. Missing
-- privileged server configuration fails closed before any RPC is attempted.
--
-- Trigger helpers are invoked by PostgreSQL triggers and have no API caller.

set lock_timeout = '5s';
set statement_timeout = '60s';

revoke all on function public.record_payment_received_atomic(
  text, uuid, uuid, text, date, numeric, text, text, text, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.record_payment_received_atomic(
  text, uuid, uuid, text, date, numeric, text, text, text, text, jsonb
) to authenticated, service_role;

revoke all on function public.update_payment_received_atomic(
  uuid, date, numeric, text, text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.update_payment_received_atomic(
  uuid, date, numeric, text, text, text, uuid
) to authenticated, service_role;

revoke all on function public.record_worker_payroll_settlement(
  text, uuid, uuid, numeric, text, date, text, uuid[], uuid[], uuid[], numeric
) from public, anon, authenticated, service_role;
grant execute on function public.record_worker_payroll_settlement(
  text, uuid, uuid, numeric, text, date, text, uuid[], uuid[], uuid[], numeric
) to service_role;

revoke all on function public.require_paid_reimbursement_payment_link()
  from public, anon, authenticated, service_role;

revoke all on function public.create_paid_reimbursement_expense()
  from public, anon, authenticated, service_role;

revoke all on function public.record_worker_reimbursement_payment_atomic(
  text, uuid, text, date, text, uuid[]
) from public, anon, authenticated, service_role;
grant execute on function public.record_worker_reimbursement_payment_atomic(
  text, uuid, text, date, text, uuid[]
) to service_role;

revoke all on function public.create_invoice_atomic(text, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.create_invoice_atomic(text, jsonb, jsonb)
  to authenticated, service_role;

revoke all on function public.update_invoice_atomic(uuid, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.update_invoice_atomic(uuid, jsonb, jsonb)
  to authenticated, service_role;

notify pgrst, 'reload schema';
