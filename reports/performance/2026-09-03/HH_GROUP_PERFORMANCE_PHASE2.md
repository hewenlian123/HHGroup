# HH Group Performance Optimization — Phase 2

Measured 2026-09-03 against Local optimized Production mode and the authenticated live Production deployment. Local changes are the workspace diff on top of `3c507fcb`; Production remained deployment `dpl_iSrFEsA6SjoybsjGLvi54oPAGyW7`, commit `d48a49a1`. No push, deploy, database/schema/index change, financial formula change, business workflow change, security-boundary relaxation, or Frozen UI redesign was performed.

## SHARED BOTTLENECK

Phase 1 removed large amounts of speculative and duplicate work, but most of that work was outside the destination route's critical path. Its point-in-time direct-load FUC measurement therefore did not have to improve when prefetch traffic fell.

The remaining shared critical paths are:

1. **Hard-load hydration gate:** the root layout wraps every route in a client-only `AppShell` with `ssr:false`. Authenticated HTML contains RSC data but no rendered `<main>` without JavaScript. Three controlled Dashboard hard loads inserted the shell/main at 236.8, 131.2, and 130.2 ms; the colder route content appeared at 517.8 ms. A static-server-render experiment failed Production prerendering and was fully reverted rather than shipped.
2. **Repeated authentication amplification:** every protected page/API request executes middleware user verification; several routes then verify again at their own page/API boundary. The live old deployment also speculatively creates many page/API requests, multiplying the auth cost. Supabase Auth compute was fast in sampled logs (2.55 ms median internally), but the number of validations and WAN/request overhead were large.
3. **Broad server data graphs:** Project Detail loads all tabs, Dashboard repeats its canonical project aggregate, AR repeats full invoice/payment reads, Workers performs client API fan-out/N+1, and Invoice Detail waits for a client fetch after hydration.
4. **Confirmed post-mutation sync loop:** an `hh:app-sync` subscriber called the global sync producer, which emitted the same event again every 80 ms and repeatedly refreshed RSC. This did not affect cold direct FUC, but it made write interactions fail to settle.

The strongest answer to “why did query/request reduction not improve FUC/settle?” is therefore: **the removed requests were mostly speculative; direct FUC was still gated by the shared client shell and destination critical path, while mutation settle had a separate recursive refresh bug.**

## ROUTE LATENCY BREAKDOWN

### Local authenticated click navigation — AFTER

Three rounds, 1440×900, optimized Production build, actual in-app clicks. Values are medians. `Server/network complete` is the slowest observed route/API response completion upper bound, not a database-only duration. App Router client navigations reuse an already hydrated shell, so a separate hydration stage is not applicable. Middleware auth occurs inside the RSC/API request and was not independently exposed by Server-Timing; exact auth-complete timestamps are therefore intentionally not fabricated.

| Route           | Click → feedback | RSC start | Auth stage      | Server/network complete | FUC/data-ready | Hydration |  Settled | Browser req / RSC / API | Duplicate / aborted | Static server auth `getUser/getSession` |                      Static DB reads |
| --------------- | ---------------: | --------: | --------------- | ----------------------: | -------------: | --------- | -------: | ----------------------: | ------------------: | --------------------------------------: | -----------------------------------: |
| Projects        |          89.9 ms |   13.8 ms | inside RSC      |                ~92.5 ms |        89.9 ms | reused    | 625.0 ms |               7 / 2 / 1 |               0 / 1 |                                   1 / 1 |                             9 steady |
| Project Detail  |            170.4 |       4.9 | inside RSC      |                  ~151.2 |          267.0 | reused    |    730.2 |               7 / 4 / 1 |               0 / 1 |                                   2 / 1 |       ~48–49 + invoice/chunk fan-out |
| Estimates       |             97.9 |       4.3 | inside RSC      |                   ~79.4 |           97.9 | reused    |    600.7 |               7 / 3 / 0 |               0 / 1 |                                   1 / 1 |                                    3 |
| Estimate Detail |            117.8 |       6.5 | inside RSC      |                   ~85.8 |          117.8 | reused    |    607.6 |              11 / 2 / 0 |               0 / 1 |                                   1 / 1 |                                13–15 |
| Revenue / AR    |            122.5 |       4.4 | inside RSC      |                  ~112.1 |          122.5 | reused    |    598.7 |               4 / 2 / 0 |               0 / 0 |                                   2 / 1 |                                    8 |
| Expenses        |             79.8 |       4.1 | inside RSC/API  |                   ~60.8 |           79.8 | reused    |    631.6 |              25 / 2 / 1 |               4 / 0 |                                   1 / 1 | ~14 for one chunk, plus client reads |
| Workers         |            116.3 |       6.6 | inside RSC/APIs |                  ~104.5 |          116.3 | reused    |    693.9 |               5 / 1 / 3 |               0 / 1 |                    8 / 4 including APIs |        2 server + client API fan-out |
| Schedule        |             60.5 |       4.3 | inside RSC/API  |                   ~68.6 |           84.9 | reused    |    599.9 |               3 / 1 / 1 |               0 / 0 |                     3 / 2 including API |                          3 populated |

