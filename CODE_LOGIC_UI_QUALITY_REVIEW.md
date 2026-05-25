# HH Unified Web Code / Logic / UI / Debug / Security Quality Review

Date: 2026-05-24
Base commit reviewed: `d266dee Polish Neo UI tokens and mobile shell`
Production reference from owner: `d266dee4b6bf21d7b8c48a00d0b184bb6726aa45`, Vercel READY, smoke OK.

## A. Executive Summary

Overall, the app is in a workable post-polish state for continued targeted development, but the codebase still has important boundary drift from the recent owner-only/no-login direction:

- No confirmed P0/Critical issue was found in this pass.
- One confirmed High maintenance-route issue was fixed: `/api/upload-receipt/sync` could list storage orphan paths and insert placeholder worker receipt rows without a production safety guard.
- The largest remaining High risk is intentional-but-broad owner no-login behavior combined with API routes that use server/admin Supabase clients without explicit per-route guards. Pages may be acceptable for an internal owner app, but public API reachability needs a deliberate policy.
- Several sensitive modules still have browser Supabase direct reads/writes. These are known migration debt and can reintroduce RLS permission failures or browser-side exposure when anon SELECT/WRITE is tightened.
- Financial source-of-truth work is much stronger than earlier phases, but customers, expenses, worker receipts, and some legacy helpers still bypass the newer guarded server API patterns.

Immediate recommendation: review and commit the one small fix, then schedule a dedicated API boundary pass before more feature work.

## B. Critical Risks

No confirmed Critical issue was found during this review.

I did not run broad destructive flows, migrations, production SQL, or production data checks. This conclusion is based on static review plus targeted local validation only.

## C. Business Logic Risks

### Projects

- Confirmed recent fix area: project archive/delete now verifies actual persistence in `src/app/projects/actions.ts` and `src/lib/projects-db.ts` from prior work. No new confirmed project delete issue found in this pass.
- Risk: project/customer/invoice API routes use mixed guard styles. If a UI action reports success based only on API response without verifying affected rows, the old no-op class of bug could recur in modules that have not been hardened.
- Priority: Should fix next for Customers and remaining financial mutations.

### Customers

- Confirmed risk: customer detail still reads and writes directly from the browser Supabase anon client.
- Evidence: `src/app/customers/[id]/page.tsx:8`, `src/app/customers/[id]/page.tsx:132`, `src/app/customers/[id]/page.tsx:259`.
- What may go wrong: RLS/anon tightening can break customer detail with permission denied, and raw DB errors can reach UI.
- Priority: High, migrate customer detail read/save to guarded server API.

### Estimates

- Recent preview/print and drawer/mobile fixes appear structurally consistent from static review history. No new estimate math mismatch confirmed in this pass.
- Risk: full estimate flow depends on E2E coverage staying current after drawer/sheet changes.
- Priority: Medium, keep `tests/estimates-new-edit-delete.spec.ts` as a required regression after estimate UI changes.

### Invoices / Payments

- No new invoice/payment double-counting bug confirmed in this pass.
- Risk: `src/app/api/invoices/route.ts` exposes a full invoice list without explicit route auth guard (`GET` at line 10). In no-login mode this may be intended, but it should be classified deliberately.
- Priority: High if the production site is internet-reachable; Medium if fully private/network-restricted.

### Expenses

- Confirmed risk: expense detail still reads and writes sensitive expense, expense line, reference, and attachment records from the browser Supabase client.
- Evidence: `src/app/financial/expenses/[id]/expense-detail-client.tsx:16`, `src/app/financial/expenses/[id]/expense-detail-client.tsx:120`, `src/app/financial/expenses/[id]/expense-detail-client.tsx:360`, `src/app/financial/expenses/[id]/expense-detail-client.tsx:392`.
- What may go wrong: permission denied under RLS, direct browser storage upload errors, and inconsistent server/client validation.
- Priority: High, migrate expense detail edit/upload/delete to guarded APIs.

### Labor / Worker Receipts

- Fixed in this pass: worker receipt storage sync route now uses production safety guard.
- Remaining risk: worker receipt upload/submit endpoints use server-side Supabase/admin clients without explicit owner/auth guard and comments currently say “no auth required.”
- Evidence: `src/app/api/upload-receipt/upload/route.ts:10`, `src/app/api/upload-receipt/upload/route.ts:12`, `src/app/api/upload-receipt/submit/route.ts:9`, `src/app/api/upload-receipt/submit/route.ts:12`.
- Priority: High. Decide whether this is intentionally public worker intake. If public, add rate limiting, file limits, and constrained validation; if internal-only, add an owner/internal guard.

### Financial Dashboard / System

