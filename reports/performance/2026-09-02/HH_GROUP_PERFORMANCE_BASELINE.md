# HH Group Performance Baseline and Bottleneck Classification

## Scope and validity

Measured 2026-09-02 before optimization. Local includes a development-server matrix and a clean optimized-build matrix at 1440×900, 820×1180, and 390×844. Production is anonymous/read-only only because no approved authenticated Production session or Vercel observability credential was available. No Production mutation, deploy, database change, or benchmark-specific business change occurred.

## Performance baseline

| Environment           | Coverage                                       |                                            FUC median |      Settle median |                Request median | Important limitation                                                                |
| --------------------- | ---------------------------------------------- | ----------------------------------------------------: | -----------------: | ----------------------------: | ----------------------------------------------------------------------------------- |
| Local development     | 72 direct observations                         | 705.3 ms initial matrix; 997.6 ms added core surfaces | 1630.9 / 1986.6 ms | 20 same-origin initial matrix | Cold compilation and React development duplication materially inflate results.      |
| Local optimized build | 45 direct observations, 15 surfaces × 3 widths |                                              137.4 ms |           805.5 ms |  42 same-origin; 1 RSC; 2 API | Invoice Detail lacked a safe visible seed; click-feedback samples were invalidated. |
| Production anonymous  | Home/Login/protected redirect × 3 widths       |                                509.3 ms Login content |          1253.2 ms |                      38 total | Not an authenticated operational-page baseline.                                     |

Valid development-mode Dashboard→Projects target content appeared 326.9–414.1 ms after click. The first same-origin route request in optimized mode began in 3.0–74.0 ms, but its visual-feedback readings matched old Dashboard content and were rejected.

## Top bottlenecks and root causes

| Priority | Classification                      | Bottleneck                                               | Evidence / root cause                                                                                                                             | Batch decision                                                                   |
| -------- | ----------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| P0       | PREFETCH/CACHING, NETWORK/RSC       | Dashboard speculative fan-out                            | 86–106 same-origin requests, 18–29 RSC reads, 14–23 aborted requests. Three idle effects bulk-prefetch owner/mobile/FAB route sets before intent. | Implement: disable automatic bulk policy; retain intent/open prefetch.           |
| P0       | AUTH/SESSION, FINANCIAL CORRECTNESS | Project Detail mixed client/fallback boundary            | Verified session is followed by default/internal clients and broad error-to-zero/empty fallback.                                                  | Report only; separate security/correctness authorization required.               |
| P1       | SERVER/DATA, NETWORK/RSC            | Project Detail all-tab load and duplicate canonical read | Every tab starts 20 sources; canonical financial engine runs twice; invoice payments include N+1.                                                 | Implement only canonical reuse; defer tab architecture and billing refactor.     |
| P1       | DATA FETCHING                       | Expenses serial attachment N+1                           | Complete ledger performs two attachment queries per expense in a serial loop after other independent phases.                                      | Implement batched grouping + parallel independent hydration.                     |
| P1       | USER-PERCEIVED LATENCY, NETWORK     | System Health on initial critical path                   | Slowest resource in most cases: 115–434 ms optimized and up to 1,893 ms during dev cold contention; endpoint performs a nested schema check.      | Implement bounded 1.2 s first-poll deferral; retain poll/error semantics.        |
| P1       | SERVER/DATA                         | Dashboard duplicate canonical batch + source N+1         | Risk and bundle repeat financial work; risk source lookup can add one read per project.                                                           | Defer: broader shared-result/API work needs a separate exact plan.               |
| P1       | DATA/CLIENT                         | Invoice list full-table processing                       | Requests `all=1&pageSize=1000`, derives/filter/paginates in memory.                                                                               | Defer: server paging must preserve exact derived-status totals/search semantics. |
| P1       | BUNDLE/HYDRATION                    | Oversized route/client boundaries                        | Project Detail 330 kB first-load / 145.8 kB entry; Estimate Detail 357 kB; Payments 346 kB; Expenses 379 kB; Payroll 387 kB.                      | Defer: module/tab splitting needs interaction-specific first-open proof.         |
| P1       | TABLE/LIST RENDERING                | Workers, Payroll, Tasks, Schedule unbounded client work  | Workers issues four distinct optimized-build APIs; Payroll/Tasks/Schedule load full sets and paginate/filter/render client-side.                  | Defer pending representative large-data measurements.                            |
| P1       | USER-PERCEIVED LATENCY              | Missing pending feedback                                 | Schedule Add label does not change while disabled; Invoice Detail uses plain `Loading...`.                                                        | Defer presentation change to a separately verified UI-neutral patch.             |
| P2       | DATABASE                            | Composite/search index hypotheses                        | Existing indexes are broad but local data is tiny and Production plans were unavailable.                                                          | No migration; require representative read-only EXPLAIN evidence.                 |

## Real slow versus feedback-only

- **Real work:** automatic RSC fan-out, Project all-tab/server queries, Expenses N+1, Invoice full-table transfer, Workers API aggregation, unbounded lists, large hydration boundaries.
- **Primarily feedback:** Schedule Add lacks a pending label.
- **Both:** Invoice Detail has a client-only data waterfall and insufficient page-shaped loading feedback.
- **Environment noise:** development cold compilation and development-only duplicate requests.

## Database/query result

Local `pg_stat_statements` is enabled, but fixture cardinality is not representative and top statements are local Studio/schema/test traffic. Existing migrations contain relevant single-column indexes. No evidence supports a schema/index migration in this batch. Production slow-query/function/RPC duration remains unavailable without approved read-only observability access.

## Selected optimization batch

1. Disable automatic idle route-set prefetch while preserving explicit intent prefetch.
2. Defer the first non-critical system-health poll 1,200 ms while retaining periodic checks and warnings.
3. Batch Expenses attachment reads and parallelize independent list hydration.
4. Reuse the existing in-flight canonical Project financial result.

The batch intentionally does not redesign UI, cache financial data, change business formulas, modify authentication/RLS, alter database schema, push, or deploy.
