# HH Group Performance Optimization — Phase 4 Candidate Report

Date: 2026-09-03\
Scope: Local authenticated Production build; no Push; no Deploy; no database/schema/index changes.

## Executive result

Phase 4 produced a buildable and regression-clean local candidate, but it is not approved for Production promotion yet.

- Production build: PASS, 145/145 static pages generated.
- Authenticated browser QA: PASS, 1440 / 820 / 390, console errors 0, page errors 0, non-2xx responses 0.
- JavaScript-disabled structural-content gate: PASS. Authenticated Dashboard `main` and route content exist without JavaScript; the response is not skeleton-only.
- Unit tests: 1,148 passed, 10 skipped.
- Source-contract tests: 185/185 passed.
- TypeScript: PASS.
- ESLint: PASS, 0 warnings/errors.
- Design-token gate: PASS.
- Financial regression fixtures: unexpected delta 0.
- Business behavior changes: none observed.
- Security boundary changes: none; request-scoped authenticated clients and fail-closed paths remain enforced.
- Frozen UI/UX architecture: unchanged at the presentation level.
- Push: not performed.
- Deploy: not performed.

Promotion remains on HOLD because the local performance proof is not fully comparable to the Phase 3 baseline, Project Detail added two code-chunk requests even though data requests did not rebound, and the comparable settle median is not proven better.

## Measurement correction

The Phase 3/early Phase 4 browser profiler overstated Dashboard FUC. Its Playwright visibility wait and full-body DOM observer had coarse/observer-dependent timing on the large Dashboard tree.

Controlled same-build A/B:

| Measurement                              |    Dashboard FUC |
| ---------------------------------------- | ---------------: |
| Old profiler path                        |           843 ms |
| Low-disturbance in-page visibility clock |           389 ms |
| Measurement delta                        | -454 ms / -53.9% |

This is a profiler correction, not a product optimization. Therefore, Phase 3 FUC values and corrected Phase 4 FUC values are shown for context but are not treated as a clean causal BEFORE → AFTER comparison.

The corrected profiler now:

- disconnects the first-feedback observer after its first mutation;
- measures useful-content visibility in-page on animation frames;
- starts a separate post-FUC settle observer;
- records request type, RSC, API, direct Supabase, duplicate paths, aborts, React commits, slowest request, and duration-only Server-Timing.

## APPSHELL DECOMPOSITION

### Root cause

The previous whole-AppShell `ssr:false` boundary withheld the structural shell and route content until the complete client shell hydrated. A direct global SSR experiment had also exposed a prerender failure caused by the Attachment Preview modal's browser-only/framer-motion import graph.

### Change

- Root layout now statically imports the SSR-capable structural AppShell.
- Structural AppShell emits the application frame and `main` route content in server HTML.
- Browser-only chrome is isolated in `AppShellChrome`:
  - pathname/search subscriptions;
  - localStorage sidebar state;
  - media-query/tablet navigation;
  - mobile Sheet navigation;
  - Sidebar, Topbar, BottomNav, FAB, command palette;
  - System Health poller;
  - PWA prompt;
  - browser scroll-lock recovery;
  - portal placement.
- Attachment Preview state remains available globally, while the heavy modal is a bounded non-SSR leaf.
- Themed portal fallback remains inside the HH route theme host.
- Page-local browser-only failures found by the stricter build were bounded at Worker Invoices, Labor Reimbursements, and Settings Security instead of reverting the whole shell.

### Proof

- JavaScript disabled: authenticated Dashboard `main` + `.page-container` visible; 1/1 Playwright test passed.
- Production build: 145/145 pages generated.
- Shared First Load JS: 88.4 kB Phase 3 → 88.8 kB Phase 4, +0.4 kB. This is not claimed as a bundle reduction.
- Primary route content no longer depends on the entire interactive chrome island becoming ready.

## PROJECT DETAIL

### Root cause