Dashboard was measured as a hard-load control because the tested route chain starts there: main/shell insertion median 217.5 ms, Dashboard route-content median 515.4 ms, and network-idle median 1,092 ms. The final AuthProvider emitted two browser `/auth/v1/user` and two `profiles` reads per hard load. Shared first-load JS remains 88.4 kB.

Local Invoice Detail was unavailable because the preserved read-only fixture intentionally contains no invoice. It was covered in authenticated Production; no local financial record was created merely for a benchmark.

### Local BEFORE → AFTER aggregate

| Metric                       |                  BEFORE |         AFTER |           Delta |
| ---------------------------- | ----------------------: | ------------: | --------------: |
| Eight-route click FUC median |                114.6 ms |      109.1 ms | −5.5 ms / −4.8% |
| Eight-route settle median    |                   637.3 |         628.6 | −8.7 ms / −1.4% |
| Projects FUC / settle        |           115.8 / 659.0 |  89.9 / 625.0 |  −22.4% / −5.2% |
| Project Detail FUC / settle  |           282.0 / 746.5 | 267.0 / 730.2 |   −5.3% / −2.2% |
| Estimate Detail FUC / settle |           138.0 / 622.4 | 117.8 / 607.6 |  −14.6% / −2.4% |
| Navigation request counts    | route-specific baseline |     unchanged |      no rebound |

The FUC median improvement is real but not large enough to satisfy the requested “clearly better” success criterion.

## PRODUCTION VS LOCAL

Authenticated Production was profiled read-only at 1200×900 because the Chrome surface clamped the requested width. Production AFTER does not exist because deployment was prohibited.

| Production route | First-tab load | Warm reload | DOM-text stable first / warm | Vercel records / unique paths / API |
| ---------------- | -------------: | ----------: | ---------------------------: | ----------------------------------: |
| Dashboard        |       1,564 ms |    1,252 ms |             2,302 / 2,031 ms |                         39 / 18 / 6 |
| Projects         |          1,211 |         633 |                3,333 / 2,713 |                          11 / 6 / 6 |
| Project Detail   |          1,421 |       1,146 |                3,326 / 3,003 |                          17 / 9 / 6 |
| Estimates        |            725 |         574 |                2,475 / 2,405 |                          19 / 9 / 4 |
| Estimate Detail  |            848 |         754 |                2,360 / 2,010 |                          12 / 5 / 6 |
| Revenue / AR     |          1,197 |         663 |                2,975 / 1,548 |                          16 / 6 / 4 |
| Invoice Detail   |            879 |         610 |                2,957 / 2,503 |                         17 / 10 / 7 |
| Expenses         |          1,075 |         484 |                2,921 / 2,973 |                          14 / 7 / 6 |
| Workers          |          1,078 |         851 |                3,580 / 2,139 |                         15 / 7 / 12 |
| Schedule         |          1,873 |         706 |                3,892 / 2,758 |                          11 / 5 / 8 |

Production first-tab median was 1,138 ms; immediate warm-reload median was 685 ms. During direct click sampling, Project Detail → Estimates measured 1,506 ms to route start, 1,637 ms to destination content, and 1,999 ms to settle; Estimates → Estimate Detail measured 1,694 / 1,782 / 2,178 ms; Estimate Detail → AR measured 1,136 / 1,176 / 1,547 ms. Invoice Detail displayed its heading at 424 ms but was still loading its client API payload, so that value is not reported as data-ready FUC.

