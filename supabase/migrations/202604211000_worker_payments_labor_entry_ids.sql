-- Denormalized audit trail: which labor_entries rows this payment settled (receipt + traceability).
ALTER TABLE public.worker_payments ADD COLUMN IF NOT EXISTS labor_entry_ids uuid[] DEFAULT NULL;

COMMENT ON COLUMN public.worker_payments.labor_entry_ids IS 'Labor entry UUIDs included in this payout (mirrors labor_entries.worker_payment_id). Used for receipts when linking alone is ambiguous.';
