# HH Group Client / React / Bundle Audit

## Build evidence

A clean Next.js 14.2.35 optimized build passed. Shared first-load JS was 88.4 kB; the global AppShell layout chunk was 84,114 bytes uncompressed. Selected first-load JS totals:

- Dashboard 97.3 kB
- Projects 167 kB; Project Detail 330 kB
- Estimates 160 kB; Estimate Detail 357 kB
- Revenue / AR 158 kB
- Invoice list 171 kB; Invoice Detail 230 kB
- Payments 346 kB
- Expenses / Inbox 379 kB
- Workers 169 kB
- Workforce/Payroll 387 kB
- Documents 306 kB
- Tasks 165 kB; Schedule 162 kB; Settings Company 224 kB

## Findings

- **P0 PREFETCH/CACHING:** Dashboard automatically fans out broad owner/mobile route prefetch sets. Optimized runtime confirms 18–29 RSC requests and 14–23 aborted prefetches before user intent.
- **P1 BUNDLE/HYDRATION:** optional command-palette and attachment-preview code sits in the global shell; splitting it is plausible but deferred because first-open feedback needs separate interaction proof.
- **P1 CLIENT/RSC:** Project Detail is a 2,365-line all-tab client boundary with broad serialized props and a 145,847-byte route-entry chunk.
- **P1 CLIENT/DATA:** Invoice list transfers up to 1,000 rows, then filters and paginates locally; Invoice Detail starts with a client fetch and plain `Loading...`.
- **P1 CLIENT/DATA:** Workers hydrates up to 500 payments then fetches balances, payments, and entries; optimized build shows four distinct API reads rather than a Strict Mode duplicate.
- **P1 TABLE/LIST:** Tasks/Schedule render unbounded filtered collections into separate mobile and desktop trees; Payroll paginates only after full client computation.
- **P1 NETWORK/RSC:** broad `hh:app-sync` plus `router.refresh()` can combine an RSC refresh with mounted subscriber refetches.
- **P1 USER-PERCEIVED LATENCY:** Schedule disables Add without changing the label; Invoice Detail has only text loading. These are confirmed feedback gaps, separate from actual data latency.
- **Healthy controls:** React Query globally disables focus refetch; Expenses already dynamically splits its largest optional modals; Dashboard client route entry is small and its bottleneck is server/prefetch work.
