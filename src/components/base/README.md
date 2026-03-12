# Phase 2 – Base component system

Minimal Linear-style UI components. Use these across the app as the standard building blocks. Design tokens from Phase 1 (`globals.css`) are used throughout.

**Rules:** No card-based components, no shadow-heavy design, no large rounded corners.

---

## Created components

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
- **ActionBar** – Left/right slots for filters and primary actions (uses `border-border/60`)
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

- Dot + text only (no pill/chip background)
- Variants: `default`, `success`, `warning`, `muted`

**Usage:** Use for status labels (e.g. Draft, Sent, Approved). Prefer over colored pill tags.

---

### 4. Button  
**File:** `src/components/ui/button.tsx` (variants extended)

- Variants: **primary**, **secondary**, **ghost**, **danger** (plus `default`/`destructive` for backward compatibility)
- Sizes: `default`, `sm`, `lg`, `icon` (unchanged)

**Usage:** Prefer `variant="primary"` and `variant="danger"` for the design system; existing `default` and `destructive` still work.

---

### 5. Drawer  
**File:** `src/components/base/drawer.tsx`

- Right-side panel (uses Radix Sheet)
- Minimal style: light border, no heavy shadow (`shadow-0`)
- Optional title and description

**Usage:** Use for edit/create side panels instead of full-page or heavy modals. Replaces ad-hoc Sheet usage where a minimal right panel is needed.

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

- Small uppercase muted label (`table-head-label` style)
- Divider underneath
- Optional right-side action

**Usage:** Use for section titles within a page (e.g. “Payment schedule”, “Line items”).

---

## File locations

| Component        | Path |
|-----------------|------|
| DataTable       | `src/components/base/data-table.tsx` |
| PageLayout etc. | `src/components/base/page-layout.tsx` |
| StatusBadge     | `src/components/base/status-badge.tsx` |
| Button (variants) | `src/components/ui/button.tsx` |
| Drawer          | `src/components/base/drawer.tsx` |
| ConfirmDialog   | `src/components/base/confirm-dialog.tsx` |
| SectionHeader   | `src/components/base/section-header.tsx` |
| Barrel export   | `src/components/base/index.ts` |

---

## How to use across the app

- **New pages / features:** Use `PageLayout`, `PageHeader`, `ActionBar`, `Divider`, `MainContent` for the shell; `DataTable` for lists; `Button` with `primary`/`secondary`/`ghost`/`danger`; `StatusBadge` for statuses; `Drawer` for slide-over forms; `ConfirmDialog` for confirmations; `SectionHeader` for in-page sections.
- **Existing pages:** Do **not** refactor all at once. When touching a page, migrate that page to these components and Phase 1 tokens.
- **Imports:** Prefer `import { DataTable, PageLayout, ... } from "@/components/base"` for the new components; keep using `@/components/ui/button` for Button (or re-export from base if you add a barrel that re-exports Button from ui).
