# Estimate Premium Visual Refinement — Design

**Status:** Owner-approved direction; implementation pending written-spec review  
**Date:** 2026-08-19  
**Mode:** UX Polish  
**Scope:** New Estimate and Existing Estimate Builder surfaces only

## Objective

Raise the approved Estimate Workspace from clean functional SaaS to a restrained premium construction estimating surface. Preserve high information density, fast scanning, stable numeric alignment, and purposeful responsive behavior while reducing unnecessary borders, nested cards, and default input chrome.

This is a visual refinement only. It does not alter information architecture, workflow, persistence, calculations, customer-output semantics, Rich Text behavior, Payment Schedule, Invoice behavior, or Preview/PDF behavior.

## Approved approach

Use an Estimate-scoped CSS refinement with only the minimum JSX class cleanup needed to remove purely decorative boundaries. Keep the current component structure, data flow, accessible names, focus behavior, field order, and New/Existing workspace composition.

Rejected alternatives:

- Component-structure refactor: broader regression risk to focus, Rich Text, responsiveness, and persistence.
- Token-only adjustment: insufficient to remove the current nested panel and per-field chrome.

## Visual design

### Scope workspace

- Treat Scope of Work as the primary working plane, not another elevated card.
- Remove hover lift and decorative shadow from the Scope panel.
- Reduce the outer panel border to the minimum structural boundary needed on mobile; desktop uses workspace alignment, spacing, and a quiet section edge.
- Keep the Scope toolbar location and controls unchanged, with one restrained divider separating tools from estimating content.

### Pricing summary

- Keep the existing Subtotal, Tax, Discount, Total order and values.
- Replace the enclosed four-cell card appearance with a quiet financial information band.
- Remove vertical cell boxes and the decorative Total fill.
- Preserve right alignment, tabular numerals, normal zero, and the verified currency formatting path.
- Keep Total visually dominant through type weight and size, not color or a boxed background.
- Preserve Pricing details disclosure and its existing content/behavior.

### Section hierarchy

- Use section title, item count, subtotal, and a single structural divider to define each section.
- Reduce the chip-like appearance around section identity.
- Keep active-section, collapsed, sticky, drag, and Add line behavior unchanged.
- Treat item count and Add line as secondary; keep section subtotal aligned with the Line Total column.
- Preserve touch targets on iPad/mobile.

### Line items

- Desktop and wide iPad retain the current estimating grid and column order.
- Default editable controls use transparent or near-transparent borders so the row reads as one estimating record.
- Hover reveals a restrained row surface; focus reveals the full editable control boundary and ring.
- Keep invalid, disabled, error, and loading states semantically distinct.
- Remove the read-only Description box border so customer scope text reads as content rather than an input.
- Keep the editable Description surface and Rich Text toolbar identifiable, accessible, and functionally unchanged.
- Preserve row separators, but lighten them so they organize without producing a full spreadsheet grid.
- Keep Qty, Unit, Unit Price, and Line Total stable, tabular, and right-aligned where currently specified.

### Mobile

- Retain purpose-designed mobile cards and the existing task order.
- Do not apply desktop borderless inputs where field grouping would become ambiguous.
- Keep 44px touch targets, safe-area behavior, sticky Total visibility, and mobile action reachability.
- Apply only shared typography, color, and excessive-shadow cleanup that remains safe for mobile cards.

## Component and file boundaries

Expected implementation surface:

- `src/app/estimates/_components/estimate-builder-operational.css`
- `src/app/estimates/_components/proposal-scope-work-card.tsx`
- one focused Estimate Playwright regression spec

`estimate-builder-summary.tsx`, New/Existing editor components, calculations, actions, and data helpers remain unchanged unless verification proves a purely presentational class hook is necessary. Any required semantic, persistence, financial, or lifecycle change is a STOP condition.

## Interaction and accessibility

- Preserve keyboard order, accessible names, native input behavior, focus management, and reduced-motion behavior.
- Default, hover, focus-visible, disabled, invalid, read-only, and loading states must remain distinguishable.
- Do not use color alone for status or validation.
- No new animation, scale, lift, gradient, blur, or decorative shadow.

## Financial integrity

No formulas or presentation meaning change. The canonical values remain the existing server/UI calculation outputs. Styling must not alter or reinterpret subtotal, tax, discount, total, quantity, unit, unit price, line total, Proposal/Itemized meaning, rounding, currency, or internal cost labels.

## Verification design

Use `tests/.estimate-no-schema.config.ts` only; no schema repair.

Test the dense preserved Estimate with multiple sections and more than 50 line items at:

- 1440 desktop
- 1280 desktop
- iPad landscape
- iPad portrait
- 390×844 mobile

Assertions and visual review cover:

- Scope panel is flat and does not use decorative hover lift/shadow.
- Summary has no vertical boxed-cell treatment; Total remains strongest.
- Read-only Description has no decorative border.
- Desktop inputs are quiet by default and fully visible on focus.
- Mobile card boundaries and 44px controls remain intact.
- Numeric columns remain aligned and no horizontal overflow or control collision appears.
- New and Existing continue to share the same Builder visual language.
- Existing save, Save & Preview, field editing, and Rich Text behavior remain unchanged.
- TypeScript, lint, scoped lint, formatting, and diff checks pass.

## Completion boundary

The pass is complete only when the coherent Scope, Section, Line Item, and Summary refinement is verified across the five viewports without workflow, financial, persistence, or Rich Text regression. No deployment is authorized.
