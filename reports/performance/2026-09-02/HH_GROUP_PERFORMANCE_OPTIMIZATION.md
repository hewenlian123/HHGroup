# HH Group Performance / Responsiveness Optimization

Measured 2026-09-02–2026-09-03. Baseline commit `d48a49a1`; optimized application state is the net diff from that commit after four reviewed optimizations. No push, deploy, database/schema migration, UI redesign, financial formula change, business-workflow change, authentication/RLS relaxation, or cross-user cache was performed.

## 1. PERFORMANCE BASELINE

| Environment                  | Coverage                                                                           |                                                   First useful content |                       Full settle |                                    Requests | Validity                                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------: | --------------------------------: | ------------------------------------------: | --------------------------------------------------------------------------------------------------------------------------- |
| Local development BEFORE     | 72 direct observations                                                             | 705.3 ms median in the initial matrix; 997.6 ms in added core surfaces |       1,630.9 / 1,986.6 ms median | 20 same-origin median in the initial matrix | Development compilation and React development behavior materially inflate the result.                                       |
| Local optimized build BEFORE | 45 direct observations: 14 requested pages plus Invoice discovery list, × 3 widths |                                        137.4 ms median, 102.9–552.7 ms | 805.5 ms median, 721.3–1,182.5 ms |         42 same-origin, 1 RSC, 2 API median | Authenticated and representative for this local fixture; Invoice Detail unavailable because no safe visible record existed. |
| Production BEFORE            | Anonymous Home/Login/protected redirect at 3 widths                                |                                               509.3 ms median to Login |                 1,253.2 ms median |                             38 total median | Protected operational pages could not be measured without an approved authenticated Production session.                     |

The valid development-mode Dashboard → Projects click reached destination-specific useful content in 326.9–414.1 ms. Earlier optimized-build click samples that observed stale Dashboard content were rejected and are not used.

## 2. TOP BOTTLENECKS

| Priority                         | Classification                  | Finding                                                                                                       | Evidence                                                                                                                       |
| -------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| P0 PERFORMANCE                   | PREFETCH/CACHING, NETWORK/RSC   | Automatic Dashboard route-set prefetch fan-out                                                                | 86–106 same-origin requests, 18–29 RSC requests, and 14–23 aborted requests before user intent.                                |
| P0 EXISTING CORRECTNESS/BOUNDARY | AUTH/SESSION, SERVER/DATA       | Project Detail mixes a verified session with default/internal helpers and broad error-to-zero/empty fallbacks | Existing path is outside this performance patch because correcting it would change security and financial failure semantics.   |
| P1                               | SERVER/DATA                     | Project Detail loads all tab sources and computes canonical project profit twice                              | Twenty server sources start regardless of active tab; the duplicate canonical call was safely removable.                       |
| P1                               | DATA FETCHING                   | Expenses list performs two serial attachment reads per expense                                                | Deterministic 121-row fixture observed 242 attachment queries.                                                                 |
| P1                               | USER-PERCEIVED LATENCY, NETWORK | Non-critical System Health check competes with the first-content window                                       | It was the slowest optimized-build resource in most BEFORE samples at 115–434 ms.                                              |
| P1                               | BUNDLE/HYDRATION                | Large route/client boundaries                                                                                 | Project Detail 330 kB, Estimate Detail 357 kB, Payments 346 kB, Expenses 379 kB, Payroll 387 kB first-load JS.                 |
| P1                               | DATA/TABLE                      | Invoice, Workers, Payroll, Tasks, Schedule process broad or unbounded client-side sets                        | Invoice requests up to 1,000 rows; Workers uses four APIs; the other lists lack representative large-data pagination evidence. |

## 3. ROOT CAUSES

- Route prefetch was scheduled from idle effects for owner navigation, mobile navigation, and the FAB, so it was speculative rather than intent-driven.
- Global System Health ran immediately on mount even though it is operational diagnostics, not required content.
- `getExpenses` hydrated attachments inside the row loop, while other independent list hydration phases were also serialized.
- Project Detail independently called the same canonical financial engine directly and through `getProjectCostDashboard`.
- Several remaining routes couple large client boundaries to broad data loads. These need representative scale evidence and narrower architecture work, not speculative memoization.
- Development cold compilation and development-only duplicate requests were environment noise, not Production-mode regressions.

