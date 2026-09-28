# HH Group Local Performance Baseline — BEFORE

Captured 2026-09-02 with Playwright Chromium 1.58.2 at 1440×900, 820×1180, and 390×844. Local Supabase was confirmed at `127.0.0.1`; browser requests after login were restricted to GET/HEAD/OPTIONS.

## Optimized-build baseline

- 45 valid direct observations across the 15 requested surfaces; Invoice Detail was unavailable because the local list contained no visible existing invoice ID.
- FUC: 102.9–552.7 ms; median 137.4 ms.
- Full settle: 721.3–1182.5 ms; median 805.5 ms.
- Same-origin requests: 37–106; median 42. RSC median 1; API median 2.
- No auth redirects, duplicate URLs, non-2xx responses, console/page errors, or horizontal overflow.
- Dashboard was the outlier: 86–106 same-origin requests, 18–29 RSC requests, and 14–23 aborted speculative requests.
- Settings emitted 10 RSC prefetches per viewport.
- `/api/system-health` was the slowest resource in most cases, approximately 115–434 ms.

| Surface         | Desktop FUC / settle | Tablet FUC / settle | Mobile FUC / settle |
| --------------- | -------------------: | ------------------: | ------------------: |
| Dashboard       |           553 / 1183 |          451 / 1036 |          137 / 1022 |
| Projects        |            335 / 939 |           137 / 777 |           110 / 748 |
| Project Detail  |            324 / 959 |           319 / 948 |           323 / 924 |
| Estimates       |            340 / 959 |           323 / 922 |           115 / 731 |
| Estimate Detail |            328 / 976 |           134 / 751 |           328 / 924 |
| Revenue / AR    |            141 / 788 |           325 / 928 |           311 / 922 |
| Invoice list    |            127 / 807 |           105 / 727 |           119 / 742 |
| Payments        |            144 / 766 |           130 / 748 |           129 / 753 |
| Expenses        |            150 / 806 |           130 / 783 |           137 / 773 |
| Workers         |            324 / 975 |           325 / 936 |           338 / 933 |
| Payroll         |            337 / 948 |           323 / 989 |           323 / 940 |
| Documents       |            140 / 748 |           116 / 723 |           109 / 727 |
| Tasks           |            124 / 750 |           103 / 721 |           118 / 732 |
| Schedule        |            129 / 774 |           126 / 741 |           112 / 729 |
| Settings        |            129 / 832 |           124 / 794 |           105 / 812 |

## Development-mode comparison

The authenticated development-server matrix contained 72 direct observations. Initial-route FUC median was 705.3 ms and settle median was 1630.9 ms; requested additional surfaces had FUC median 997.6 ms and settle median 1986.6 ms. Cold compilation produced 2–5.4 second outliers. Invoice, labor, workers, payroll, tasks, schedule, and settings data calls appeared twice under development React behavior but were not duplicated in the optimized build; they are not classified as Production defects.

A valid development-mode Dashboard→Projects click reached destination-specific content in 326.9–414.1 ms and settled in 973.9–1020.7 ms. Optimized-build visual-feedback click samples were invalidated because they matched old Dashboard content.

## Environment limitations

- Invoice Detail: no visible existing local record, so no ID was invented.
- Production-like local build is not the deployed Production site and has no CDN/network distance.
- Development cold compilation is environment noise, not application latency.
