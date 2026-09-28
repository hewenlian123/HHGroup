# HH Group Performance Optimization — Phase 3

Measured 2026-09-03 against the final local optimized Production build. The live Production deployment was inspected read-only and was not changed. No push, deploy, database/schema/index migration, service-role cache, cross-user cache, UI redesign, financial formula change, business workflow change, or security-boundary relaxation was performed.

## Executive result

Phase 3 fixed the evidenced Project Detail correctness defects, removed its automatic financial comparison fan-out, consolidated its invoice graph, eliminated three stale Production-schema probes, batched Workers balances, consolidated Dashboard/AR reads, and moved Invoice Detail's initial data to the server. Project Detail's final desktop browser request count fell from 12 to 3 and RSC count from 4 to 1 after the non-critical post-render prefetches were disabled.

The work does **not** yet satisfy the global PASS gate. The final local five-route 1440 median FUC was 199 ms, versus Phase 2's 109.1 ms eight-route median; even the four directly overlapping routes were 198 ms versus 122.5 ms. The route sets and settle probes are not identical, so this is not a precise regression percentage, but it is enough to reject a claim of clear global improvement. Dashboard remained about 0.81 s to useful content and generated eight RSC requests. Production AFTER is unavailable because deployment was prohibited.

## Measurement method

- Final optimized build, authenticated local Supabase, real App Router clicks.
- Three rounds each at 1440×900, 820×900, and 390×844: 45 final samples.
- Click feedback: click mark to first DOM mutation.
- RSC start: click mark to first RSC `PerformanceResourceTiming.startTime`.
- FUC: route-specific useful content becoming visible.
- Settle: target `<main>` unchanged for 400 ms and all requests already active at FUC completed or aborted. Later speculative prefetch and global health polling do not hold the route open.
- Browser request counts include RSC, API, and chunks observed until settle. Server-side Supabase reads are counted separately from the audited query graph; they are not mislabeled as browser requests.
- Console errors, page errors, and non-2xx responses: all zero.

## PROJECT DETAIL ROOT CAUSE

The old route mixed request-cookie clients, internal/implicit clients, stale schema probes, broad error-to-empty fallbacks, duplicated financial graphs, and eager data for every tab:

```text
REQUEST
→ middleware auth
→ page auth / mixed client creation
→ ~49–52 server reads plus invoice fan-out
→ automatic client financial comparison (+33–43 reads)
→ Production permission/missing-column failures
→ catch/fallback converted failures into 0 / []
→ HTTP 200 with plausible-looking incomplete data
```

Production evidence before the fix contained at least 61 permission-denied events. At least about 54 came from the automatic three-graph financial comparison. Production also queried missing columns `project_material_selections.item`, `punch_list.description`, and `workers.trade`. The legacy closeout read path referenced tables that had already been replaced by `final_punch_lists`, `final_punch_list_items`, `warranties`, and `completion_certificates`.

The corrected read path is:

```text
REQUEST
→ middleware auth
→ one owner/admin guard returning one request-scoped RLS client
→ project + canonical financial graph
→ independent workspace reads in parallel with the same client
→ canonical schema/table mapping
→ required-source failure surfaces as unavailable; only real [] / 0 remains valid
```

The normal financial snapshot endpoint now runs one authoritative graph. The full comparison only runs under `?debugFinancial=1`. Project invoice billing/display data now comes from one four-read model rather than per-invoice payment reads plus a second invoice graph.

## PROJECT DETAIL BEFORE → AFTER

| Metric                                      |      BEFORE |                                      AFTER | Delta / status                            |
| ------------------------------------------- | ----------: | -----------------------------------------: | ----------------------------------------- |
| Known Production permission failures        | at least 61 | 0 in final local/schema/browser validation | Production AFTER pending                  |
| Known missing-column probes                 |           3 |                                          0 | removed                                   |
| Fake required financial empty/zero fallback |     present |   0 in audited snapshot/project read paths | failures fail closed                      |
| Normal financial comparison graphs          |           3 |                                          1 | two full graphs removed                   |
| Desktop browser requests                    |          12 |                                          3 | −75%                                      |
| Desktop RSC requests                        |           4 |                                          1 | −75%                                      |
| Browser duplicate requests                  |           0 |                                          0 | no rebound                                |
| Phase 2 → Phase 3 desktop FUC               |    267.0 ms |                                     199 ms | −25.5%                                    |
| Phase 2 → Phase 3 settle                    |    730.2 ms |                                     663 ms | −9.2%; settle definitions differ slightly |
| Console / page / non-2xx                    |   0 / 0 / 0 |                                  0 / 0 / 0 | pass                                      |

The 12 → 3 request reduction was measured immediately before/after the final bounded change. The removed requests were automatic post-render prefetches for `/financial/inbox`, `/financial/expenses`, customer detail, and their chunks. Navigation still works on click.

