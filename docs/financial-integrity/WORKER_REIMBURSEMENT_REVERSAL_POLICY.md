# Worker Reimbursement Reversal Policy Review

## A. Executive Summary

This is a read-only review of the remaining System Integrity Scanner warnings for the worker receipt, worker reimbursement, and generated expense marker chain.

The remaining marker rows are not safe to hard-delete. They are linked to real production financial history:

- real project: `99-403 Paihi St- Aiea` (`73b015c1-9656-427e-91c4-8ea1c4bc4d1b`)
- real workers: `小尚` (`2391f8e2-b564-400c-94c4-278251b0f91f`) and `林秀强` (`4b8c54ea-e362-470a-9e63-456adf13d5c2`)
- paid worker reimbursements
- approved worker receipts
- a generated paid project expense
- project financial snapshot actual cost

Recommended policy: retain original receipt and reimbursement records as audit evidence, add an explicit reversal model before any production cleanup, and ensure project actual cost and worker payable balances are corrected through a reversible financial event rather than direct deletion.

## B. Current Remaining Scanner Issues

Production scanner state during review:

- status: `warning`
- total issues: `20`
- critical: `0`
- high: `0`
- medium: `19`
- low: `1`

The relevant remaining chain:

- 3 worker receipts
- 12 worker reimbursements
- 1 generated expense
- 1 generated expense line

The scanner correctly labels these with:

- `requires_reversal_policy`
- `linked_real_project`
- `paid_reimbursement`
- `generated_expense`
- `linked_worker_receipt`
- `linked_worker_reimbursement`
- `affects_worker_balance`
- `affects_project_actual_cost`

## C. Dependency Graph

### Worker Receipts

| Receipt ID                             |   Worker | Project                 |   Amount | Vendor        | Status     | Linked reimbursement                   | Audit value |
| -------------------------------------- | -------: | ----------------------- | -------: | ------------- | ---------- | -------------------------------------- | ----------- |
| `130cf5a7-44cf-4f9e-9c4a-ea51dd456fb5` |   `小尚` | `99-403 Paihi St- Aiea` | `$30.00` | `Test Vendor` | `Approved` | `723febff-fdff-4372-bac3-f3044335a6d5` | retain      |
| `6c86bb89-a2dd-4ff5-8486-afe0729963db` | `林秀强` | `99-403 Paihi St- Aiea` | `$30.00` | `Test Vendor` | `Approved` | `6597c5ff-fff0-442c-ac62-d6795d120061` | retain      |
| `a2756301-bf8f-4a5b-ba45-66eda3850873` | `林秀强` | `99-403 Paihi St- Aiea` | `$30.00` | `Test Vendor` | `Approved` | `b9f3847d-67e8-49f4-bfab-bdea3ba2dc9e` | retain      |

Receipt URLs are marker/test URLs (`https://example.com/test.jpg`). The receipts should remain as audit evidence until the reimbursement chain has a formal reversal state.

### Worker Reimbursements

Eleven of the twelve reimbursement IDs were visible through the read-only worker ledger APIs. All eleven are:

- vendor: `Test Vendor`
- description: `Test Vendor · Other`
- amount: `$30.00`
- status: `paid`
- payment id: `null`
- project: `99-403 Paihi St- Aiea`