Project Detail rendered one monolithic workspace data graph. Opening the default tab loaded data for inactive tabs, while the active-tab UI did not express which server payload was actually required.

### Change

- Active workspace tab is URL-backed.
- Initial server reads load persistent project/financial header data plus only the current tab's workspace data.
- Inactive tab data is fetched only after the user selects that tab.
- The same request-scoped authenticated Supabase client is threaded through the graph.
- Canonical profit/cost data remains authoritative and is not error-cached.
- Permission/schema/network failures remain fail-closed; legitimate zero/empty values remain valid.

### Data graph BEFORE → AFTER

| Metric                             | BEFORE |          AFTER |          Delta |
| ---------------------------------- | -----: | -------------: | -------------: |
| Workspace loaders on initial open  |     19 | 4 for Overview |   -15 / -78.9% |
| Browser data requests              |      2 |              2 |     no rebound |
| Direct browser Supabase requests   |      0 |              0 |      unchanged |
| Total critical resource requests   |      3 |              5 | +2 code chunks |
| RSC requests                       |      1 |              1 |      unchanged |
| API requests                       |      1 |              1 |      unchanged |
| Permission-denied failures         |      0 |              0 |      unchanged |
| Missing-column failures            |      0 |              0 |      unchanged |
| Fake financial zero/empty fallback |      0 |              0 |      unchanged |

The two added requests are route code chunks totaling about 20 kB uncompressed, not database/API reads. Total request count nevertheless increased, so the strict total-request gate is not marked PASS.

Active-tab loader counts after the change: Overview 4, Financial 3, Tasks 5, Schedule 1, People 5, Documents 1, Materials 2, Closeout 3, Photos 0, Inspections 0, plus persistent header/canonical reads.

Corrected local 1440 metrics: feedback 7.5 ms, RSC start 22 ms, first React commit 158.8 ms, FUC 164.9 ms, settle 667 ms, 5 total resources, 1 RSC, 1 API, 0 direct Supabase, 1 aborted request, 5 commits.

## DASHBOARD

### Root cause

Dashboard had three server-data waves and helper calls that did not consistently reuse one request client. After the database graph completed, the large RSC tree still required a material client apply/reconciliation interval. Visible Dashboard links also trigger a post-render prefetch burst that mainly affects settle, not first useful content.

### Change

- One request-scoped authenticated Supabase client is reused.
- Primary, subcontract, and metrics read groups are all started before any group is awaited.
- The project/risk bundle shares canonical reads instead of reopening the same source path.
- No blanket Link-prefetch disable was introduced.
- Pointer-intent/native-click A/B improved FUC by only about 9–15 ms, so that experiment was not retained.

### BEFORE → AFTER

| Metric                          |                               BEFORE |             AFTER | Result                                        |
| ------------------------------- | -----------------------------------: | ----------------: | --------------------------------------------- |
| Server-data waves               |                                    3 | 1 concurrent wave | PASS                                          |
| Request-scoped clients in graph |    repeated helper creation possible | 1 threaded client | PASS                                          |
| Query count                     |                          about 25–26 |       about 25–26 | no query-count claim                          |
| Corrected local 1440 FUC        | old baseline not directly comparable |          394.1 ms | attribution incomplete                        |
| Local 1440 settle               |                     1,225 ms Phase 3 |            805 ms | -420 ms / -34.3%, with profiler-method caveat |
| Critical requests               |                                   17 |                17 | no rebound                                    |
| RSC / duplicates / aborts       |                     8 / 2 / 4 median |  8 / 2 / 4 median | remaining cost                                |

Typical local server-data time after optimization is about 30–55 ms, with RSC preparation below 1 ms. The remaining gap to approximately 394 ms FUC is dominated by Flight response application/client reconciliation of the large Dashboard tree, not Supabase query time or a hidden CSS opacity delay.

The 8 RSC requests are mostly destination Link prefetches that start when Dashboard content becomes available. They occur too late to explain Dashboard FUC, but they extend network activity and create 4–7 aborts per navigation.