Local request-scoped RSC logs during the final profiling series typically showed Project Detail page auth around 30 ms, server data around 51 ms, and page preparation near 0 ms. This makes the remaining roughly 100+ ms between server preparation and FUC a client/RSC/navigation residual, not a database-query claim.

One P1 remains: all tab datasets are still loaded because the existing tabs switch locally and have no typed lazy-data state machine. Returning hard-coded empty data was rejected because it would falsify legitimate financial/business state.

## ROUTE LATENCY BREAKDOWN

Final authenticated local medians, three clicks per cell:

| Width | Route          | Feedback | RSC start |    FUC |   Settle | Requests / RSC / API | Duplicate / aborted | Slowest completed request  |
| ----: | -------------- | -------: | --------: | -----: | -------: | -------------------: | ------------------: | -------------------------- |
|  1440 | Dashboard      |   2.8 ms |   16.1 ms | 811 ms | 1,225 ms |           17 / 8 / 0 |               2 / 5 | 83 ms, dashboard route set |
|  1440 | Projects       |     14.1 |      16.5 |    198 |      644 |            7 / 2 / 1 |               0 / 1 | 111 ms, system health      |
|  1440 | Project Detail |      8.9 |      17.0 |    199 |      663 |            3 / 1 / 1 |               0 / 1 | 75 ms, Project RSC         |
|  1440 | Revenue / AR   |      3.5 |      14.2 |    196 |      614 |            3 / 2 / 0 |               0 / 0 | 91 ms, AR RSC              |
|  1440 | Workers        |      3.7 |      16.4 |    217 |      638 |            5 / 1 / 3 |               0 / 1 | 93 ms, balance API         |
|   820 | Dashboard      |      7.5 |      17.0 |    806 |    1,223 |           17 / 8 / 0 |               2 / 5 | 51 ms, Dashboard RSC       |
|   820 | Projects       |      7.5 |      16.8 |    101 |      629 |            7 / 2 / 1 |               0 / 1 | 116 ms, snapshot API       |
|   820 | Project Detail |      4.4 |      18.4 |    201 |      670 |            3 / 1 / 1 |               0 / 0 | 159 ms, Project RSC        |
|   820 | Revenue / AR   |     10.1 |      16.7 |    196 |      609 |            3 / 2 / 0 |               0 / 0 | 95 ms, AR RSC              |
|   820 | Workers        |     11.4 |      14.4 |    206 |      643 |            5 / 1 / 3 |               0 / 0 | 111 ms, balance API        |
|   390 | Dashboard      |      6.9 |      18.6 |    817 |    1,233 |           17 / 8 / 0 |               2 / 5 | 69 ms, Dashboard RSC       |
|   390 | Projects       |     10.1 |      19.6 |    198 |      615 |            8 / 3 / 1 |               0 / 1 | 88 ms, snapshot API        |
|   390 | Project Detail |      3.8 |      20.0 |    201 |      669 |            3 / 1 / 1 |               0 / 1 | 71 ms, snapshot API        |
|   390 | Revenue / AR   |     19.4 |      13.1 |    202 |      624 |            3 / 2 / 0 |               0 / 0 | 86 ms, AR RSC              |
|   390 | Workers        |      3.4 |      23.6 |    204 |      620 |            5 / 1 / 3 |               0 / 1 | 88 ms, balance API         |

Direct browser Supabase count was zero for these routes because protected data is server-side. Middleware duration was exposed on RSC/API resources. Page-level opt-in logs additionally separated auth and server data for Project Detail, AR, Workers, Invoice Detail, and Dashboard data/render stages.

## DASHBOARD / AR

### Dashboard

- Root cause: the canonical project/profit graph was read twice and risk computation triggered project-source fan-out.
- BEFORE: approximately `34 + N` server reads.
- CHANGE: one request-scoped project list and canonical profit map are reused for stats, project health, risk, and contract review; independent reads remain parallel.
- AFTER: approximately 25–26 reads depending on populated optional sources. No cross-user or financial-result cache was introduced.
- Warm page-data logs were usually about 31–99 ms, with a roughly 52 ms center. The first isolated direct sample was 190 ms. That first-in-isolate gap is a cold-start candidate, not proof of Vercel cold-start duration.
- Browser result: FUC remained 806–817 ms, with 17 requests, 8 RSC, 2 duplicate paths, and 5 aborted requests. The data graph is no longer the whole bottleneck; destination route prefetch/client presentation remains dominant.

Dashboard still has pre-existing optional financial helpers that convert errors to default 0/[] values. Phase 3 did not broaden scope and silently redefine those semantics. They remain a correctness/observability follow-up before Dashboard can be declared fully fail-closed.

### Revenue / AR

