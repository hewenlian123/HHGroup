# HH Group Performance Optimization Phase 2 Implementation Plan

**Goal:** Identify and remove shared navigation/settle bottlenecks with measured evidence while preserving the frozen UI, financial semantics, business behavior, and security boundaries.

**Constraints:** No deploy or push. No stale financial cache, cross-user cache, service-role cache, fail-open behavior, hidden errors, UI redesign, or database/schema/index change. Preserve the verified Phase 1 optimizations.

## 1. Establish comparable evidence

- Record authenticated Local and Production click-to-feedback, route/RSC start, useful-content, hydration/data-ready, and settle timing for the required route chain.
- Count RSC, API, Supabase/auth, duplicate, aborted, and slow requests where the environment exposes them.
- Separate exact measurements from static estimates and unavailable Production browser signals.
- Reproduce suspected shared loops or waterfalls independently before changing code.

## 2. Lock the root cause with tests

- Add a regression test proving one `hh:app-sync` event cannot recursively emit another sync event from a subscriber.
- Add focused tests for any selected server-side parallelization or deduplication, including error behavior and financial output invariants.
- Run the new tests first and confirm they fail for the expected reason.

## 3. Apply only measured, low-risk changes

- Change sync-event subscribers to perform their intended read/refresh without re-broadcasting the same global event.
- Consider server query parallelization/deduplication only where dependencies and output equivalence are proven.
- Do not weaken middleware or route-level authorization to improve latency.

## 4. Verify before/after

- Repeat the identical authenticated Local measurements and compare medians, request counts, slowest request, duplicates, aborts, and settle behavior.
- Run targeted tests, typecheck, lint, source/security/financial contracts, unit tests, and production build.
- Perform responsive browser QA at 1440, 820, and 390 with zero page/console errors and no visual architecture change.
- Use read-only Production verification only; do not deploy the Phase 2 changes.

## 5. Report and decision

- Publish shared bottleneck, route-stage breakdown, Production versus Local, implemented changes, before/after deltas, and remaining P1/P2 items.
- Return `PASS` only if the requested experience metrics and invariants are demonstrated; otherwise return `NEEDS FIXES` with precise blockers.