## EXPENSES

### Root cause

Expenses opened as a large client workspace and fanned out browser Supabase reads. Existing pointer prefetch duplicated the new server initial graph, and payment-account fallback could become 1+M reads.

### Change

- Added a strict server-side initial loader.
- Reused one request-scoped owner/admin client.
- Started expenses, categories, workers, deduction options, projects, and payment accounts concurrently.
- Seeded React Query with server results and disabled refetch-on-mount for that initial data.
- Removed only the obsolete Expenses client-data prefetch; normal route prefetch and Receipt Queue prefetch remain.
- Batched the payment-account fallback to at most two reads.
- Errors return the existing explicit server-data fallback; financial errors are not cached or converted to fake empty data.

### BEFORE → AFTER

| Metric                        |                                   BEFORE |               AFTER |                       Delta |
| ----------------------------- | ---------------------------------------: | ------------------: | --------------------------: |
| Total requests                |                                       25 |                   8 |                -17 / -68.0% |
| Direct browser Supabase reads |                                 about 17 |                   0 |                       -100% |
| Duplicate paths               | 4 during duplicate-prefetch reproduction |                   0 |                          -4 |
| React commits, 1440           |                                       16 |                   9 |                 -7 / -43.8% |
| Settle, 1440                  |                                 631.6 ms |              557 ms |           -74.6 ms / -11.8% |
| Corrected FUC, 1440           | old 79.8 ms marked an empty client shell | 139.5 ms data-ready | not semantically comparable |

The new FUC is data-ready content. The former 79.8 ms marker could appear before authoritative expense data arrived, so it is not used as evidence of a regression.

## ESTIMATE DETAIL

### Root cause

Estimate Detail created six server clients and performed invoice-link/payment-summary reads sequentially after the primary data graph.

### Change

- Server client count reduced from 6 to 2: one authenticated read client and one no-store admin client for existing authoritative admin-only reads.
- The primary independent reads remain parallel.
- Invoice-project linkage and payment-invoice summaries now run in parallel.
- Estimate V3 UI/UX and all amount/summary semantics are unchanged.

### BEFORE → AFTER

| Metric                   |                      BEFORE |      AFTER |                   Delta |
| ------------------------ | --------------------------: | ---------: | ----------------------: |
| Server clients           |                           6 |          2 |             -4 / -66.7% |
| Post-primary read stages |                2 sequential | 1 parallel |                -1 stage |
| First Load JS            |                about 357 kB |     356 kB |             about -1 kB |
| Corrected local 1440 FUC | 117.8 ms legacy measurement |   129.0 ms | not directly comparable |
| Local 1440 settle        |                    607.6 ms |     550 ms |        -57.6 ms / -9.5% |
| Total resources          |                          11 |         13 |         +2 route assets |

## SCHEDULE

### Root cause

The Schedule route loaded projects once directly and again inside `getAllScheduleWithProject`.

### Change

- A shared projects promise is passed into the schedule helper.
- Schedule and projects await the same request-scoped result.
- Workflow and create behavior are unchanged.

### BEFORE → AFTER

| Metric                 |                               BEFORE |                               AFTER |                  Delta |
| ---------------------- | -----------------------------------: | ----------------------------------: | ---------------------: |
| Database project reads | 2 project reads inside 3 total reads | 1 project read inside 2 total reads | -1 read / -33.3% total |
| Browser requests       |                                    3 |                                   3 |              unchanged |
| Local 1440 FUC         |                              84.9 ms |                             86.0 ms |                +1.1 ms |
| Local 1440 settle      |                             599.9 ms |                              585 ms |       -14.9 ms / -2.5% |

Representative 1440 Server-Timing: middleware auth 46.0 ms, middleware total 46.1 ms, Route Handler auth 30.1 ms, server-data 5.8 ms, handler total 36.0 ms.

## LOCAL ROUTE LATENCY BREAKDOWN