- BEFORE: eight source reads, four sequential stages.
- CHANGE: one invoice/item/payment/project read model, using one authenticated request client and parallel independent reads.
- AFTER: four source reads, two stages; exact invoice status, balance, aging, and paid-this-month fixtures pass.
- Browser AFTER: 196 ms FUC, 614 ms settle, 3 requests, 2 RSC, 0 duplicates/aborts.
- Phase 2 was 122.5 / 598.7 ms. Query work halved, but FUC did not improve in this run; the route log itself was typically about 31 ms auth + 7 ms data. The unexplained client/RSC residual is therefore the next target.

## WORKERS

- Root cause: balance loading independently read labor, payments, reimbursements, and advances per worker.
- BEFORE: `6 + 7N` to `6 + 8N` balance reads. For 12 workers, 90–102 reads; the whole page was roughly 99–111 reads.
- CHANGE: six fixed table reads start together, are indexed in memory by worker, and preserve the existing balance formula. Each source treats errors, null/non-array data, or truncation as unavailable; only a real empty array is valid.
- AFTER: six balance reads regardless of 1, 12, or 50 workers; roughly 15 total page reads for the 12-worker case.
- Delta: balance graph −93.3% to −94.1% for N=12.
- Browser AFTER: 217 ms FUC, 638 ms settle, 5 requests, 1 RSC, 3 APIs, 0 duplicates, 1 abort.
- Phase 2 was 116.3 / 693.9 ms. Settle improved but FUC did not. The balance handler normally showed about 32 ms auth and 5–18 ms data; the remaining browser delay is not attributable to the removed N+1.

## INVOICE DETAIL

- Root cause: useful invoice data started in a client mount effect; the API then ran auth → invoice → items → payments → related data.
- BEFORE: one browser initial API fetch and four server dependency stages.
- CHANGE: the Server Component authenticates once, loads the base invoice, starts five dependent reads together, signs attachments, and passes the exact DTO as initial client state. Mutation/app-sync refresh remains intact.
- AFTER: initial browser API fetch 1 → 0; base server waterfall 4 → 2. Required null collections fail closed; real empty collections remain valid.
- Bundle remains 230 kB First Load JS; the existing UI classes and financial authority are unchanged.
- Local has no invoice fixture, and no financial record was created for a benchmark. Production BEFORE was 879 ms first-tab / 610 ms warm, with DOM stable at 2,957 / 2,503 ms. Production AFTER is unavailable without deployment.

## APPSHELL DECOMPOSITION

No global SSR rewrite was attempted. The previous direct `ssr:false` removal failed optimized prerendering and was correctly reverted.

Current browser-only dependencies include route classification (`usePathname`/`useSearchParams`), shell/drawer state, Sidebar/Topbar, React Query and Auth providers, browser Supabase, local/session storage, viewport hooks, mobile navigation/FAB, command palette, attachment preview portal, scroll recovery, health polling, PWA prompt, and service-worker effects.

Minimum safe architecture:

```text
RootLayout (Server)
└─ ProvidersIsland (client, SSR-capable)
   └─ AppShellFrame (Server; exact existing DOM/classes)
      ├─ Sidebar / Topbar / Mobile drawer islands
      ├─ <main>{route children}</main> as server HTML
      └─ deferred command, attachment, health, PWA, scroll islands
```

The first bounded experiment should extract only the static frame and server-rendered `<main>`, preserve every route/class/data attribute, exclude `/labor/daily-entry?mode=worker` from the first slice, and require all 145 prerendered pages to build before browser QA. Undocumented pathname headers must not be used.

## SERVER-TIMING

Low-risk diagnostics now expose:

- Middleware responses: numeric `hh_auth` and `hh_middleware` durations.
- Critical route handlers: numeric `hh_auth`, `hh_server_data`, and `hh_handler_total`.
- RSC pages, when `HH_PERFORMANCE_DIAGNOSTICS=1`: route-template-only records for page auth, server data, RSC preparation, and total. Dashboard omits a page-auth field because it has no second page-level guard; middleware remains authoritative for that stage.

Only allowlisted finite non-negative durations are accepted. No description, actual pathname/UUID, user data, email, SQL, query text, cookie, bearer token, secret, raw error, or response payload is emitted. Existing response status, body, cookies, cache headers, and prior `Server-Timing` values are preserved.

This instrumentation can distinguish auth vs middleware vs page data vs preparation vs total. Pure RSC serialization and actual cold-start duration still require Vercel/Next traces; they are not fabricated by subtraction. The repository's existing inactive global instrumentation hook was not enabled because it also activates broad console capture and needs a separate security review.

## DATABASE / QUERY FINDINGS

Read-only Production schema inspection confirmed the canonical column/table differences used by the fixes. No schema or index was changed.