## 4. IMPLEMENTED OPTIMIZATIONS

1. Disabled automatic route-set prefetch while preserving explicit hover, focus, pointer-down, bottom-navigation intent, and FAB-open prefetch behavior.
2. Deferred the first System Health poll by 1,200 ms; the 60-second cadence, 30-second cache, warnings, route exclusions, and toast behavior remain live.
3. Batched both expense attachment tables in bounded chunks of 120 IDs, grouped and deduplicated with the existing mapping, and ran independent list hydration with the same request-scoped client.
4. Shared one in-flight canonical Project financial promise between Project Detail and `getProjectCostDashboard`; all formulas and the fail-closed fallback remain unchanged.

Every application change passed task-scoped independent review. A new generic performance harness was rejected after three review rounds because its Production mutation guard and timing contract remained unsafe/inaccurate; all three harness commits were reverted, and none of its output is used here.

Final verification on the current code state: 1,074 unit tests passed and 10 were skipped; 181 source/design/security contract tests passed; lint passed with zero warnings/errors; TypeScript passed; the final Next.js optimized build passed. The read-only AFTER browser matrix completed 45/45 cells with zero authentication redirects, console errors, page errors, non-2xx responses, duplicate URLs, or horizontal-overflow cases.

## 5. BEFORE → AFTER METRICS

The AFTER matrix completed 45/45 unique Local optimized-build cells—14 requested pages plus the Invoice discovery list—at 1440, 820, and 390 px. Invoice Detail itself remained unavailable. The network fan-out improved materially, but the point-in-time aggregate content timings did not improve; this is one reason the final verdict remains NEEDS FIXES.

| Metric                                                   |                            BEFORE |                                                 AFTER | Delta / interpretation                                         |
| -------------------------------------------------------- | --------------------------------: | ----------------------------------------------------: | -------------------------------------------------------------- |
| Direct FUC median                                        |                          137.4 ms |                                              195.9 ms | +58.5 ms / +42.6%; regression in this point-in-time run        |
| Direct FUC range                                         |                    102.9–552.7 ms |                                        125.9–614.3 ms | Wider/slower upper bound                                       |
| Full settle median                                       |                          805.5 ms |                                              860.3 ms | +54.8 ms / +6.8%; regression in this point-in-time run         |
| Full settle range                                        |                  721.3–1,182.5 ms |                                      734.2–1,283.6 ms | Wider/slower upper bound                                       |
| Same-origin / RSC / API median                           |                        42 / 1 / 2 |                                            42 / 1 / 2 | Median unchanged; Dashboard distribution improved              |
| Dashboard same-origin D/T/M                              |                     86 / 99 / 106 |                                          53 / 53 / 53 | −38.4% / −46.5% / −50.0%                                       |
| Dashboard RSC D/T/M                                      |                      18 / 24 / 29 |                                             8 / 8 / 8 | −55.6% / −66.7% / −72.4%                                       |
| Dashboard aborted D/T/M                                  |                      16 / 14 / 23 |                                             4 / 4 / 4 | −75.0% / −71.4% / −82.6%                                       |
| System Health first request                              | about 115.5–232.3 ms on Dashboard | 1,311.2–1,507.9 ms across 45 pages; median 1,394.2 ms | Removed from first-content competition, retained once per page |
| Auth redirects / console errors / page errors / overflow |                     0 / 0 / 0 / 0 |                                         0 / 0 / 0 / 0 | No regression                                                  |

Dashboard → Projects AFTER produced valid destination-specific click evidence at all widths: click→route request 38.5–42.4 ms and click→useful destination content 163.7–193.8 ms. The earlier optimized-build BEFORE click samples were invalid and therefore no fabricated before/after click delta is reported. Mobile Projects → Project AFTER measured 68.6 ms to route request and 306.6 ms to target content; desktop/tablet lacked a visible safe detail anchor.

Deterministic code-path metrics already verified:

