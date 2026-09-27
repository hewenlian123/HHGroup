# UI Design Contract

Verified from:

- `AGENTS.md`
- `docs/FIGMA_CODE_MAPPING_V2.md`
- `src/styles/hh-design-system-v2.css`
- `src/components/base/README.md`
- `.agents/skills/hh-development-router/references/routing-matrix.md`
- `playwright.config.ts`

Last verified: 2026-08-30

## Durable contract

- Figma is validated UI/UX intent; the HH Design System is implementation authority; current production code is business behavior authority for data, workflow, calculations, Auth, API, and persistence.
- Use `hh-design-system-enforcer` for HH UI implementation/review. Reuse the canonical shell/navigation, shared tokens, typography, colors, spacing, radius/borders, and established shared components. Do not create a page-local visual language or parallel design system.
- Presentation work must not infer business fields or alter server actions, routes, save behavior, FormData/API contracts, database mappings, formulas, financial semantics, Auth, or persistence.
- Use `hh-playwright-qa` on the local app for rendered UI changes. Collect task-relevant desktop/tablet/mobile evidence, navigation and critical workflow results, responsive layout, horizontal overflow, interaction states, console/page errors, and screenshots/visual parity evidence.
- Use TypeScript for TS/TSX contracts and targeted Vitest when state/behavior logic changes. Add `@axe-core/playwright` only when accessibility is in scope; it supplements, never replaces, browser QA.
- Never lower an assertion, hide a browser error, or delete independent behavior/accessibility/overflow coverage to make a UI change pass.
- `impeccable` may advise requested critique/polish but cannot override HH implementation authority. `color-contrast` is rendered evidence only. `review-animations` is explicit-invocation-only and review-only.

Re-verify if Figma mapping, HH Design System ownership, canonical shell/shared components, or browser QA contract changes.