| Reimbursement ID                       | Worker   | Project                 |   Amount | Status | Paid at                   | Receipt link            |
| -------------------------------------- | -------- | ----------------------- | -------: | ------ | ------------------------- | ----------------------- |
| `723febff-fdff-4372-bac3-f3044335a6d5` | `小尚`   | `99-403 Paihi St- Aiea` | `$30.00` | `paid` | `2026-05-09T21:01:30.212` | yes                     |
| `d8d8d607-b212-4276-97bc-c128ec7ecec7` | `小尚`   | `99-403 Paihi St- Aiea` | `$30.00` | `paid` | `2026-04-29T16:08:08.957` | no visible receipt link |
| `bb5c0058-8b8d-4d1d-8428-7b03684d35f6` | `小尚`   | `99-403 Paihi St- Aiea` | `$30.00` | `paid` | `2026-04-29T14:52:10.205` | no visible receipt link |
| `2c8892fb-aec1-4ff0-ad2e-08bfab62b9a2` | `小尚`   | `99-403 Paihi St- Aiea` | `$30.00` | `paid` | `2026-04-28T21:30:52.562` | no visible receipt link |
| `107714f3-d3c6-4f94-a02c-4dbc3c576922` | `小尚`   | `99-403 Paihi St- Aiea` | `$30.00` | `paid` | `2026-04-28T21:30:13.866` | no visible receipt link |
| `b5ac0fcc-7f1c-4f20-8a5f-53c8633213ed` | `小尚`   | `99-403 Paihi St- Aiea` | `$30.00` | `paid` | `2026-04-28T20:40:14.303` | no visible receipt link |
| `4ddb58c9-6e90-40c6-8098-9f2412ee2021` | `小尚`   | `99-403 Paihi St- Aiea` | `$30.00` | `paid` | `2026-04-09T18:44:03.819` | no visible receipt link |
| `02e62450-e444-4cbd-9f62-1c9942175f24` | `小尚`   | `99-403 Paihi St- Aiea` | `$30.00` | `paid` | `2026-04-09T11:12:28.949` | no visible receipt link |
| `0ae5df5f-ab07-4ca3-9336-134a953105a0` | `小尚`   | `99-403 Paihi St- Aiea` | `$30.00` | `paid` | `2026-04-09T11:00:03.983` | no visible receipt link |
| `6597c5ff-fff0-442c-ac62-d6795d120061` | `林秀强` | `99-403 Paihi St- Aiea` | `$30.00` | `paid` | `2026-03-24T11:28:35.192` | yes                     |
| `b9f3847d-67e8-49f4-bfab-bdea3ba2dc9e` | `林秀强` | `99-403 Paihi St- Aiea` | `$30.00` | `paid` | `2026-03-23T04:48:50.515` | yes                     |

One reimbursement was visible only through the scanner, not through the worker ledger/list APIs:

| Reimbursement ID                       | Scanner evidence                                                                                                                                                 | Financial classification                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `c2884fe3-05db-4036-89a8-85924c33c140` | `vendor=Test Vendor`, `description=Test Vendor · Other`, labels include `paid_reimbursement` and `affects_worker_balance`; no linked worker/project IDs surfaced | paid marker reimbursement needing DB-level exact-row verification before any policy action |

### Generated Expense

| Field          | Value                                                                             |
| -------------- | --------------------------------------------------------------------------------- |
| Expense ID     | `74689b6f-8d8e-4992-bda0-5b4c2090a155`                                            |
| Project        | `99-403 Paihi St- Aiea` (`73b015c1-9656-427e-91c4-8ea1c4bc4d1b`)                  |
| Worker         | `小尚` (`2391f8e2-b564-400c-94c4-278251b0f91f`)                                   |
| Vendor         | `Test Vendor`                                                                     |
| Amount / total | `$30.00`                                                                          |
| Status         | `paid`                                                                            |
| Source         | `worker_reimbursement`                                                            |
| Source ID      | `723febff-fdff-4372-bac3-f3044335a6d5`                                            |
| Reference      | `REIM-723febff-fdff-4372-bac3-f3044335a6d5`                                       |
| Expense line   | `ce18b637-9ebc-4ad8-8e58-f93657b2f8df`, amount `$30.00`, category `reimbursement` |
| Attachments    | none visible                                                                      |

This generated expense is included in project actual cost as expense cost. The linked reimbursement is deduped by the project snapshot logic.

## D. Financial Impact

Current read-only project snapshot for `99-403 Paihi St- Aiea`:

| Metric                    | Current value |
| ------------------------- | ------------: |
| actualCost                |   `$2,820.00` |
| laborCost                 |   `$2,490.00` |
| expenseCost               |      `$30.00` |
| reimbursementCost         |     `$300.00` |
| subcontractCost           |       `$0.00` |
| reimbursementDedupedCount |           `1` |
| cashOut                   |     `$330.00` |

