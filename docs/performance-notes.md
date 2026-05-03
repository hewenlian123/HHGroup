# Performance notes (HH Unified Web)

Operational notes for `/financial/expenses` and related fixes. For receipt/OCR product flow, see [receipt-upload-ocr-flow.md](./receipt-upload-ocr-flow.md).

## Local Supabase — schema alignment (expenses list)

After `20260325075614_remote_schema.sql`, some local DBs dropped objects that the app still expects, which caused **PostgREST 400** and **multi-step `getExpenses` select fallbacks**.

**Addressed** (repair migration and/or alignment with existing migrations):

- `expenses.receipt_url` — restore per `202603171000_expenses_receipt_status_worker.sql` intent.
- `public.categories` — restore per `202602280005_vendors_and_categories.sql` intent.
- `workers.daily_rate` — restore per `202603182000_workers_add_trade_rates.sql` intent.

See `supabase/migrations/20260503123000_repair_remote_schema_category_receipt_daily_rate.sql` for the idempotent repair that was added for local drift.

## `getExpenses` — `expense_lines` batching

**Change:** per-expense `expense_lines` queries were replaced with **batched** queries using `.in("expense_id", ids)` (chunked, same order of magnitude as payment-method hydration), implemented in `src/lib/expenses-db.ts` as private `fetchExpenseLinesGroupedByExpenseId`.

**Unchanged:** expense save path, `toExpense`, attachments, `getLinkedBankTxId`, project cost / profit code paths, UI.

## `/financial/expenses` — runtime sample (local dev server)

Approximate numbers from the same style of sample as before (Playwright + navigation + short settle time, `http://127.0.0.1:3000`):

| Metric                                                     | Approx.  |
| ---------------------------------------------------------- | -------- |
| `response` events (page load window)                       | ~**508** |
| `expense_lines` URL stem duplicate count (Resource Timing) | ~**×2**  |
| `expenses` URL stem duplicate count                        | ~**×3**  |

Use these for **before/after** comparison only; absolute values depend on data volume, dev build, and timing.

## Optional follow-ups (not implemented)

- **Attachments / `linkedBankTxId`:** `getExpenses` still calls `getAttachments` and `getLinkedBankTxId` **per expense** — possible further N+1 if lists are large; would need batch APIs or batched queries without changing product behavior.
- **`/api/system-health`:** sample often shows **duplicate** fetches; consider deduping or a single provider if still noisy.
- **Dashboard:** first-load server data **splitting** (lighter initial payload / deferred sections) if Dashboard perf work is prioritized.

---

_Last updated: expenses schema repair + expense_lines batching period._
