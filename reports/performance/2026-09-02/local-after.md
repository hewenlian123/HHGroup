# HH Group Local optimized-build AFTER browser baseline

Captured 2026-09-03. Result: 45/45 direct-route cells completed—14 requested pages plus the Invoice discovery list, across three widths—at the optimized application state; all used independent local owner sessions in persistent contexts. Invoice Detail itself was unavailable. This is Local optimized-build evidence, not a claim about internet-facing Production.

## Method and guardrails

- Viewports: desktop 1440×900, tablet 820×1180, mobile 390×844.
- The browser guard allowed only GET, HEAD, and OPTIONS after context creation. No business data, Production system, or repository file was modified.
- Each direct route used a fresh page within its viewport's authenticated context, preventing old content from becoming FUC.
- Every page retained request/error listeners for at least 3.0 seconds after dispatch. Raw JSON and screenshots remain in `/tmp/hh-perf-local-prod-after-artifacts/` for this session.
- The rejected generic measurement harness was neither restored nor run.

## Direct-route matrix

Cells are FUC / full-settle milliseconds. Req is same-origin / RSC / API for desktop, tablet, mobile. Every direct cell had zero console errors, page errors, non-2xx responses, duplicate URL requests, horizontal overflow, and auth redirects.

| Surface         | Final route                      |    Desktop |    Tablet |    Mobile |            Req D / T / M | Aborts D / T / M |
| --------------- | -------------------------------- | ---------: | --------: | --------: | -----------------------: | ---------------: |
| Dashboard       | `/dashboard`                     | 614 / 1284 | 279 / 937 | 280 / 963 |              53/8/1 each |        4 / 4 / 4 |
| Projects        | `/projects`                      |  333 / 895 | 188 / 840 | 184 / 795 | 42/1/2 · 42/1/2 · 43/2/2 |        0 / 0 / 0 |
| Project Detail  | seeded `/projects/:id`           |  338 / 929 | 330 / 911 | 319 / 920 | 49/4/2 · 40/1/2 · 40/1/2 |        1 / 0 / 0 |
| Estimates       | `/estimates`                     |  314 / 937 | 163 / 774 | 196 / 787 |              42/2/1 each |        1 / 1 / 0 |
| Estimate Detail | seeded `/estimates/:id`          |  325 / 869 | 206 / 860 | 320 / 861 |              50/2/1 each |        1 / 1 / 2 |
| Revenue / AR    | `/financial/ar`                  |  323 / 906 | 333 / 867 | 325 / 855 | 41/2/1 · 41/2/1 · 37/1/1 |        0 / 0 / 0 |
| Invoice list    | `/financial/invoices`            |  156 / 797 | 143 / 780 | 155 / 769 |              40/1/2 each |        0 / 0 / 0 |
| Payments        | `/financial/payments`            |  188 / 852 | 192 / 830 | 179 / 797 |              42/0/2 each |        0 / 0 / 0 |
| Expenses        | `/financial/expenses`            |  181 / 870 | 188 / 833 | 212 / 862 |              50/2/2 each |        0 / 0 / 0 |
| Workers         | `/workers`                       |  304 / 975 | 281 / 926 | 307 / 922 |              40/0/4 each |        0 / 0 / 0 |
| Payroll         | `/reports/workforce?tab=payroll` |  326 / 900 | 332 / 937 | 326 / 892 | 54/0/2 · 54/0/2 · 58/1/2 |        0 / 0 / 0 |
| Documents       | `/documents`                     |  164 / 760 | 139 / 736 | 145 / 742 |              37/0/1 each |        0 / 0 / 0 |
| Tasks           | `/tasks`                         |  126 / 734 | 180 / 812 | 170 / 757 |              38/0/2 each |        0 / 0 / 0 |
| Schedule        | `/schedule`                      |  140 / 747 | 145 / 754 | 217 / 810 |              38/0/2 each |        0 / 0 / 0 |
| Settings        | `/settings/company`              |  157 / 895 | 158 / 927 | 137 / 851 |             56/10/2 each |        4 / 6 / 5 |

Aggregate: FUC 125.9–614.3 ms, median 195.9 ms; full settle 734.2–1283.6 ms, median 860.3 ms; same-origin 37–58, median 42; RSC 0–10, median 1; API 1–4, median 2.

## Dashboard comparison to BEFORE

| Metric               |                BEFORE |               AFTER | Evidence                                               |
| -------------------- | --------------------: | ------------------: | ------------------------------------------------------ |
| Same-origin requests |         86 / 99 / 106 |        53 / 53 / 53 | Desktop / tablet / mobile                              |
| RSC requests         |          18 / 24 / 29 |           8 / 8 / 8 | Desktop / tablet / mobile                              |
| Aborted GET/RSC      |                 14–23 |           4 / 4 / 4 | Desktop / tablet / mobile                              |
| FUC                  |    553 / 451 / 137 ms |  614 / 279 / 280 ms | Point-in-time Local runs; not a Production percentile. |
| Full settle          | 1183 / 1036 / 1022 ms | 1284 / 937 / 963 ms | Same caveat.                                           |

## Background System Health proof

`GET /api/system-health` occurred once on all 45/45 pages, first appearing 1311.2–1507.9 ms after dispatch (median 1394.2 ms), rather than disappearing. It was the slowest retained resource in 43/45 cells; slowest-resource durations were 142.1–363.6 ms.

## Workflow and blockers

- Dashboard → Projects: destination-specific proof succeeded at all widths. Click→first route request / click→target useful content: desktop 39.5 / 163.7 ms, tablet 38.5 / 168.4 ms, mobile 42.4 / 193.8 ms.
- Projects → Project: desktop/tablet had no visible safe detail anchor. Mobile exposed an existing anchor; click→first route request was 68.6 ms and click→target useful content was 306.6 ms, with no errors.
- Project → Estimate → Invoice → Payment → Expenses → Workers → Schedule: the current local seed/UI did not expose a safe continuous visible-anchor chain. The run records a blocker rather than inventing IDs or operating forms/actions.
- Invoice Detail: unavailable because Invoice list exposed no visible existing record.

## Limits

This comparison isolates one shared Local optimized build. It does not cover WAN/CDN behavior, an authenticated Production session, Figma parity, CPU/network throttling, or Production percentiles.