Corrected authenticated Production-build medians at 1440×900, three rounds:

| Route           | Feedback | RSC start | First commit |   FUC | Settled | Requests | RSC | API | Direct Supabase | Dupes | Aborts | Commits | Slowest |
| --------------- | -------: | --------: | -----------: | ----: | ------: | -------: | --: | --: | --------------: | ----: | -----: | ------: | ------: |
| Dashboard       |     12.0 |        24 |         83.3 | 394.1 |     805 |       17 |   8 |   0 |               0 |     2 |      4 |       5 |   92 ms |
| Projects        |     11.7 |        16 |         92.0 |  95.5 |     598 |        7 |   2 |   1 |               0 |     0 |      1 |       6 |  101 ms |
| Project Detail  |      7.5 |        22 |        158.8 | 164.9 |     667 |        5 |   1 |   1 |               0 |     0 |      1 |       5 |  108 ms |
| Estimate Detail |      7.2 |        24 |        122.1 | 129.0 |     550 |       13 |   2 |   0 |               0 |     0 |      1 |       4 |   76 ms |
| Revenue / AR    |      2.0 |        19 |        120.1 | 122.7 |     541 |        5 |   2 |   0 |               0 |     0 |      1 |       4 |   46 ms |
| Workers         |      6.0 |        20 |         24.7 | 151.0 |     674 |        5 |   1 |   3 |               0 |     0 |      1 |       5 |  138 ms |
| Expenses        |     10.5 |        18 |         22.1 | 139.5 |     557 |        8 |   2 |   0 |               0 |     0 |      0 |       9 |   98 ms |
| Schedule        |      8.0 |        19 |         83.3 |  86.0 |     585 |        3 |   1 |   1 |               0 |     0 |      0 |       4 |   78 ms |

All values are milliseconds except counts.

Viewport medians:

| Viewport | Dashboard FUC / settle | Project Detail FUC / settle | Expenses FUC / settle | Estimate FUC / settle | Schedule FUC / settle |
| -------- | ---------------------: | --------------------------: | --------------------: | --------------------: | --------------------: |
| 1440     |            394.1 / 805 |                 164.9 / 667 |           139.5 / 557 |           129.0 / 550 |            86.0 / 585 |
| 820      |            387.6 / 808 |                 161.9 / 658 |           173.5 / 587 |           115.6 / 532 |            26.6 / 522 |
| 390      |            392.0 / 807 |                 173.9 / 668 |           112.8 / 529 |           129.1 / 550 |            64.5 / 558 |

### Server stage samples

Server Components cannot mutate the outgoing RSC response header in this Next.js version, so page timings are emitted as duration-only route-template logs and correlated with browser RSC resources. Route Handlers attach duration-only Server-Timing headers.

| Route           | Middleware/auth |                 Page/handler auth |             Server data |        RSC prep |        Page/handler total |
| --------------- | --------------: | --------------------------------: | ----------------------: | --------------: | ------------------------: |
| Dashboard       | typically 25–50 |               no second page auth |         typically 30–55 |              <1 |           typically 30–55 |
| Projects        | typically 30–48 |              0.2–0.8 client setup |                   13–22 |              <1 |                     13–23 |
| Project Detail  |     43.2 sample |                         27.7–39.8 |                   43–58 |              <1 |                     71–98 |
| Estimate Detail |       35.8–56.8 |              0.2–0.5 client setup |                   17–35 |              <1 |                     18–37 |
| Revenue / AR    |     46.1 sample |                     28–45 typical |             6–9 typical |              <1 |             35–53 typical |
| Workers         |    34–47 sample | page 33–39; balance handler 31–41 | page 5–6; balance 10–19 |              <1 | page 39–44; balance 42–60 |
| Expenses        |       28.7–42.8 |                             24–33 |                   12–17 |              <1 |                     36–50 |
| Schedule        |     46.0 sample |                      handler 30.1 |                     5.8 | n/a client page |              handler 36.0 |