Interpretation:

- The marker reimbursement chain currently contributes `$330.00` to project cost.
- `$30.00` is represented by the generated paid expense.
- `$300.00` is represented by paid worker reimbursements that are not represented by generated expense lines.
- One reimbursement (`723febff...`) is deduped because its generated expense already carries the `$30.00` project cost.

Current worker balance API for the two visible workers shows open balance `0`, which is expected for paid reimbursements. A reversal must not reopen these as payable.

Expected financial effect of a correct reversal policy:

- project actual cost should decrease by `$330.00` if these marker financial events are fully reversed
- worker payable balance should remain `0` after reversal
- original rows should remain available for audit
- scanner should move from warning to retained/reversed info once reversal metadata exists

The orphan-like reimbursement `c2884fe3...` has no linked project/worker surfaced by the scanner and does not appear in the two worker ledgers. It needs DB-level exact-row verification before deciding whether it has a financial impact.

## E. Why Direct Delete Is Unsafe

Direct delete is not recommended for these rows.

Reasons:

- Paid reimbursement rows are financial history, not simple test fixtures.
- Approved receipts are evidence for why reimbursements were created.
- The generated expense is included in project actual cost.
- The project snapshot dedupes generated expense and reimbursement by reimbursement ID; deleting only one side can change diagnostics or leave an orphaned audit trail.
- Deleting paid reimbursements can make worker ledger history incomplete.
- Changing paid rows back to pending would incorrectly re-open worker payable balances.
- The current app type model treats worker reimbursement status primarily as `pending` or `paid`; unsupported statuses may be normalized as pending in existing UI/helpers.
- A hard delete would make later reconciliation harder because it removes the original cause, date, worker, and project context.

## F. Recommended Reversal Policy

Preferred strategy: explicit reversal, not deletion.

Recommended model:

1. Keep original `worker_receipts` rows as audit evidence.
2. Keep original `worker_reimbursements` rows but mark them reversed with explicit reversal metadata.
3. Void or reverse the generated expense tied to `source=worker_reimbursement` and `source_id=723febff...`.
4. Ensure reversed reimbursements do not count toward project actual cost and do not return to worker payable balance.
5. Keep the receipt-to-reimbursement link visible for audit.
6. Add a scanner classification for reversed marker chain so it becomes retained/reversed info rather than active warning.

Two safe implementation patterns are possible:

### Option 1: Reversal status and metadata

Add explicit fields:

- `worker_reimbursements.status = reversed` or `voided`
- `worker_reimbursements.reversed_at`
- `worker_reimbursements.reversed_by`
- `worker_reimbursements.reversal_reason`
- `worker_reimbursements.reversal_batch_id`
- `expenses.status = void` for generated expense, with reversal note/reference

Project financial snapshot should exclude `reversed` / `voided` reimbursements and already excludes `void` expenses.

Worker balance should not include reversed paid reimbursements as pending payable.

### Option 2: Immutable reversal entries

Keep original rows untouched and create explicit reversal entries:

- a negative project cost adjustment or reversal expense line for `$-30.00`
- a reimbursement reversal ledger entry tied to original reimbursement ID
- a batch reversal record documenting all exact IDs

This is best for audit integrity but likely requires a new table or a formal adjustment model.

## G. Existing Schema Support

Current app code does not provide a complete reversal model.

Observed support:

- project expense statuses include excluded terminal statuses such as `void` / `voided` / `cancelled`
- project snapshot only counts worker reimbursement statuses `paid`, `done`, and `completed` as finalized cost
- pending reimbursement statuses are tracked separately for diagnostics
- generated reimbursement expenses are deduped by source/category/reimbursement ID

Observed gaps:

- worker reimbursement TypeScript status is `pending | paid`
- API validation only accepts `pending` or `paid` for worker reimbursement PATCH
- status normalizer maps anything other than `paid` to `pending` in some helper paths
- no visible `reversed_at`, `reversal_of_id`, `reversal_reason`, or reversal batch fields
- no existing safe admin reversal endpoint
- no current UI policy for "paid but reversed"

