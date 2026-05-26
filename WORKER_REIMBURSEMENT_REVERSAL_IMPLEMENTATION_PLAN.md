# Worker Reimbursement Reversal Phase 1 Implementation Plan

## A. Executive Summary

This is an implementation plan only. It does not execute a reversal, mutate production data, change schema, or change application code.

The current worker reimbursement marker chain should not be deleted directly. It is connected to real financial surfaces:

- real project: `99-403 Paihi St- Aiea`
- real workers
- paid `worker_reimbursements`
- approved `worker_receipts`
- one generated project expense
- worker balance / payroll views
- `ProjectFinancialSnapshot.actualCost`
- System Integrity Scanner warnings classified as `requires_reversal_policy`

The safest Phase 1 is a guarded, server-side reversal workflow design that starts with a read-only reversal preview and blocks unsafe hard deletes of paid reimbursements. A true production reversal should not be performed until the app has an explicit reversible financial state, exact dependency verification, and regression coverage.

Recommended Phase 1 direction:

1. Add a read-only reversal preview endpoint/action that calculates the exact worker/project financial delta before any mutation.
2. Block hard delete of paid reimbursements in server routes and UI.
3. Add a guarded server-only reversal action later, after deciding the schema strategy.
4. Preserve receipts as audit evidence.
5. Void or reverse generated expenses through an auditable path.
6. Update worker balance, payroll, project snapshot, and scanner behavior consistently.

## B. Current Code Path Inventory

Reviewed files:

- `WORKER_REIMBURSEMENT_REVERSAL_POLICY.md`
- `src/app/labor/reimbursements/page.tsx`
- `src/app/api/worker-reimbursements/route.ts`
- `src/app/api/worker-reimbursements/[id]/route.ts`
- `src/app/api/worker-reimbursements/[id]/pay/route.ts`
- `src/app/api/worker-reimbursements/create-payment/route.ts`
- `src/app/api/worker-reimbursements/balances/route.ts`
- `src/app/api/worker-reimbursements/ledger/[workerId]/route.ts`
- `src/app/api/labor/workers/[id]/balance/route.ts`
- `src/app/api/labor/workers/[id]/pay/route.ts`
- `src/app/api/labor/workers/[id]/financial-summary/route.ts`
- `src/app/api/labor/worker-payments/[id]/route.ts`
- `src/lib/worker-reimbursements-db.ts`
- `src/lib/worker-receipts-db.ts`
- `src/lib/worker-payment-implicit-settlement.ts`
- `src/lib/labor-balance-shared.ts`
- `src/lib/worker-balances-list.ts`
- `src/lib/expenses-db.ts`
- `src/lib/financial/project-financial-snapshot.ts`
- `src/lib/financial/project-financial-snapshot-db.ts`
- `src/lib/system-integrity-scan.ts`
- `tests/worker-payment-consistency.spec.ts`
- `tests/reimbursement-flow-visual.spec.ts`
- `tests/bank-labor-server-api-boundary.spec.ts`
- `tests/full-system-smoke-and-data-flow.spec.ts`
- `tests/project-financial-snapshot-api.spec.ts`

Important current paths:

- Receipt approval creates a pending reimbursement and links `worker_receipts.reimbursement_id` in `approveWorkerReceiptWithClient`.
- Single reimbursement pay path calls `createExpenseFromPaidReimbursement`, then marks the reimbursement `paid`.
- Batch reimbursement pay path creates a `worker_payments` row, marks reimbursements `paid`, then creates generated expenses.
- Worker balance detail/list treat non-paid reimbursements as payable; paid reimbursements do not contribute to open payable.
- Project financial snapshot includes generated expense costs and paid reimbursement costs, with dedupe when a reimbursement is already represented by a generated expense.
- System Integrity Scanner already labels the remaining marker chain as requiring reversal policy.

## C. Current Data Model / Status Model

Current worker reimbursement app model:

- TypeScript status type: `pending | paid`
- UI status options: `pending`, `paid`
- Normalization maps any non-`paid` value to `pending` in `src/lib/worker-reimbursements-db.ts`
- PATCH route only accepts `pending` or `paid`
- `approveWorkerReimbursement` can write `approved`, but app mapping normalizes it to `pending`
- There is no first-class `reversed`, `voided`, `cancelled`, or `deleted` reimbursement state

Current receipt model:

- receipt statuses: `Pending | Approved | Rejected | Paid`
- approved receipts can be linked to a reimbursement by `worker_receipts.reimbursement_id`
- the FK is `ON DELETE SET NULL`, which protects the receipt row from deletion of a reimbursement but would break the audit link