The Production catalog did not show target indexes for `invoice_items(invoice_id)`, `invoice_payments(invoice_id)`, `payments_received(invoice_id)`, `deposits(invoice_id)`, or `worker_reimbursements(worker_id)`. Existing useful indexes cover labor entries, worker payments, material selections, worker advances, and canonical closeout project keys.

These absent indexes are candidates only. Representative `EXPLAIN (ANALYZE, BUFFERS)` / `pg_stat_statements` evidence was not available, so no benefit estimate is asserted and no migration was created.

## GLOBAL BEFORE → AFTER

| Metric                                    |       Phase 2 | Final Phase 3 | Interpretation                    |
| ----------------------------------------- | ------------: | ------------: | --------------------------------- |
| Project Detail FUC                        |      267.0 ms |        199 ms | improved 25.5%                    |
| Project Detail settle                     |      730.2 ms |        663 ms | improved directionally            |
| Project Detail browser req / RSC          |         7 / 4 |         3 / 1 | no rebound; substantial reduction |
| AR FUC / settle                           | 122.5 / 598.7 |     196 / 614 | FUC not improved                  |
| Workers FUC / settle                      | 116.3 / 693.9 |     217 / 638 | FUC not improved; settle improved |
| Four overlapping-route 1440 FUC median    |         122.5 |           198 | success gate not met              |
| Four overlapping-route 1440 settle median |         693.9 |           644 | no settle degradation             |
| Final five-route 1440 FUC / settle median |           n/a |     199 / 644 | Dashboard is the large outlier    |
| Final all-size FUC / settle median        |           n/a |     201 / 643 | 45 samples                        |
| Console / page / non-2xx errors           |             0 |             0 | pass                              |
| Shared First Load JS                      |       88.4 kB |       88.4 kB | unchanged                         |

Cross-phase medians are directional because the Phase 3 route set and corrected settle rule differ. They are sufficient to say the required global FUC improvement is not proven; they are not used to claim an exact regression percentage.

Production still runs the old deployment. Its relevant BEFORE figures remain Dashboard 1,564/1,252 ms first/warm, Project Detail 1,421/1,146, AR 1,197/663, Invoice Detail 879/610, and Workers 1,078/851. A Production AFTER table would be fictional and is intentionally omitted.

## Verification

- Optimized Next.js build: pass, 145/145 static pages; shared First Load JS 88.4 kB.
- TypeScript: pass.
- ESLint: pass with zero warnings/errors.
- Unit tests: 1,134 passed, 10 skipped.
- Source/design/security contracts: 183/183 passed.
- Browser performance/QA: 45/45 final samples; console errors 0, page errors 0, non-2xx 0.
- Project Detail final bounded prefetch check: 3/3 fresh contexts produced 3 requests, 1 RSC, and 0 errors.
- Financial unexpected delta: ZERO by exact read-model/formula fixtures and full financial/security regression suite.
- Business behavior changes: NONE.
- Security boundary changes: NONE; all new data graphs use request-scoped authenticated RLS clients.
- Frozen UI/UX architecture: unchanged.

## REMAINING BOTTLENECKS

### P0 / release gate

- Verify the corrected Project Detail against authenticated Production: permission denied 0, missing column 0, fake financial empty/zero 0. This cannot be claimed before deployment.
- Produce Production AFTER FUC/settle/request/failure data. No deployment was performed in this task.

### P1

- Dashboard: 17 requests, eight RSC, five aborts, roughly 0.81 s FUC. Identify the destination prefetch/render gate and replace remaining error-to-zero optional financial helpers with explicit unavailable-state handling under correctness review.
- Shared AppShell: extract the server frame and `<main>` through the bounded island plan; do not retry the global toggle.
- Project Detail: implement typed active-tab loaders so inactive heavy data is not fetched; never substitute empty values while loading.
- Auth amplification: protected RSC/API calls still pay middleware auth and selected page/handler guards. Any consolidation requires security proof, not bypassing verification.
- AR and Workers: server data is fast after consolidation, but client/RSC FUC remains around 0.20 s; trace response start/end, React commit, and long tasks before another code change.
- Invoice Detail: obtain an authenticated representative fixture and Production AFTER before claiming user-visible gain.

### P2

- Capture Vercel traces for true cold/warm function attribution and RSC serialization.
- Obtain representative read-only query plans before proposing any index migration.
- Add representative large-list React profiles before pagination, virtualization, or memoization changes.

## FINAL VERDICT

`HH GROUP PERFORMANCE OPTIMIZATION = NEEDS FIXES`

Phase 3 materially improved Project Detail correctness and its query/request graph, removed Workers N+1, consolidated Dashboard/AR reads, and eliminated Invoice Detail's mount-time initial fetch. It did not prove the required global FUC improvement, Dashboard remains a shared outlier, and Production AFTER cannot exist without a later approved deployment.