| Path                                                   |              BEFORE |               AFTER |              Delta |
| ------------------------------------------------------ | ------------------: | ------------------: | -----------------: |
| Expense attachment queries for 121 rows                |                 242 |                   4 |            −98.35% |
| Project Detail canonical profit executions per request |                   2 |                   1 |               −50% |
| Financial fixed-fixture output                         | Authorized baseline | Byte-for-byte equal | Unexpected delta 0 |

## 6. DATABASE / QUERY FINDINGS

- Local `pg_stat_statements` 1.11 is enabled, but fixture cardinality is tiny: 1 project, 1 expense, 1 expense line, 1 document, 2 tasks, 1 labor row, 1 worker, 1 worker invoice, and no invoices/payments.
- Existing committed indexes broadly cover the reviewed attachment and foreign-key filters, including attachment entity/type and expense attachment expense ID paths.
- Local top statements were Studio, schema, and test traffic, so they are not representative Production slow-query evidence.
- No evidence justifies an index or schema migration in this batch. No migration was created or applied.
- Production query plans, RPC durations, function durations, and cold/warm database behavior remain unavailable without approved read-only Production observability access.

## 7. CLIENT / REACT FINDINGS

- Shared first-load JS remains 88.4 kB; no optimization moved server work into a client component or enlarged a hydration boundary intentionally.
- Largest reviewed route totals remain Payroll 388 kB, Expenses 380 kB, Estimate Detail 357 kB, Payments 346 kB, and Project Detail 330 kB after rounding.
- React Query already disables focus refetch globally; there was no need to change that policy.
- Project Detail is still a large all-tab client boundary. Invoice Detail still begins with a client fetch and plain text loading. Schedule Add still has a feedback-only pending-label gap.
- Broad app-sync refreshes can still pair an RSC refresh with subscriber refetches. No refresh was removed without proving its business invalidation semantics.
- Optimized-build React commit counts and hydration-phase CPU were not captured with a Production React Profiler. Bundle boundaries, request behavior, content timing, errors, and overflow were measured; render-count claims are therefore limited to development-only duplicate-request observations.

## 8. PRODUCTION VS LOCAL DIFFERENCE

- Local development is dominated by cold compilation and development-only render/request duplication; optimized local builds are the meaningful BEFORE/AFTER comparison.
- Production anonymous routing was slower than optimized local content and included a 307 protected-route redirect, but it does not represent authenticated business pages.
- Vercel headers exposed no Server-Timing values, and no linked Vercel project/CLI token or approved Production browser session was available.
- Because deployment was explicitly prohibited, Production AFTER is not a new deployed state: the live site is unchanged. Local AFTER validates the code intended for a future release; it is not evidence of deployed Production improvement.

## 9. REMAINING P1/P2

### P1

- Separate Project Detail authorization/failure-boundary hardening, then load only active-tab data and remove remaining invoice-payment N+1 behavior.
- Consolidate Dashboard duplicate canonical/source reads with exact request-scoped reuse.
- Move Invoice filtering/pagination server-side only after preserving derived-status counts, search, and totals exactly.
- Add representative large-data measurements before virtualizing or paginating Workers, Payroll, Tasks, and Schedule.
- Split the largest optional client modules only with first-open interaction evidence.
- Add presentation-neutral pending feedback for Schedule Add and page-shaped loading for Invoice Detail in a separately approved UI-neutral patch.

### P2

- Capture representative Production read-only EXPLAIN/ANALYZE, RPC, function, middleware, and cold/warm traces before proposing indexes or schema changes.
- Add an approved authenticated Production performance session and safe observability access; do not weaken RLS or use broad service-role caching.
- Add a Production-safe React/hydration profiler and repeatable click-timing harness before making route-wide rerender-count claims. The attempted generic harness in this campaign was rejected and reverted rather than being used as unreliable evidence.

## Final verdict

`HH GROUP PERFORMANCE OPTIMIZATION = NEEDS FIXES`

The selected low-risk optimization batch is implemented and regression-safe, but the campaign cannot pass while authenticated Production evidence is unavailable, Production has not received an AFTER build by design, Invoice Detail lacks a safe measured record, Project Detail retains an existing boundary/correctness risk, and multiple P1 scale bottlenecks remain.