Current generated expense model:

- generated reimbursement expense uses `reference_no = REIM-{reimbursementId}`
- when available, it stores `source = worker_reimbursement`, `source_id = reimbursementId`, `source_type = reimbursement`
- generated expense is inserted as `paid`, falling back to `approved` if the status constraint rejects `paid`
- `ProjectFinancialSnapshot` excludes expense statuses such as `void`, `voided`, `cancelled`, `canceled`, `draft`, and `rejected`

Current payment model:

- worker payment flow can link reimbursements to `worker_payments` by `payment_id`
- deleting a `worker_payments` row reopens linked reimbursements to `pending`
- this worker payment delete behavior is a settlement reversal, not a financial audit reversal for already-paid marker data

Current system scanner model:

- `worker_reimbursements`, `worker_receipts`, and generated `expenses` can be labeled with:
  - `requires_reversal_policy`
  - `linked_real_project`
  - `paid_reimbursement`
  - `generated_expense`
  - `affects_worker_balance`
  - `affects_project_actual_cost`

## D. Worker Balance Impact

Current source-of-truth behavior:

- Worker balance detail calculates open reimbursement balance from reimbursement rows whose status is not `paid`.
- Worker balances list uses the same practical rule: `paid` reimbursements are excluded from open payable.
- Payroll summary filters reimbursements with `status !== paid`.
- Worker financial summary endpoint is less precise: it sums all `worker_reimbursements.amount` regardless of status. This endpoint should be reviewed before implementing reversal, because a `reversed` status would otherwise still be counted there.

Implication:

- A reversed paid reimbursement must not become payable again.
- Setting a paid row back to `pending` would incorrectly increase worker balance.
- Deleting a linked worker payment can also reopen reimbursements; that is not the right cleanup strategy for this marker chain.
- A future `reversed` status must be treated as non-payable in worker balance, payroll, and worker financial summary surfaces.

Minimum worker balance rule for reversal:

```text
Payable reimbursement = reimbursement.status is not paid and not reversed/voided/cancelled.
Historical paid reimbursement = status paid, linked to paid_at/payment_id, but no open payable.
Reversed reimbursement = excluded from payable and excluded from active project cost, while retained for audit.
```

## E. Project Actual Cost Impact

Current `ProjectFinancialSnapshot` behavior:

- `actualCost = expenseCost + laborCost + reimbursementCost + subcontractCost`
- expense rows with finalized statuses (`approved`, `completed`, `done`, `paid`, `reviewed`) count in `expenseCost`
- expense rows with void-like statuses (`void`, `voided`, `cancelled`, `canceled`, `draft`, `rejected`) are excluded
- reimbursement statuses `paid`, `done`, and `completed` count in `reimbursementCost`
- reimbursement rows are deduped if they are already represented by a generated expense

The remaining production marker chain currently has this shape from the policy review:

- marker reimbursement cost impact: `$330.00`
- one generated expense: `$30.00`
- generated expense is linked to reimbursement `723febff-fdff-4372-bac3-f3044335a6d5`
- snapshot dedupes that one reimbursement so the project does not double-count that `$30.00`

Implication:

- Reversing only the reimbursement rows would leave the generated expense in project actual cost.
- Voiding only the generated expense would leave non-generated paid reimbursements in project actual cost.
- A complete reversal must handle both sides:
  - generated expense side: void/reverse generated expense
  - reimbursement side: mark reimbursement reversed or create reversal ledger/adjustment

## F. Generated Expense Handling

Current generated expense creation:

- checks for an existing expense by `reference_no = REIM-{id}`
- falls back to `source = worker_reimbursement` and `source_id = {id}`
- creates one expense and one expense line
- status is `paid` or `approved`
- line category is `reimbursement`

Recommended handling:

- Preserve the original generated expense row.
- Do not hard-delete the generated expense or line.
- Preferred if existing schema allows it: set generated expense status to `void`/`voided` and add a reversal note/reference.
- If existing schema does not allow a void-like status, create an explicit negative reversal expense/adjustment instead of deleting the original.
- Any mutation must verify affected rows and confirm the exact generated expense belongs to the exact reimbursement being reversed.

Schema caution:

- App logic recognizes `void` / `voided` in calculations, but the production `expenses.status` constraint must be verified before using either value.
- If production constraint does not allow a void-like status, a migration or adjustment-ledger design is required.

## G. Receipt Audit Trail Policy

Worker receipts should be retained as audit evidence.

Reasons:

- receipt rows explain how the reimbursement was created
- receipt URL/path is part of the original worker-submitted evidence
- `worker_receipts.reimbursement_id` preserves the chain from upload to reimbursement
- deleting the receipt makes future investigation harder
- the current FK uses `ON DELETE SET NULL`, so hard-delete of reimbursement would erase the link from the receipt

Recommended receipt policy:

- no hard delete for linked approved/paid receipt chains
- show receipt as retained evidence after reversal
- scanner can eventually downgrade retained receipts if linked reimbursement is formally reversed
- storage objects should not be deleted unless there is a separate retention policy and exact object verification

## H. Recommended Phase 1 Implementation

Phase 1 should be split into two safe sub-phases.

### Phase 1A: No-schema safety guard and preview

This can be implemented without schema changes and without touching production rows.

Recommended changes:

1. Add a guarded server-only reversal preview endpoint/action:
   - suggested route: `GET /api/worker-reimbursements/[id]/reversal-preview`
   - requires authenticated owner/session boundary
   - uses internal server Supabase client
   - read-only
   - returns exact dependency graph:
     - reimbursement row
     - worker receipt rows
     - generated expense rows by `reference_no` and `source_id`
     - expense line rows
     - worker payment row if `payment_id` exists
     - project financial snapshot before
     - simulated project actualCost delta
     - worker balance impact
     - scanner classification impact
   - returns `canReverse: false` until a mutation strategy is available

2. Block hard delete of paid reimbursements:
   - server DELETE should reject paid rows with a clear safe error
   - UI should hide or disable delete for paid rows
   - Delete should remain possible only for unlinked, unpaid, exact pending test rows after dependency checks
   - This is a safety fix independent of reversal execution

3. Add UI read-only affordance:
   - paid reimbursement action menu can show "Review reversal" or "Reversal preview"
   - no "Reverse" submit button until Phase 1B
   - display linked receipt/generated expense/project/worker impact

4. Add tests:
   - paid reimbursement delete is blocked
   - reversal preview is read-only and guarded
   - preview reports linked generated expense and receipt evidence
   - no raw DB errors exposed

Phase 1A does not resolve production scanner warnings. It makes the system safer and prepares an auditable reversal.

### Phase 1B: Schema-backed reversal action

This is the first phase that should actually mutate data, and it should wait for explicit approval.

Recommended action:

- add guarded server action/API: `reverseWorkerReimbursement`
- requires:
  - exact reimbursement ID
  - reversal reason
  - optional batch ID
  - confirmation token or typed confirmation
  - no broad marker/pattern cleanup
- verifies:
  - reimbursement exists
  - status is `paid`
  - linked project/worker/receipt/expense chain matches preview
  - generated expense belongs to the reimbursement
  - no unrelated dependencies will be mutated
- transaction behavior:
  - mark reimbursement reversed or create reversal ledger row
  - void/reverse generated expense
  - retain worker receipt
  - verify affected row counts
  - return safe structured result

Do not use direct SQL in normal operation unless the app lacks a required safe path and the user explicitly approves a one-time exact-ID cleanup.

## I. Optional Schema Design, if needed later

A full safe reversal likely needs schema support.

Recommended schema additions for `worker_reimbursements`:

- `status` supports `reversed` or `voided`
- `reversed_at timestamptz`
- `reversed_by text` or user id
- `reversal_reason text`
- `reversal_batch_id uuid` or text
- `reversal_of_id uuid` if creating separate reversal rows

Recommended schema additions for generated expenses or a new ledger:

- Either ensure `expenses.status` supports `void` / `voided`
- Or add a dedicated financial adjustment/reversal table, for example:
  - `worker_reimbursement_reversals`
  - `original_reimbursement_id`
  - `generated_expense_id`
  - `worker_receipt_id`
  - `worker_id`
  - `project_id`
  - `amount`
  - `reason`
  - `created_by`
  - `created_at`

No schema migration should be created until the product decision is made.

Can Phase 1 be done without schema change?

- Phase 1A preview and delete blocking: yes.
- Actual financial reversal: not safely, unless existing production schema already supports a void-like expense status and there is an agreed way to store reimbursement reversal metadata.

Downside of no-schema mutation:

- notes-only reversal is not machine-readable enough for project cost and worker balance formulas
- unsupported status values may be normalized back to `pending`
- scanner cannot safely distinguish reversed from active warning
- audit trail is weaker and more error-prone

## J. UI/UX Recommendation

Minimal UI shape:

- On paid reimbursement rows:
  - no hard-delete action
  - add "Review reversal" action only after preview endpoint exists
  - show confirmation copy that this affects project cost and worker financial history
