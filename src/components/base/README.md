# HH base component guidance

Use the existing HH components inside the canonical AppShell. The current visual authority is the [Figma mapping](../../../docs/FIGMA_CODE_MAPPING_V2.md) → [frozen HH baseline](../../../docs/architecture/HH_GROUP_GLOBAL_UI_UX_BASELINE.md) → [v2 tokens](../../styles/hh-design-system-v2.css) and their canonical components. Production code owns business behavior. This guide and `/design-system` demonstrate that authority; neither defines a separate palette or framework.

**KEEP:** Geist, semantic surface layers, approved borders and financial alignment, the Estimate workspace, and existing compatibility adapters. Use Panel/Card and elevation only where the existing HH composition calls for them; do not apply a global no-card or no-border rule.

**Compatibility:** `NeoPanel` delegates to `Panel`; legacy PageHeader, FilterBar and DataTable adapters delegate to canonical components; generated tokens retain v2 aliases. Keep these APIs rather than deleting them or creating another design system.

---

## Canonical components and supported adapters

### 1. DataTable

**File:** `src/components/base/data-table.tsx`

- Sticky header (via `TableHeader` from `ui/table`)
- Consistent row height (`table-row-compact` / h-11)
- Row hover state
- Right-aligned numeric columns (`numeric: true` on column)
- Optional row click (`onRowClick`)
- Optional row actions via ellipsis menu (`rowActions`)

**Usage:** Replace ad-hoc tables with `<DataTable columns={...} data={...} getRowId={...} />`. Use `rowActions` for per-row menus (Edit, Delete, etc.). Use `col.numeric` for currency/numbers.

---

### 2. PageLayout (PageHeader, ActionBar, Divider, MainContent)

**File:** `src/components/base/page-layout.tsx`

- **PageHeader** – Title, optional description, optional right-side slot
- **ActionBar** – Left/right slots for filters and primary actions (delegates to `Toolbar` with `variant="actions"`)
- **Divider** – Horizontal rule (`ui-divider`)
- **MainContent** – Wrapper for page body
- **PageLayout** – Composes header, optional action bar, divider, main content

**Usage:** Use for full-page layouts. Example:

```tsx
<PageLayout
  header={<PageHeader title="Estimates" description="Manage estimates" />}
  actionBar={<ActionBar left={<Search... />} right={<Button>New</Button>} />}
>
  <DataTable ... />
</PageLayout>
```

---

### 3. StatusBadge

**File:** `src/components/base/status-badge.tsx`

- Semantic pill delegating to `ui/Badge`, with optional dot (`showDot`, default `true`)
- Variants: `default`, `success`, `warning`, `danger`, `muted`, `info`
- Canonical Badge states: `neutral`, `success`, `warning`, `information`, `danger`; existing `default`, `secondary`, `destructive`, `outline` variants remain supported.

**Usage:** Use for status labels with the existing domain mapping; do not change business status labels or meanings for visual consistency.

---

### 4. Button

**File:** `src/components/ui/button.tsx`

- Variants: `default`/`primary`, `secondary`/`outline`, `quiet`/`ghost`, `destructive`
- Sizes: `default`, `sm`, `lg`, `icon`, `touch`

**Usage:** Use `primary` (or `default`) for the main action, `secondary`/`outline` for supporting actions, `quiet`/`ghost` for subtle controls, and `destructive` for destructive actions. `danger` is not a Button variant. Prefer these supported variants over legacy `btn-outline-*` styling companions.

---

### 5. Drawer

**File:** `src/components/base/drawer.tsx`

- Right-side panel (uses Radix Sheet)
- Shared HH task surface, border, radius and `shadow-task` elevation
- Optional title and description

**Usage:** Reuse for existing edit/create side-panel workflows. Preserve route and workflow choices; this component does not authorize converting full-page or Estimate workspaces.

---

### 6. ConfirmDialog

**File:** `src/components/base/confirm-dialog.tsx`

- Simple modal with title, optional description, Cancel + Confirm
- Confirm can be destructive (red) or primary
- Optional loading state

**Usage:** Use for delete/confirm flows. Replace inline Dialog usage where the pattern is “confirm action”.

---

### 7. SectionHeader

**File:** `src/components/base/section-header.tsx`

- `title` uses the shared section-title typography, optional `subtitle`, and no automatic divider
- `label` uses shared section-label typography with a divider
- Optional right-side `action`

**Usage:** Use for section titles within a page (e.g. “Payment schedule”, “Line items”).

---

## File locations

| Component         | Path                                     |
| ----------------- | ---------------------------------------- |
| DataTable         | `src/components/base/data-table.tsx`     |
| PageLayout etc.   | `src/components/base/page-layout.tsx`    |
| StatusBadge       | `src/components/base/status-badge.tsx`   |
| Button (variants) | `src/components/ui/button.tsx`           |
| Drawer            | `src/components/base/drawer.tsx`         |
| ConfirmDialog     | `src/components/base/confirm-dialog.tsx` |
| SectionHeader     | `src/components/base/section-header.tsx` |
| Barrel export     | `src/components/base/index.ts`           |

---

## How to use across the app

- **Page content:** Use `PageLayout`, `PageHeader`, `ActionBar`, `Divider`, and `MainContent` inside the existing global shell; `DataTable` for lists; supported Button variants for actions; `StatusBadge`, `Drawer`, `ConfirmDialog`, and `SectionHeader` where the existing workflow calls for them. PageLayout does not create another Global Shell or Sidebar.
- **Existing pages:** Preserve mature compositions and compatibility adapters. Apply only authorized, scoped repairs using current v2 tokens; do not mass-migrate pages or replace financial formatters.
- **Imports:** Use the existing `@/components/base` exports and `@/components/ui/button`; do not add another barrel or component authority.
- **State and motion:** `SystemState` owns bounded loading/empty/error compositions. Popover, Dropdown/Menu (including submenus), and Select consume `motionPopoverLayer`; reduced motion uses the existing opacity-only Sheet fade. `SubmitSpinner` stops rotating under reduced motion while caller-owned pending text and busy semantics remain present.
