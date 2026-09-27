# Financial Invariants

Verified from:

- `AGENTS.md`
- `src/lib/profit-engine.ts`
- `src/__tests__/financial-atomicity-data-failure-injection.test.ts`
- `src/__tests__/financial-atomicity-route-failure-injection.test.ts`
- `src/__tests__/lib/financial-idempotency.test.ts`
- `src/__tests__/lib/estimates-db-financial-read-integrity.test.ts`
- `supabase/tests/database/`
- `.agents/skills/hh-development-router/references/routing-matrix.md`

Last verified: 2026-08-30

## Durable invariants

- Activate `hh-financial-integrity-guard` for Estimate, Invoice, Payment, Deposit, Expense, Payroll, Project cost, amount semantics, rounding, allocation, settlement, or financial atomicity work.
- Protected and authorization-sensitive financial reads fail closed. A query error or unavailable source must not become a valid `$0`, empty collection, or apparently successful result. `FinancialDataUnavailableError` is the canonical project-profit failure channel.
- `src/lib/profit-engine.ts` is the canonical project-profit implementation. Actual project cost is project labor + eligible `expense_lines` + approved `subcontract_bills` + accrued commissions. Generic `ap_bills`, payment tracking, reimbursements, or commission payments must not be double-counted into accrued project cost/profit.
- Preserve approval, void/reversal, balance, audit trail, and idempotency behavior. Multi-record financial mutations must be atomic wherever partial completion could corrupt balances; retry must not duplicate effects and failed work must roll back.
- Do not invent tax, discount, rounding, allocation, or amount semantics. Trace the current code/migration/test owner before changing them.
- Every financial change needs focused before/after amount regression and reconciliation evidence. Add targeted Vitest; use Semgrep on affected financial/Supabase paths. If SQL, RPC, schema, RLS, trigger, persistence mapping, or migration changes, also follow `mem:database-and-migrations`.
- A blocked, skipped, timed-out, failed, or non-zero amount delta is not PASS.

Re-verify if canonical cost sources, formula ownership, persistence mapping, atomic RPC contracts, or financial guard policy changes.