- Reversal preview dialog:
  - show worker, project, amount, status, paid date
  - show linked receipt evidence
  - show generated expense/reference
  - show estimated project actualCost delta
  - show worker balance result should remain `$0.00` open payable
  - require reason before actual reversal is ever enabled
- Actual reverse button:
  - Phase 1A: not available
  - Phase 1B: available only after exact dependency verification and reason entry

No cleanup/fix/delete button should be added to System Health. System Health should remain scanner-only.

## K. Test Plan

Recommended tests before any mutation feature:

### Unit / helper tests

- reimbursement status helper treats `reversed`/`voided` as not payable
- project snapshot excludes reversed reimbursements
- generated expense void/reversal is excluded from actualCost
- dedupe still works when generated expense and reimbursement are both present
- worker financial summary excludes reversed reimbursements

### API tests

- `GET /api/worker-reimbursements/[id]/reversal-preview` requires auth
- preview is read-only
- preview returns receipt, generated expense, project, worker, and delta
- preview returns safe errors only
- paid reimbursement DELETE is blocked
- pending unlinked reimbursement delete still follows dependency checks
- `reverseWorkerReimbursement` verifies affected rows before reporting success

### Playwright tests

- `tests/reimbursement-flow-visual.spec.ts`
  - create receipt → approve → pay → generated expense
  - preview reversal shows linked evidence
  - receipt remains visible
  - generated expense is identified
- `tests/worker-payment-consistency.spec.ts`
  - reversal does not reopen worker payable balance
  - partial payment workflow still leaves pending reimbursement payable
- `tests/project-financial-snapshot-api.spec.ts`
  - reversed reimbursement / voided generated expense no longer contributes to actualCost
  - no duplicate counting after reversal
- `tests/bank-labor-server-api-boundary.spec.ts`
  - reversal routes use server API boundary, no browser Supabase writes
- `tests/full-system-smoke-and-data-flow.spec.ts`
  - full cross-module flow remains stable
- `tests/system-integrity-scan.spec.ts`
  - active paid marker chain remains warning
  - formally reversed chain downgrades to retained/reversed info

Do not run mutation-heavy tests against production.

## L. Risks / Do Not Do

Do not:

- hard-delete paid `worker_reimbursements`
- hard-delete linked `worker_receipts`
- hard-delete generated expenses without an audit path
- delete `worker_payments` as a shortcut; that reopens payables
- set paid reimbursements back to `pending`
- rely on notes-only cleanup for financial formulas
- use broad marker cleanup
- run production SQL manually for reversal
- update production rows outside a guarded reviewed transaction
- hide scanner warnings without a real reversed/retained state
- add a System Health fix/delete button

Recommended safety rules:

- all reversal writes must be server-only
- use authenticated boundary
- use internal Supabase client only on the server
- no browser direct writes
- exact ID only
- transaction where schema supports it
- affected-row verification for every mutation
- return safe errors
- keep audit trail
- update one source-of-truth formula at a time

## M. Suggested Next Codex Prompt

Use this when ready to implement Phase 1A only:

```text
Use using-superpowers.
Use hh-code-logic-ui-review.
Also apply hh-supabase-safety, hh-playwright-qa, hh-financial-integrity-guard, hh-financial-regression-guard, verification-before-completion.

Implement Worker Reimbursement Reversal Phase 1A safety guard and preview only.

Scope:
- add a guarded read-only reversal preview endpoint for worker reimbursements
- block hard-delete of paid worker reimbursements in server route and UI
- keep receipts and generated expenses unchanged
- do not add reversal mutation
- do not change schema
- do not run migration
- do not touch production data
- add targeted tests for preview shape, auth, read-only behavior, and paid-delete blocker

Run:
- git diff --check
- npm run lint
- npx tsc --noEmit
- targeted worker reimbursement/payment/project snapshot/system scanner tests

Do not push or deploy.
```

Use this only after Phase 1A has shipped and the schema decision is approved:

```text
Design and implement schema-backed Worker Reimbursement Reversal Phase 1B with explicit reversal metadata, generated expense void/reversal handling, project snapshot integration, worker balance integration, scanner downgrade behavior, and exact regression tests.
```

## N. Final Status

This report is implementation planning only.

No reimbursement was reversed.
No receipt was deleted.
No generated expense was deleted or updated.
No production data was modified.
No schema or migration was changed.
No code implementation was performed.
No push or deploy was performed.

Recommendation: commit this report first, then implement Phase 1A as a separate small code change.
