# HH Group Global UI/UX Production Baseline

Status: **FROZEN**\
Effective date: 2026-09-02 (Pacific/Honolulu)

## Release lineage

- Certified global UI/UX release: `8c2bd100b507d0359ce2f7d62a1d1adcb4436f43`.
- Current Production baseline: `1ded58d39a7319317e20b0ff580cd9c435152b6e`.
- The successor commit is a security/runtime read-path repair. It does not authorize or establish a new visual language.
- Figma UI/UX authority: [HH UI Validation — Round 1.1 — Final](https://www.figma.com/design/JEfWRSdRF1BJgx1rGzQS3w/HH-UI-Validation-%E2%80%94-Round-1.1-%E2%80%94-Final?node-id=1-5332).
- Code mapping authority: [`docs/FIGMA_CODE_MAPPING_V2.md`](../FIGMA_CODE_MAPPING_V2.md).
- Foundation implementation authority: `src/styles/hh-design-system-v2.css` and the canonical components under `src/components/ui`, `src/components/base`, and `src/components/layout`.

## Frozen baseline

The following Production surfaces form one HH Group product system and are frozen as the current presentation baseline:

- Certified HH Foundation: color, typography, spacing, geometry, elevation, focus, state, and responsive contracts.
- Canonical Global Shell and Sidebar: `AppShell`, one global navigation hierarchy, the desktop/tablet sidebar, mobile drawer, top bar, and bottom navigation.
- Estimate V3: customer-facing continuous construction worksheet, summary inspector, payments, notes, preview/PDF, revisions, and activity.
- Revenue & AR V2: AR workspace, invoice queue/detail, payments, deposits, receipts, and protected financial actions.
- Projects and project financial presentation.
- Documents and reports.
- Workers, labor, payroll, worker payments, advances, balances, invoices, and rate history.
- Bank reconciliation and receipt queue.
- Operations: tasks, schedule, punch list, site photos, and inspection log.
- Materials, cost codes, and procurement surfaces.
- Settings, Admin, System Health, logs, metrics, tests, and approved admin utilities.

## Binding authority rules

1. Do not create a second design system, palette, token namespace, shell, sidebar, or page-private visual language.
2. New pages must compose the current shared HH components before introducing any page-local presentation primitive.
3. Existing page-private styling may only remain as a bounded compatibility layer. It cannot become authority for new work.
4. Foundation changes require separate, explicit authorization and their own Figma-to-token-to-rendered-value verification.
5. Estimate V3 and Revenue & AR V2 remain the reference modules for hierarchy, dense data, interaction states, responsive composition, and mobile behavior.
6. Current Production behavior remains the business, financial, workflow, persistence, and authorization authority. Presentation work cannot redefine those contracts.
7. Backend, database, security, RLS, environment, dependency, test-infrastructure, and incident repairs must preserve the frozen Production UI unless a separate UI change is explicitly authorized.
8. Document/print surfaces keep their approved white-paper rendering and are not replaced by the application shell language.

## Change-control matrix

| Change type                                                                | Default status            | Required authority                                                                 |
| -------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------- |
| Reuse an existing shared HH component without changing its contract        | Allowed                   | Normal feature review                                                              |
| Add a new page using the existing shell, tokens, and shared patterns       | Allowed                   | Product and implementation review                                                  |
| Page-local visual primitive or visual token                                | Blocked by default        | Proof that no shared contract fits, plus HH Design System review                   |
| Foundation token, typography, geometry, state, or shared-component default | Frozen                    | Separate explicit authorization, Figma evidence, rendered QA, and regression proof |
| New shell/sidebar/navigation system                                        | Prohibited                | New product architecture authorization                                             |
| Security/backend/environment repair that changes presentation              | Prohibited in that repair | Separate UI scope and authorization                                                |
| Business, financial, workflow, DB, API, Auth, or RLS semantic change       | Outside this baseline     | Domain-specific authority and verification                                         |

## Verification rule

A future change may claim compatibility with this baseline only when it preserves:

- the canonical shell and single-sidebar contract;
- shared HH tokens and components;
- desktop, tablet, and mobile composition without unintended horizontal overflow;
- keyboard focus, touch-target, contrast, forced-colors, and reduced-motion behavior;
- business and financial semantics with no unexplained delta.

This document freezes authority; it does not authorize code, database, migration, Production-data, deployment, or workflow changes.
