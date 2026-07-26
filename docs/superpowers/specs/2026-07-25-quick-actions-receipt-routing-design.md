# Quick Actions Receipt Routing Design

## Goal

Make every generic, global `Upload Receipt` action open the Expense Receipt Inbox at
`/financial/inbox`, while preserving the legacy worker receipt uploader at `/upload-receipt`
for labor and worker-context entry points.

## Root Cause

The responsive global FAB defines its own action array and maps `Upload Receipt` directly to
`/upload-receipt`. That route is the worker reimbursement uploader and renders
`Worker Receipt Upload`. Other global surfaces independently define receipt actions, so the
header, command palette, IA registry, dashboard, and prefetch registry have drifted into
competing meanings.

The bug is most visible on mobile and tablet because the global FAB is shown below the
`lg` breakpoint. There is no mobile-specific routing override; both viewports consume the
same incorrect hard-coded mapping.

## Approved Architecture

Create one serializable shared action definition:

```ts
export const UPLOAD_RECEIPT_ACTION = {
  id: "upload-receipt",
  label: "Upload Receipt",
  description: "Open the Expense Receipt Inbox for OCR and expense processing",
  href: "/financial/inbox",
  keywords: ["upload receipt", "expense receipt", "receipt inbox", "ocr", "expense intake"],
} as const;
```

Global/shared surfaces consume the same definition:

- Mobile/tablet Floating Action Button
- Dashboard Quick Actions
- Desktop header Finance menu
- Command palette
- IA/navigation receipt-inbox mappings
- Quick-action route prefetching

The ambiguous Documents navigation item and command that map generic receipt upload language
to `/upload-receipt` are removed.

## Worker Workflow Compatibility

The `/upload-receipt` page and its API contracts remain unchanged. Existing labor and
worker-context links continue to reach it, but every visible link is renamed
`Upload Worker Receipt`. The generic action constant never references the labor route.

## Verification Design

Add a focused Playwright spec covering:

- Desktop: Dashboard Quick Actions, header Finance menu, command palette
- Mobile `390x844`: Dashboard Quick Actions, global FAB, header Finance menu, command palette
- Tablet `820x1180`: Dashboard Quick Actions, global FAB, header Finance menu, command palette
- Labor compatibility: `/labor/receipts` exposes `Upload Worker Receipt`, which still opens
  `/upload-receipt` and renders `Worker Receipt Upload`

Each generic action assertion verifies:

1. URL is `/financial/inbox`
2. the Inbox heading is visible
3. `Worker Receipt Upload` is absent

Run repository searches after implementation to verify no shared/global generic mapping to
`/upload-receipt` remains. Finish with lint, TypeScript, targeted Playwright, and real-browser
checks against the local Docker Supabase-backed app.

## Scope Exclusions

- No route migration
- No changes inside the legacy worker uploader implementation
- No API, Supabase query, schema, migration, or financial logic changes
- No commit, push, or deployment
- No changes to the pre-existing `supabase/.temp/cli-latest` modification
