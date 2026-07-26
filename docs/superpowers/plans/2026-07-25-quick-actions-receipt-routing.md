# Quick Actions Receipt Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every generic shared `Upload Receipt` action to the Expense Receipt Inbox while preserving the explicitly named worker receipt workflow.

**Architecture:** Add a small serializable shared action contract under `src/lib/navigation`, then consume it from the FAB, dashboard, header, command palette, IA registry, and prefetch registry. Remove ambiguous global worker-route mappings and rename only worker-context links; do not alter the legacy route implementation.

**Tech Stack:** Next.js App Router, React, TypeScript, shadcn/Radix UI, Playwright

---

### Task 1: Add the failing responsive routing regression

**Files:**

- Create: `tests/quick-actions-receipt-routing.spec.ts`

- [ ] **Step 1: Add independent expected-route assertions**

Create viewport cases for desktop `1440x900`, mobile `390x844`, and tablet `820x1180`.
For every applicable global entry point, navigate from `/dashboard`, activate the
`Upload Receipt` action, and assert:

```ts
await expect(page).toHaveURL(/\/financial\/inbox(?:[?#].*)?$/);
await expect(page.getByRole("heading", { name: /^Inbox$/i })).toBeVisible();
await expect(page.getByRole("heading", { name: /^Worker Receipt Upload$/i })).toHaveCount(0);
```

Also add a labor compatibility test that clicks `Upload Worker Receipt` from
`/labor/receipts` and asserts `/upload-receipt` plus the worker uploader heading.

- [ ] **Step 2: Run the new spec before production changes**

Run:

```bash
CI= npx playwright test tests/quick-actions-receipt-routing.spec.ts --project=chromium
```

Expected: FAIL because the current FAB/header/command mappings open `/upload-receipt` and the
dashboard does not yet expose the canonical generic action.

### Task 2: Introduce the shared canonical action

**Files:**

- Create: `src/lib/navigation/actions.ts`

- [ ] **Step 1: Define the serializable action contract**

```ts
export type HhProjectOsAction = {
  id: string;
  label: string;
  description: string;
  href: string;
  keywords: readonly string[];
};

export const UPLOAD_RECEIPT_ACTION = {
  id: "upload-receipt",
  label: "Upload Receipt",
  description: "Open the Expense Receipt Inbox for OCR and expense processing",
  href: "/financial/inbox",
  keywords: ["upload receipt", "expense receipt", "receipt inbox", "ocr", "expense intake"],
} as const satisfies HhProjectOsAction;
```

### Task 3: Converge every shared/global consumer

**Files:**

- Modify: `src/components/layout/floating-action-button.tsx`
- Modify: `src/app/dashboard/dashboard-quick-actions.tsx`
- Modify: `src/components/layout/topbar.tsx`
- Modify: `src/components/command/neo-command-palette.tsx`
- Modify: `src/lib/navigation/ia.ts`
- Modify: `src/lib/route-prefetch.ts`

- [ ] **Step 1: Replace local generic mappings**

Import `UPLOAD_RECEIPT_ACTION` and use its `label` and `href` in the FAB, dashboard, header
Finance menu, and command palette.

- [ ] **Step 2: Remove competing global worker-route exposure**

Remove `Receipt Uploads → /upload-receipt` from the Documents registry, remove the
`go-receipt-uploads` command, remove `/upload-receipt` from Documents mobile ownership aliases,
and remove the global header `Upload Worker Receipt` item.

- [ ] **Step 3: Align prefetching**

Replace the quick-action `/upload-receipt` prefetch entry with
`UPLOAD_RECEIPT_ACTION.href`.

### Task 4: Make worker-context link labels explicit

**Files:**

- Modify: `src/app/labor/receipts/receipts-client.tsx`
- Modify: `src/app/workers/workers-list-client.tsx`
- Modify: `src/app/workers/[id]/page.tsx`
- Modify affected worker-context Playwright locators under `tests/`

- [ ] **Step 1: Rename visible links only**

Change worker-route link labels and aria labels from generic `Upload Receipt` to
`Upload Worker Receipt`. Do not change hrefs, route files, API endpoints, or the worker upload
implementation.

### Task 5: Prove the fix and audit duplicates

**Files:**

- Modify existing navigation tests only where their old expectations describe removed
  ambiguous global entries.

- [ ] **Step 1: Run the focused spec**

```bash
CI= npx playwright test tests/quick-actions-receipt-routing.spec.ts --project=chromium
```

Expected: all tests pass.

- [ ] **Step 2: Run related navigation and worker-route specs**

```bash
CI= npx playwright test tests/neo-command-palette.spec.ts tests/sidebar-final-pass-navigation.spec.ts tests/worker-center-return-paths.spec.ts --project=chromium
```

Expected: all tests pass with the canonical generic action and explicit worker label.

- [ ] **Step 3: Audit repository mappings**

Use `rg` for `/upload-receipt`, `/financial/inbox`, `Upload Receipt`, `Receipt Uploads`, and
receipt-related action IDs. Classify every remaining `/upload-receipt` result as legacy route
infrastructure, API/test coverage, or labor/worker-context access.

- [ ] **Step 4: Run static verification**

```bash
npm run lint
npx tsc --noEmit
git diff --check
```

Expected: exit code `0` for every command.

- [ ] **Step 5: Run real-browser verification**

Against the local Docker Supabase-backed app, exercise desktop `1440x900`, mobile `390x844`,
and tablet `820x1180`. Record URLs, visible headings, console errors, and screenshots only if
the rendered UI changes.

- [ ] **Step 6: Report without committing**

Report the root cause, architecture, files changed, removed mappings, exact command results,
browser evidence, `git diff --stat`, preserved legacy route, and future route-migration
recommendation. Do not commit, push, or deploy.