- Dashboard and System Health have strong recent coverage and data quality checks. No new financial KPI mismatch confirmed.
- Risk: System/Data Quality checks can only catch known issue patterns; they should not replace module-specific regression tests.
- Priority: Medium.

### Backups

- Destructive production maintenance routes inspected in this pass use `guardDangerousMaintenanceRequest` style protections. `tests/production-safety.spec.ts` passed.
- Priority: Keep production-safety tests required for future System/Backup changes.

## D. Security / Supabase Risks

### High: Owner no-login mode + API routes is a broad boundary decision

- Evidence: `src/lib/owner-access-mode.ts:1-4` enables no-login unless `HH_REQUIRE_LOGIN` is set to `1` or `true`.
- Evidence: `src/lib/auth-boundary.ts:84-90` treats owner no-login mode as authenticated.
- Evidence: `src/middleware.ts:320-325` excludes `/api` from middleware matching.
- Evidence examples: `src/app/api/customers/route.ts:8`, `src/app/api/customers/route.ts:26`, `src/app/api/customers/[id]/route.ts:38`, `src/app/api/customers/[id]/route.ts:107`, `src/app/api/projects/route.ts:10`, `src/app/api/expenses/route.ts:10`.
- Risk: On a public deployment, normal app APIs may be callable without PIN/session and may use admin/internal Supabase clients. This is not a single-line bug; it is a product/security boundary decision after the owner-only no-login change.
- Recommended next step: create a separate “API boundary under no-login mode” pass. Keep UI no-login if desired, but decide whether APIs require an internal header, private network/Vercel protection, or route-level owner session.

### Fixed High: unguarded worker receipt sync maintenance route

- File changed: `src/app/api/upload-receipt/sync/route.ts`.
- Before: `GET` listed worker-receipts storage orphan paths; `POST` inserted placeholder `worker_receipts` rows, with no production safety guard.
- After: both methods call `guardDangerousMaintenanceRequest(request)` before reading storage or writing rows.
- Evidence after fix: `src/app/api/upload-receipt/sync/route.ts:12-14`, `src/app/api/upload-receipt/sync/route.ts:57-59`.

### High: browser Supabase direct access remains in protected modules

Confirmed examples:

- Customer detail browser read/save: `src/app/customers/[id]/page.tsx:132`, `src/app/customers/[id]/page.tsx:259`.
- Expense detail browser read/write/upload: `src/app/financial/expenses/[id]/expense-detail-client.tsx:120`, `src/app/financial/expenses/[id]/expense-detail-client.tsx:360`, `src/app/financial/expenses/[id]/expense-detail-client.tsx:392`.
- Worker reimbursements still creates a browser Supabase client: `src/app/labor/reimbursements/page.tsx:25`, `src/app/labor/reimbursements/page.tsx:103-110`.

Recommended next step: migrate these to guarded server API routes before further RLS tightening.

### Medium: raw DB/service errors can be returned to API/UI

Examples:

- `src/app/api/customers/route.ts:18-20`
- `src/app/api/customers/[id]/route.ts:19-22`, `src/app/api/customers/[id]/route.ts:98-102`, `src/app/api/customers/[id]/route.ts:129-132`
- `src/app/api/invoices/route.ts:14-17`
- `src/app/api/upload-receipt/upload/route.ts:29-37`

Recommended next step: return owner-friendly messages plus diagnostic codes; keep detailed error only in server logs with redaction.

### Service role exposure

- No direct `NEXT_PUBLIC_*SERVICE*` pattern was found in runtime code.
- Service role helper is server-oriented (`src/lib/supabase-server.ts:53-63`), but the helper file deliberately avoids top-level `server-only` because DB helpers import it. This requires discipline in imports.
- `src/lib/invoices-db.ts:137-149` uses service role on server and browser client in browser. This is not proven exposed, but should remain on the audit list.

## E. UI / UX Issues

No new blocking UI issue was confirmed in this pass. I did not run a full visual walkthrough because the user requested targeted review and no broad Playwright run.

Known/observed from lint:

- `npm run lint` passes but reports existing `<img>` warnings in:
  - `src/app/labor/receipts/receipts-client.tsx`
  - `src/app/materials/catalog/page.tsx`
  - `src/app/projects/[id]/project-materials-tab.tsx`
  - `src/app/punch-list/page.tsx`
  - `src/app/site-photos/page.tsx`
- These are performance/polish warnings, not current blockers.

Recommended UI follow-up:

- Keep mobile drawer/sheet tests around estimates.
- Add a small preview/modal regression for materials/site photo image pages before replacing `<img>` with `next/image`.

## F. Debug / Production Cleanliness

Findings:

- Production safety routes are generally guarded; `tests/production-safety.spec.ts` passed.
- `console.error` and `console.warn` remain in runtime paths. Many are acceptable server/client error logging, but sensitive payload logging should be reviewed.
- Test/data quality markers are intentionally detected by System Health and Data Quality checks.
- Test routes exist under `/api/test/*`, but the sampled destructive/test routes use production safety guards.

Notable process issue:

- Running `tests/production-safety.spec.ts` triggered local Playwright global setup and local schema auto-repair: “Applied 197 statement(s).” This did not touch production or repo migrations, but it means Playwright is not purely read-only for local DB. Treat this as expected local E2E behavior, not something to run casually during a “no schema changes” review.

## G. Duplicate / Legacy Logic

Confirmed duplicate/boundary drift:

- Multiple API styles coexist: unguarded admin APIs, guarded APIs using `requireAuthenticatedUser`, browser Supabase pages, server actions, and production-safety maintenance routes.
- Financial snapshot work has improved project cost/profit consistency, but customer/expense/labor auxiliary flows still use older paths.
- `requireAuthenticatedUser` currently means “owner no-login is authenticated,” which is convenient for UI but weak as a data/API boundary.

Recommended consolidation:

1. Define three route classes:
   - Public intake routes, explicitly rate-limited and schema-constrained.
   - Owner app routes, guarded by a deliberate owner access boundary.
   - Maintenance/destructive routes, guarded by internal admin secret plus typed confirmation.
2. Convert browser Supabase detail pages one module at a time.
3. Standardize API error envelopes and affected-row checks.

## H. Test Coverage

Commands run:

- `git status --short` — passed, showed only inventory untracked files before this review.
- `git log -1 --oneline` — `d266dee Polish Neo UI tokens and mobile shell`.
- `git diff --stat` — initially clean.
- `git diff --check` — passed before and after patch.
- `npm run lint` — passed with existing `<img>` warnings.
- `npx tsc --noEmit` — passed.
- `npx playwright test tests/production-safety.spec.ts --project=chromium` — passed, 3 tests.

Targeted Playwright result:

- `tests/production-safety.spec.ts`: 3 passed.
- Caveat: local E2E global setup performed local schema auto-repair notices. No production operation occurred.

Recommended tests later:

- API boundary test for no-login mode to document which routes are intentionally public.
- Customer detail server API boundary spec.
- Expense detail attachment/edit server API boundary spec.
- Worker receipt public/intake abuse guard spec, depending on product decision.
- Raw error sanitization unit/API tests for customer/invoice/receipt APIs.

## I. Recommended Fix Order

### 1. Must Fix First

1. Decide API boundary under no-login mode. If the production domain is internet-reachable, normal data APIs should not be broadly callable without a deliberate owner/internal boundary.
2. Classify worker receipt upload/submit as either public intake or owner-only. Add the appropriate guard/rate-limit/file constraints.
3. Migrate customer detail and expense detail away from browser Supabase direct reads/writes.

### 2. Should Fix Next

1. Sanitize API raw DB errors into stable owner-friendly messages with diagnostic codes.
2. Add affected-row verification to any remaining archive/delete/void/update server actions.
3. Add targeted Playwright coverage for customer save/delete and expense detail attachment flows.

### 3. Can Fix Later

1. Replace remaining `<img>` usages where it improves loading/performance without breaking storage previews.
2. Consolidate duplicate modal/drawer patterns after the current stabilization period.
3. Add route inventory documentation for System, maintenance, public intake, and owner APIs.

### 4. Do Not Do Now

- Do not do a full UI rewrite.
- Do not add System watchers.
- Do not add GitHub Actions.
- Do not run migrations or schema repair against production.
- Do not broadly refactor all Supabase access in one batch.
- Do not auto-deploy this review.

## J. Final Status

Files changed by this review:

- `src/app/api/upload-receipt/sync/route.ts` — added production safety guard to GET and POST.
- `CODE_LOGIC_UI_QUALITY_REVIEW.md` — this report.

Existing untracked files to keep out of commits:

- `SYSTEM_MODULE_INVENTORY.md`
- `.SYSTEM_MODULE_INVENTORY.md.swp`

Current recommendation:

- Yes, this is worth committing after owner review, but only stage:
  - `src/app/api/upload-receipt/sync/route.ts`
  - `CODE_LOGIC_UI_QUALITY_REVIEW.md`
- Do not stage `SYSTEM_MODULE_INVENTORY.md` or `.SYSTEM_MODULE_INVENTORY.md.swp`.
- Do not push or deploy until explicitly requested.

Recommended next prompt:

> Commit the quality review report and guarded upload receipt sync route, excluding SYSTEM_MODULE_INVENTORY.md and the .swp file.
