# HH Group V2 Foundation Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the current HH Group V2 shared Foundation from NEEDS FIXES to a strict runtime-computed certification, with every P0 check passing and the complete audit matrix at or above 95%.

**Architecture:** Preserve the existing V2 layer and business-owned Estimate implementation. Fix merge/configuration roots first, then shared primitives, then Estimate portrait-only density overrides. Runtime Playwright assertions are the authority for computed styles; source contracts remain secondary guardrails.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS 3.4, tailwind-merge 3.5, Radix UI, Vitest/Node test, Playwright.

**Spec:** `docs/FIGMA_CODE_MAPPING_V2.md` plus the user-approved P0/P1 values in this task.

## Global Constraints

- Foundation scope only; do not enter Revenue & AR or another HH Group module.
- Do not change Database, Schema, RLS, Auth, API contracts, Estimate workflow, financial calculations, tax, discount, milestone logic, or persisted data behavior.
- Do not push, deploy, commit, or create a new Figma file.
- Preserve the current dirty working tree and all unrelated user changes.
- Do not perform broad V1/Neo CSS deletion; remove only runtime leaks named by this plan.
- Figma values must match final browser computed styles, not merely source tokens.
- P0 checks must be 100% PASS; strict complete matrix must be at least 95% PASS.

---

### Task 1: Merge Engine, Typography Tokens, and Exact Compatibility Colors

**Files:**

- Create: `src/__tests__/hh-v2-foundation-classes.test.ts`
- Modify: `src/lib/utils.ts`
- Modify: `src/styles/hh-design-system-v2.css`
- Modify: `tailwind.config.ts`
- Modify: `tests/design-typography-routes.spec.ts`

**Interfaces:**

- Consumes: existing `TYPO` class strings and V2 CSS variables.
- Produces: `cn()` that preserves `text-hh-*` typography beside color utilities; exact semantic Tailwind colors; corrected typography variables.

- [ ] **Step 1: Write the failing merge regression test**

```ts
expect(cn("text-hh-control", "text-[var(--hh-text-primary)]").split(" ")).toEqual(
  expect.arrayContaining(["text-hh-control", "text-[var(--hh-text-primary)]"])
);
```