Using only existing `notes`, `description`, or `reference` fields is not enough because notes do not change financial inclusion. Using a non-supported status without code changes is risky because current helpers may treat it as pending.

If schema changes are not allowed, the minimum safe app-only phase would be a read-only reversal preview plus manual policy documentation. It should not mutate production data.

## H. Required App Changes, if any

Recommended app changes before any production reversal:

1. Add a read-only reversal preview function that accepts exact IDs and returns:
   - original cost impact
   - expected post-reversal project actual cost
   - worker balance impact
   - generated expense impact
   - dependency blockers
2. Add explicit support for `reversed` / `voided` reimbursement state or a formal reversal ledger.
3. Update worker reimbursement list/detail UI to show reversed rows as audit history, not payable.
4. Update worker balance aggregation to exclude reversed reimbursements from payable balance.
5. Update project financial snapshot to exclude reversed reimbursements and void generated expenses exactly once.
6. Update System Integrity Scanner to classify reversed marker chains as retained/reversed info.
7. Add a guarded, owner-only reversal action only after dry-run preview is proven.

No cleanup/fix/delete button should be added to System Health.

## I. Required Tests

Targeted tests needed before implementation:

- worker reimbursement reversal preview returns exact impact for paid reimbursements
- reversed paid reimbursement does not re-enter worker payable balance
- reversed reimbursement is excluded from project actual cost
- generated expense void/reversal is excluded from project actual cost
- reimbursement plus generated expense is not double-counted before or after reversal
- receipt remains visible as audit evidence after reimbursement reversal
- scanner reports reversed exact marker chain as info/retained, not warning
- scanner still warns on unreversed Test Vendor worker reimbursement chains
- production write guard prevents reversal tests from running against production unless explicitly allowed

Suggested test areas:

- `tests/system-integrity-scan.spec.ts`
- worker reimbursement/payment boundary tests
- project financial snapshot API tests
- reimbursement flow tests

## J. Proposed Safe Implementation Phases

### Phase 1: Read-only reversal preview

Build a read-only helper/API that takes exact IDs and computes:

- source rows found
- linked receipt/reimbursement/expense rows
- current project cost impact
- projected cost impact after reversal
- worker payable impact
- blockers

No mutation.

### Phase 2: Reversal model

Choose either:

- add explicit reversal status/metadata to worker reimbursements, or
- add a dedicated reversal/adjustment table.

This likely requires schema planning and local validation before production.

### Phase 3: Mutation path

Create a guarded admin-only reversal action with:

- exact ID input only
- dry-run required
- transaction
- affected row verification
- no broad pattern cleanup
- no delete of original receipts/reimbursements

### Phase 4: Scanner tuning

Teach System Integrity Scanner to classify reversed chains as:

- `classification: reversed_retained`
- severity `info`
- `autoFixAvailable: false`

Unreversed paid Test Vendor chains should remain warning.

## K. Do Not Do

Do not:

- delete paid worker reimbursements directly
- delete worker receipts directly
- delete the generated expense without reversing the linked reimbursement policy
- set paid reimbursements back to pending
- hide scanner warnings as false positives
- pattern-allowlist `Test Vendor`
- add cleanup/fix/delete buttons to System Health
- run broad production cleanup
- change project actual cost with manual SQL that bypasses audit trail
- mutate production data before a tested reversal model exists

## L. Final Recommendation

Do not clean this chain with exact-ID deletes.

Treat it as a real financial reversal problem. The safest next step is a Phase 1 read-only reversal preview that proves the exact financial delta and blockers. After that, add a formal reversal state or adjustment ledger, then perform any production reversal through a guarded transaction that preserves original receipts and reimbursement audit history.

Current best estimate from read-only evidence:

- visible project-linked paid marker reimbursements: 11 rows x `$30.00`
- generated expense tied to reimbursement `723febff...`: `$30.00`
- project snapshot marker impact: `$330.00`
- current visible worker payable impact: `$0.00` open balance
- deletion safety: not safe
- reversal policy readiness: not ready until app/schema support is designed and tested
