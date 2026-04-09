DELETE FROM public.invoice_payments ip
WHERE NOT EXISTS (SELECT 1 FROM public.invoices inv WHERE inv.id = ip.invoice_id);

-- ─── 3) Commissions ──────────────────────────────────────────────────────────
DELETE FROM public.commission_payments cp
WHERE EXISTS (
  SELECT 1 FROM public.commissions c
  WHERE c.id = cp.commission_id
    AND (
      c.person ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%','%[E2E]%','%E2E%','%Seed%'])
      OR c.notes ILIKE ANY (ARRAY['%PW%','%Playwright%','%Workflow Test%','%Body balance%','%[E2E]%','%E2E%','%Seed%'])
    )