Production Chrome did not expose browser Performance Timing/network callbacks, and Vercel records are second-resolution and may include adjacent prefetch. Exact Production auth-complete, data-complete, hydration, browser request, RSC, abort, duplicate, and render-count stages are unavailable; no proxy values were invented.

The live deployment is eight commits behind the Phase 1 state and lacks its verified prefetch, delayed health-poll, expense attachment, and Project Detail canonical-result changes. It still produced Dashboard route-set prefetch fan-out and immediate `/api/system-health` → sequential `/api/schema-check` work. Vercel functions run in `iad1`, Supabase is in `us-east-2`, and Hawaii traffic entered through `pdx1`. Vercel is configured for Node 24.x while the repository and Local contract require Node 22.x.

## IMPLEMENTED OPTIMIZATIONS

### 1. Stop recursive and duplicate global sync refreshes

- **ROOT CAUSE:** sync subscribers called `syncRouterNonBlocking`, which redispatched `hh:app-sync`; a producer-scheduled refresh was also followed by a subscriber refresh.
- **BEFORE:** one read-only event on Local Projects produced 19 identical RSC requests in 1.6 seconds; an independent 650 ms sample observed 9 events and 8 RSC requests.
- **CHANGE:** subscribers now use refresh-only behavior; sync event detail declares `refreshScheduled`, so subscribers do not duplicate the producer's refresh. Client-only refetch callbacks still run.
- **AFTER:** one direct event produced one event and one subscriber RSC; a producer-scheduled event produced one event and zero subscriber RSC, leaving the producer's single intended refresh.
- **DELTA:** repeated RSC 19 → 1 (−94.7%) for the direct-event reproduction; recursive events eliminated.

The guard covers 12 `useOnAppSync` refresh subscribers plus the Project Detail manual listener, including Projects, Workers, Customers, Documents, Change Orders, Bills, Commissions, Advances, Subcontracts, and settings.

### 2. Remove duplicate AuthProvider bootstrap

- **ROOT CAUSE:** AuthProvider called `loadAuthState()` manually and also called it from Supabase `onAuthStateChange`, whose installed Auth client guarantees an `INITIAL_SESSION` callback after subscription.
- **BEFORE:** three browser `/auth/v1/user` plus three `profiles` reads on every sampled hard load.
- **CHANGE:** subscribe once and let the guaranteed initial auth event start the authoritative `getUser()` path. Server middleware, route guards, role derivation, permission loading, sign-out handling, and fail-closed behavior were not changed.
- **AFTER:** two `/auth/v1/user` plus two `profiles` reads on each of three Dashboard hard loads.
- **DELTA:** 3 + 3 → 2 + 2 (−33.3%). A second event remains and was not speculatively suppressed without proof of its cause.

### Rejected candidate

Server-rendering the current root AppShell was tested because it is the largest shared hard-load gate. The optimized build failed prerendering with an undefined client-only component across many routes. The change and its provisional test were reverted. Fixing this safely requires splitting the browser-only shell/provider graph, not toggling one flag.

## DATABASE / QUERY FINDINGS

- **Project Detail P0:** active tab is parsed, but all tab datasets load. Static count is roughly 48–49 reads plus invoice and expense-chunk fan-out. Billing re-queries payments per invoice and the page separately loads derived invoices again.
- **Dashboard P0:** roughly `34 + N` reads; its eight-request canonical project-profit batch runs twice, and project risk adds a project-source N+1.
- **Revenue / AR P0:** eight reads include two invoice-header, two item, three payment, and one project read.
- **Workers P0 Production:** one observed second contained 12 `worker_advances` reads, consistent with per-worker balance N+1 across labor, payments, reimbursements, and advances.
- **Invoice Detail P1:** invoice → items → payments is serial before related project/payment/deposit reads; attachment signing adds another fan-out.
- **Expenses P1:** full archive and chunk hydration remain, although Phase 1 removed the 242-query attachment loop.
- Local tables are too small for index-benefit evidence. Read-only plans show sequential scans and the catalog lacks usable predicate indexes for `invoice_items(invoice_id)`, `invoice_payments(invoice_id)`, `subcontract_bills(project_id,status)`, `payments_received(invoice_id)`, `deposits(invoice_id)`, and `projects(updated_at)`. These are measurement candidates only; no migration was created.
- Production Project Detail emitted at least 61 permission-denied events plus missing-column errors for `workers.trade`, `project_material_selections.item`, and `punch_list.description` during the sampled interval. The page still returned 200 through broad empty/zero fallbacks. This is both wasted work and a correctness/error-boundary risk; it must not be hidden or cached away as a performance fix.