Hydration/RSC application is represented by first React commit and the gap from first commit to FUC. Dashboard's 83 → 394 ms gap is the largest remaining frontend critical-path interval.

## LOCAL BEFORE → AFTER GATE

| Gate                                          | Status                     | Evidence                                                                                                                                    |
| --------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard FUC clearly lower                   | PARTIAL                    | Corrected FUC is ~394 ms, but ~454 ms of the apparent Phase 3 delta is measurement-method correction and cannot be claimed as product gain. |
| Project Detail request count does not rebound | PARTIAL                    | Data requests remain 2; total resources rise 3 → 5 because of two code chunks.                                                              |
| Expenses requests/commits significantly lower | PASS                       | 25 → 8 requests; direct Supabase ~17 → 0; commits 16 → 9.                                                                                   |
| Settle does not worsen                        | NOT PROVEN                 | Several routes improve, but Project Detail/Workers fluctuate upward and the comparable median is not cleanly better.                        |
| Console/page errors                           | PASS                       | 0 / 0 across 72-sample matrix and final 24-route-view smoke.                                                                                |
| Financial unexpected delta                    | PASS in automated fixtures | 0; canonical financial regression tests pass.                                                                                               |
| Business/security/UI semantics                | PASS                       | Full tests, source contracts, design tokens, authenticated browser QA, and build pass.                                                      |

## PRODUCTION CANDIDATE STATUS

Status: HOLD — local build is technically valid, but performance promotion criteria are not all proven.

Production AFTER was not collected because the user explicitly prohibited Push and Deploy. No production system was changed.

Existing Production BEFORE baselines remain:

- warm navigation median: 685 ms;
- first-tab median: 1,138 ms;
- Dashboard warm: 1,252 ms;
- Dashboard first-tab: 1,564 ms.

Vercel cold/warm function behavior and Production Supabase network latency therefore remain unverified for this candidate.

## REMAINING BOTTLENECKS

### P1 — Dashboard client RSC application

Server data is generally 30–55 ms, but corrected Dashboard FUC is about 394 ms. The main remaining interval is applying/reconciling the large Dashboard RSC tree after the first commit. This requires a bounded Dashboard component/data-payload decomposition with a controlled same-build BEFORE/AFTER, not more database micro-optimization.

### P1 — Dashboard post-render prefetch burst

Dashboard produces 8 RSC requests, 2 duplicate paths, and 4–7 aborts. The burst starts around useful-content appearance and mainly affects settle. Any demand-driven or idle-budgeted policy must be kept only after an A/B shows lower settle without slower subsequent navigation.

### P1 — Shared auth/middleware repetition

Authenticated RSC and API requests commonly spend about 25–50 ms in middleware/session verification. Routes that add client APIs can pay this more than once. Any future change must preserve fail-closed verification and request-scoped user isolation.

### P1 — Project Detail resource-count gate

The data graph does not rebound, but two extra code chunks make total resources 5 versus the Phase 3 count of 3. The next pass should compare transferred/compressed bytes and cache-hit behavior before deciding whether coalescing the chunks is beneficial.

### P2 — Large hydration surfaces

- Expenses: 380 kB First Load JS;
- Estimate Detail: 356 kB;
- Project Detail: 332 kB.

Further work should isolate bounded interaction islands inside these routes. A second whole-shell SSR rewrite is not justified.

### P2 — Production proof

A real authenticated Production AFTER still requires explicit Push/Deploy authorization, followed by first-tab cold and warm navigation tests for Dashboard, Projects, Project Detail, Estimate Detail, Revenue/AR, Workers, Expenses, and Schedule.

## Final determination

HH GROUP PERFORMANCE OPTIMIZATION = NEEDS FIXES

Reason: implementation correctness and local regression gates pass, but the strict performance candidate gate is not fully satisfied or causally proven, and Production AFTER does not exist without deployment authorization.
