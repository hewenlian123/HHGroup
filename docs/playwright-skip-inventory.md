# Playwright `test.skip` inventory

Scope: specs that run under **`npx playwright test --project=chromium`** (`playwright.config.ts` ignores `worker-payment*.spec.ts` and `delete-flows-mutations.spec.ts`).

Shared helper: `expectVisibleOrSkip` in `tests/e2e-helpers.ts` — waits up to N ms for a locator, then skips with a single reason (reduces **early** skips when `count() === 0` before rows hydrate).

| File | Approx. lines | Reason | Fixable? |
|------|----------------|--------|----------|
| `tests/example.spec.ts` | 404 skip | Route returns 404 | No — route missing in app |
| `tests/example.spec.ts` | hydrate skip | Shell did not hydrate in time | Partially — waits on `main`, body text length fallback |
| `tests/buttons.spec.ts` | draft invoice | `tryCreateDraftInvoiceNavigateToDetail` failed | Only if DB has projects + Supabase |
| `tests/buttons.spec.ts` | system health | Refresh disabled > 75s | Partially — longer wait; skip if guardian never ready |
| `tests/workflows.spec.ts` | customer picker | No customers in dialog | Partially — try unfiltered list before search `"test"` |
| `tests/delete-flows.spec.ts` | various | Supabase not configured | No — env |
| `tests/delete-flows.spec.ts` | various | No rows / slow list (merged message) | Partially — `expectVisibleOrSkip` + loading waits |
| `tests/delete-all-surfaces.spec.ts` | Supabase / backend | Not configured / API error | No |
| `tests/delete-all-surfaces.spec.ts` | empty lists | No rows in table | No — needs seed data |
| `tests/delete-all-surfaces.spec.ts` | labor sub-pages | Loading / “no … yet” copy in row | Partially — wait; empty state still skips |
| `tests/integration-data-flow.spec.ts` | Supabase / APIs | Same as above | No |
| `tests/integration-data-flow.spec.ts` | invoice / tasks | No projects in graph / dialog | No — needs DB graph |
| `tests/integration-data-flow.spec.ts` | rows / links | No customers/workers/projects | No — seed data |
| `tests/settings-company-profile.spec.ts` | Supabase | Not configured | No |
| `tests/settings-company-profile.spec.ts` | invoice helper | No projects | No — seed |
| `tests/settings-company-profile.spec.ts` | storage / logo | RLS / bucket / `E2E_BRANDING_FULL` | Partially — fix storage policy or env |

**Not in `chromium` project** (separate projects): `tests/worker-payment-*.spec.ts`, `tests/delete-flows-mutations.spec.ts` — skips for `E2E_WORKER_NAME`, create flows, etc.

## Last local run (`CI= npx playwright test --project=chromium`)

- **76 passed**, **9 skipped**, **0 failed** (≈11m). Use `CI=` when `localhost:3000` is already taken by a dev server (avoids `webServer` port clash).

Skipped tests were all **empty list / no matching row** after long waits:

| Spec | Test |
|------|------|
| `delete-flows.spec.ts` | settings categories — no category row |
| `delete-flows.spec.ts` | labor subcontractors — no subcontractor row |
| `delete-all-surfaces.spec.ts` | tasks, documents, labor review, labor invoices, reimbursements, labor daily, site-photos |

Fix: seed the corresponding entities in Supabase (or run against an env that has them).