## CLIENT / REACT FINDINGS

- The client-only AppShell is the shared hard-load gate. Shared first-load JS is 88.4 kB.
- Route first-load JS remains: Project Detail 330 kB, Estimate Detail 357 kB, Expenses 380 kB, Invoice Detail 230 kB, Workers about 170 kB, Schedule 163 kB.
- Single-sample root commits in the initial ~1.2 seconds were Dashboard 13, Projects 15, Expenses 26, Workers 15, and Schedule 14. Component attribution was not available, so no speculative `memo` changes were made.
- Expenses still mirrors multiple query results through layout effects and performs whole-list client reductions. Projects, AR, Workers, and Schedule render separate mobile and desktop collection trees; representative large-data CPU evidence is still required before pagination/virtualization changes.
- Invoice Detail and Schedule begin useful data loading after hydration through client APIs. Only Dashboard and Invoice Detail have route-level loading boundaries among the audited routes; the Invoice boundary does not cover its post-mount data fetch.
- Phase 2 did not add skeletons merely to lower a headline. Feedback and data-ready FUC remain separately reported.

## VERIFICATION

- Final optimized build: pass; shared first-load JS stayed 88.4 kB.
- TypeScript: pass.
- Lint: pass with zero warnings/errors.
- Unit tests: 1,078 passed, 10 skipped.
- Source/design/security contracts: 181 passed.
- New performance contracts: four passed; they prevent sync re-broadcast, producer/subscriber duplicate refresh, and duplicate AuthProvider bootstrap.
- Responsive Local QA: 27/27 route/viewport cells across 1440, 820, and 390; console errors 0, page errors 0, non-2xx responses 0, horizontal overflow 0.
- Financial/business/security diff: no formula, mutation, workflow, middleware, RLS, or database code changed. Unexpected financial delta = 0 by code scope and full financial/security regression suites; business behavior changes = none; security boundary changes = none; UI architecture changes = none.

## REMAINING BOTTLENECKS

### P0

- Resolve Project Detail's mixed-client permission/missing-column failures and broad error-to-zero/empty fallback under a separately reviewed security/correctness change before data-load optimization.
- Deploy neither Phase 1 nor Phase 2 from this task. Production still runs the old fan-out, so a genuine Production AFTER comparison does not yet exist.

### P1

- Split browser-only AppShell providers/components so route HTML can be server-rendered without the failed global prerender path.
- Add request-scoped tracing/Server-Timing for middleware auth, page auth, helper/query, RSC completion, and function cold/warm stages.
- Consolidate Dashboard canonical/project reads and AR invoice/payment reads with exact financial output regression fixtures.
- Batch Workers balance queries and remove its client API N+1 using representative Production-scale evidence.
- Load Project Detail data by active tab only after preserving tab navigation and financial failure semantics.
- Move Invoice Detail's initial data to the server or parallelize its API dependency graph after an exact authenticated fixture can prove data-ready improvement.
- Identify the remaining second AuthProvider event before attempting another auth-call reduction.

### P2

- Capture read-only Production `EXPLAIN (ANALYZE, BUFFERS)` and `pg_stat_statements` on a representative clone before proposing any index.
- Align Vercel Node runtime with the repository's Node 22.x contract in a separately approved environment change.
- Add representative list cardinalities and component-level React profiles before virtualization or broad memoization.

## FINAL VERDICT

`HH GROUP PERFORMANCE OPTIMIZATION = NEEDS FIXES`

Phase 2 found and fixed a severe shared settle loop and reduced duplicate client auth work without changing financial, business, UI, or security semantics. However, the core navigation FUC median improved only 4.8%, authenticated Production still runs the old code, exact Production stage tracing is unavailable, and Production Project Detail is swallowing permission/schema errors. Those facts fail the requested PASS threshold.
