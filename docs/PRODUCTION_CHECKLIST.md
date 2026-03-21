# Production checklist (HH Unified Web)

## 1. Environment variables (hosting, e.g. Vercel)

| Variable                                  | Required              | Purpose                                                                                       |
| ----------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                | **Yes**               | Supabase project URL                                                                          |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`           | **Yes**               | Client + cookie-based server reads                                                            |
| `SUPABASE_SERVICE_ROLE_KEY`               | **Yes** for labor pay | Worker payment, delete payment, balance APIs that use `getServerSupabaseAdmin()` (RLS bypass) |
| `SUPABASE_DATABASE_URL` or `DATABASE_URL` | Recommended           | Faster worker balances aggregation (SQL); schema repair scripts                               |

Never commit secrets. Copy from Supabase Dashboard → Project Settings.

## 2. Database

- Link project: `supabase link`
- Apply migrations: `npm run db:migrate` (or `supabase db push`)
- Ensure labor pay columns exist: `labor_entries.worker_payment_id`, `worker_payments`, triggers under `supabase/migrations/` (e.g. `202604201000_*`, `202603211200_*`, repair `202603181200_*`)

## 3. Build & tests (before deploy)

```bash
npm run clean && npm run build   # if build fails with missing chunk, clean first
npm test run                     # Vitest
```

Optional E2E (dev server on `localhost:3000`, real Supabase):

```bash
npm run test:e2e:payment-full-flow   # pay → receipt → delete → rollback (mutations)
```

Set `E2E_WORKER_NAME` to a worker that has unpaid labor if the default name is absent.

## 4. Deploy

- **Vercel:** import repo, set env vars above, deploy. Production URL → set `NEXT_PUBLIC_*` to the same Supabase project as staging unless intentionally separate.
- This repo does not ship a `vercel.json`; defaults are fine for Next.js 14.

## 5. Post-deploy verification (core labor pay)

1. **Worker Balances** → open a worker → **Pay Worker** → submit (payment method filled).
2. **Receipt** → open payment receipt URL; labor lines present if applicable.
3. **Delete payment** (payments history) → confirm labor returns to **unpaid** on balance without stale “paid” from `status` alone.
4. **API smoke:** `GET /api/labor/worker-balances` returns JSON (no 500); requires service role + Supabase.

If pay/delete returns 500 “Supabase service role not configured”, add `SUPABASE_SERVICE_ROLE_KEY` and redeploy.