Cover `text-hh-page-title`, `text-hh-status`, `text-hh-table-header`, and `text-hh-table-cell` in the same table-driven test. The production mutation caught is reversion to vanilla `twMerge` that drops the typography class.

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/__tests__/hh-v2-foundation-classes.test.ts`

Expected: failures show each `text-hh-*` class is missing when combined with a text color.

- [ ] **Step 3: Implement the minimum merge configuration**

Use `extendTailwindMerge` and extend the `text` theme with the exact HH typography scale names. Keep normal Tailwind conflict resolution intact.

- [ ] **Step 4: Correct the approved typography values**

```css
--hh-type-page-title-letter-spacing: 0;
--hh-type-control-font-size: 12px;
--hh-type-control-line-height: 16px;
--hh-type-control-font-weight: 500;
--hh-type-control-letter-spacing: 0.1px;
--hh-type-table-header-font-weight: 500;
--hh-type-status-letter-spacing: 0.2px;
```

Map `.hh-type-text-entry` to `14/20/400` on desktop while preserving the existing 16px mobile anti-zoom size only where necessary.

- [ ] **Step 5: Replace integer-HSL approximations with exact compatibility values**

Preserve the existing `hsl(var(--...))` consumer contract using sufficiently precise decimal HSL components, or map Tailwind consumers directly to exact `--hh-*` / `--hh-v2-*` colors if every consumer remains valid. Do not change consumer class names. Browser-computed RGB must equal the Figma hex values exactly.

- [ ] **Step 6: Run GREEN and focused source contracts**

Run:

```bash
npx vitest run src/__tests__/hh-v2-foundation-classes.test.ts
node --test tests/figma-ui-v2-contract.test.mjs tests/design-component-v18-foundation-contract.test.mjs
```

- [ ] **Step 7: Inspect the diff; do not commit**

### Task 2: Status Badge and Portrait Density

**Files:**

- Modify: `src/components/base/status-badge.tsx`
- Modify: `src/components/ui/badge.tsx` only if the shared primitive must own the pill contract.
- Modify: `src/app/estimates/_components/estimate-workspace-command-header.tsx` only to remove a conflicting local height.
- Modify: `src/app/estimates/_components/estimate-builder-operational.css`
- Modify: `tests/figma-ui-v2-contract.test.mjs`
- Modify: `tests/estimate-p0-responsive.spec.ts`

**Interfaces:**

- Consumes: corrected `TYPO.chip`, `--hh-row-height-dense`, shared radius tokens.
- Produces: status badge `26px/r999/11/14/500/.2px`; portrait header/line rows `44/52px`.

- [ ] **Step 1: Add failing runtime assertions**

```ts
expect(status).toEqual({
  height: "26px",
  radius: "999px",
  fontSize: "11px",
  lineHeight: "14px",
  fontWeight: "500",
  letterSpacing: "0.2px",
});
expect(portraitGridHeaderHeight).toBe(44);
expect(portraitLineRowHeight).toBe(52);
```

- [ ] **Step 2: Run the focused Playwright test and confirm RED for the named values**

- [ ] **Step 3: Apply the minimum shared badge and 768–1199px density fixes**

Desktop remains `36/44/40`; only portrait grid header and line rows become `44/52`.

- [ ] **Step 4: Re-run focused tests and inspect the diff; do not commit**

### Task 3: Dropdown, Tabs, Dialog, Sheet, and DatePicker

**Files:**

- Modify: `tailwind.config.ts` to generate `min-h-hh-row-dense`.
- Modify: `src/components/ui/dropdown-menu.tsx`
- Modify: `src/components/ui/select.tsx`
- Modify: `src/components/ui/tabs.tsx`
- Modify: `src/lib/motion-system.ts`
- Modify: `src/components/ui/dialog.tsx`
- Modify: `src/components/ui/sheet.tsx`
- Modify: `src/components/ui/date-picker.tsx`
- Modify: `src/app/estimates/[id]/estimate-detail-header.tsx`
- Modify: Estimate DatePicker call sites only to remove the legacy appearance request.

**Interfaces:**

- Consumes: V2 surface, border, hover, selected, overlay, typography, row, and radius tokens.
- Produces: 40px/r6 dropdown rows, underline tabs, visible Light overlay, correct task titles, and a Light-only DatePicker runtime.

- [ ] **Step 1: Add failing runtime tests for each component contract**

Assert Dropdown content/row radius and height, Tabs active underline/no boxed fill, Dialog and Sheet overlay computed background, task title type, and DatePicker surface colors with no backdrop filter.

- [ ] **Step 2: Run tests and confirm RED failures correspond to current computed styles**

- [ ] **Step 3: Implement the shared contracts**

Remove Estimate `rounded-md`, `rounded-sm`, and `shadow-md` overrides. Keep mobile menu items at 44px via the touch contract. Replace the old DatePicker glass branch with the V2 Light contract while retaining the accepted prop temporarily if compatibility requires it.

- [ ] **Step 4: Run GREEN and focused component contracts**

- [ ] **Step 5: Inspect the diff; do not commit**

### Task 4: Input, Select, and Textarea Geometry

**Files:**

- Modify: `src/components/ui/input.tsx`
- Modify: `src/components/ui/select.tsx`
- Modify: `src/components/ui/textarea.tsx`
- Modify: Foundation-owned field helpers or Estimate-only visual overrides that force 40px, but no other module-specific forms.
- Modify: runtime Foundation test.

**Interfaces:**

- Consumes: standard 36px control and 44px touch tokens.
- Produces: computed 36px desktop and 44px portrait/mobile controls without an unapproved 40px override.

- [ ] **Step 1: Add failing computed-style assertions at desktop and portrait sizes**
- [ ] **Step 2: Confirm RED only where an unapproved 40px/local override exists**
- [ ] **Step 3: Remove the narrowest conflicting override and reuse shared tokens**
- [ ] **Step 4: Re-run GREEN and inspect the diff; do not commit**

### Task 5: Runtime Certification and Regression Gate

**Files:**

- Create or modify: `tests/hh-v2-foundation-runtime.spec.ts`
- Modify: only tests required to replace obsolete expected Foundation values.
- No production changes unless a runtime GAP is reproduced and enters a new RED/GREEN cycle.

**Interfaces:**

- Consumes: Tasks 1–4.
- Produces: Figma → token → computed matrix and certification evidence.

- [ ] **Step 1: Run the single Impeccable detector pass**

```bash
node /Users/solidcore/.agents/skills/impeccable/scripts/detect.mjs --json <changed UI targets>
```

- [ ] **Step 2: Run Foundation contracts and runtime computed-style audit**
- [ ] **Step 3: Run portrait and legacy runtime leak audit**
- [ ] **Step 4: Confirm local-only E2E target before any mutating regression**
- [ ] **Step 5: Run Estimate regression and financial regression only against confirmed local Supabase**
- [ ] **Step 6: Run `npm run typecheck`, `npm run lint`, and `npm run build` under Node 22.x**
- [ ] **Step 7: Inspect console, horizontal overflow, final diff, and `git status`**
- [ ] **Step 8: Calculate the fixed audit denominator without lowering standards**

P0 must be 100%. Overall strict checks must be at least 95%. Any remaining runtime GAP forces `FOUNDATION = NEEDS FIXES`.
