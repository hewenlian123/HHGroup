# HH Group Figma → Code Mapping v2

**Figma authority:** [HH UI Validation — Round 1.1 — Final](https://www.figma.com/design/JEfWRSdRF1BJgx1rGzQS3w/HH-UI-Validation-%E2%80%94-Round-1.1-%E2%80%94-Final?node-id=1-5332)<br>
**Validated direction:** Pure White / Graphite / Geist / operational blue<br>
**Implementation boundary:** presentation only; the current WebApp remains authoritative for data, workflow, calculations, Auth, API, and persistence.

| Figma node                                   | Contract                                                                  | Code owner                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Core UI `1:2728`                             | Semantic color, type, density, radius, focus                              | `src/styles/hh-design-system-v2.css`, `src/components/ui/*`                             |
| Global Shell `1:2876`, Estimate nav `1:3217` | White navigation, 36px rows, selected fill plus blue marker, 56px header  | `src/components/layout/*`                                                               |
| Dense Table `1:2931`                         | 40px rows, neutral amounts, semantic status, selected distinct from focus | `src/components/ui/table.tsx`, `src/app/estimates/*`                                    |
| Estimate command header `1:3230`             | 104px desktop command region, breadcrumb, title, status, facts, actions   | `src/app/estimates/_components/estimate-workspace-command-header.tsx`                   |
| Section outline `1:3246`                     | 176px desktop section navigation with explicit current edge               | `src/app/estimates/_components/estimate-section-outline.tsx`                            |
| Estimate builder `1:3262`                    | Dense section and line-item workspace                                     | `src/app/estimates/_components/estimate-editor.tsx`, `estimate-builder-operational.css` |
| Pricing inspector `1:3382`                   | Single 360px contextual inspector; money remains graphite                 | `src/app/estimates/_components/estimate-builder-summary.tsx`                            |
| Landscape `1:3412`, Portrait `1:3547`        | Compact nav / overlay nav, inspector sheet, 44px touch targets            | Shell and Estimate responsive CSS                                                       |
| Critical states `1:3669`                     | Distinct empty/loading/unavailable; save errors retain edits              | Existing Estimate save/state components and presentation                                |

## Guardrails

- No global dark theme, gold-primary treatment, decorative glass, or Neo visual language.
- No new business fields are inferred for Estimate List because Figma has no dedicated list screen.
- Amounts are graphite by default; semantic color belongs to status or action state.
- Selected state and keyboard focus remain visually distinct.
- Existing Estimate props, actions, routes, save behavior, revision lineage, and calculations remain unchanged.

## Phase 2 — Estimate workflow surfaces

Phase 2 maps the validated Figma operational workspace onto the existing Estimate workflow. It does not replace any production handler, form contract, route, calculation, or persistence path.

| Figma surface / state                     | Production mapping                                                                              | UI contract                                                                                          | Production behavior owner                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Estimate Builder — view                   | `estimate-detail-client.tsx`, `estimate-editor.tsx`, `estimate-workspace-command-header.tsx`    | White workspace, compact command hierarchy, graphite amounts, current-revision context               | `src/app/estimates/[id]/page.tsx`, `src/lib/data/index.ts`                       |
| Estimate Builder — edit / saving / failed | `estimate-editor.tsx`, `estimate-builder-save-status.tsx`, `estimate-document-save-context.tsx` | Preserve edits while saving; explicit unsaved, saving, saved, and recoverable failed states          | Existing inline server actions and the document mutation barrier                 |
| Estimate Builder — locked / historical    | `estimate-detail-client.tsx`, `estimate-detail-header.tsx`                                      | Approved, Rejected, Converted, and historical revisions remain visibly read-only                     | Status and lineage RPCs in `src/lib/estimates-db.ts` and Supabase migrations     |
| Pricing Inspector `1:3382`                | `estimate-edit-customer-section.tsx`, `estimate-details-drawer-controls.tsx`                    | One contextual surface; customer total and financial amounts remain neutral graphite                 | `saveEstimateMetaInlineAction`, `updateEstimateMetaWithClient`, `computeSummary` |
| Payment Schedule                          | `estimate-payment-schedule.tsx`, `proposal-payment-milestone-list.tsx`                          | Fixed-dollar milestones, clear remaining/over-allocation state, invoice readiness only when eligible | Payment schedule DB helpers, atomic template RPC, invoice creation actions       |
| Activity                                  | `estimate-activity-timeline.tsx`, `EstimateSurfaceSheet`                                        | Read-only event history with distinct empty and unavailable states                                   | Append-only activity store and protected activity RPCs                           |
| Revision History                          | `estimate-detail-client.tsx`, `EstimateSurfaceSheet`                                            | Canonical revision links; current, viewed, and historical/read-only states remain distinct           | Immutable lineage IDs and `getEstimateRevisionContextWithClient`                 |
| Preview viewer                            | `preview/page.tsx`, `estimate-preview-shell.tsx`                                                | Pure-light operational chrome around a white Letter document; no Neo/Dark viewer                     | Server read path for the selected Estimate revision                              |
| Print / PDF document                      | `print/page.tsx`, `estimate-preview-content.tsx`, `estimate-print-document.tsx`                 | Existing Letter paper, pagination, customer content, and PDF-safe typography are preserved           | Shared Preview/Print renderer and authenticated PDF route                        |

## Screen UI versus customer document

- The Figma v2 system governs application chrome: Builder, inspectors, sheets, navigation, status, focus, and responsive controls.
- Preview uses the same pure-light operational shell as the WebApp. It must not reintroduce `neo-dark`, gold-primary, glass, or graphite-canvas viewer chrome.
- The customer document is a separate output boundary. Preview paper, browser Print, and downloaded PDF continue to use the shared `EstimatePreviewContent` renderer.
- Paper remains US Letter (`8.5in × 11in`) on white, with the established document typography, page breaks, hidden-price behavior, proposal/itemized modes, and revision identity.
- A screen-theme migration must not restyle document content through broad selectors or allow app chrome to appear in PDF capture.

## Business source-of-truth boundary

The current WebApp remains authoritative. Phase 2 UI work must preserve all of the following:

- `line total = qty × unit cost`; `Estimate total = subtotal + tax − discount`.
- Overhead and profit percentages are internal planning references only and do not change the customer total.
- Payment milestones persist authoritative fixed-dollar amounts. Percentage controls are input helpers; partial schedules are valid and over-allocation is rejected server-side.
- Only Draft and Sent Estimates are editable. Status transitions, Project conversion, deletion eligibility, invoice linkage, and paid synchronization remain protected server operations.
- Activity actors come from Auth, activity rows remain append-only, and revision lineage uses canonical IDs rather than Estimate numbers.
- Historical revisions remain read-only. Preview, Print, and PDF read the selected revision and fail closed when its revision identity is unavailable.
- Internal notes never enter Preview, Print, or PDF.
- Existing server-action exports, FormData field names, Auth guards, APIs, database schema, RPCs, and calculations are not Figma implementation seams.

## Phase 2 verification

`tests/figma-ui-v2-estimate-phase2-contract.test.mjs` is a read-only source contract. It checks the UI mapping above without executing mutations or duplicating business logic in a test fixture.
