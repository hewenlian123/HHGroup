# Optimistic edit / save

## Goals

- **Immediate UI**: apply local state on Save (or equivalent) without waiting for the server.
- **Background persist**: call API / Supabase after the UI update; do not block the main thread for user-visible “done” state.
- **Rollback + toast**: on failure, restore the previous snapshot and show an error.
- **Busy state**: disable repeat submits and show Saving… where applicable (`runOptimisticPersist` + `flushSync` for instant feedback).

## Helper: `runOptimisticPersist`

`src/lib/optimistic-save.ts`

- `apply()` — optimistic update (often wrapped in `flushSync` inside the helper).
- `persist()` — async; return `{ error: string }` or `undefined` on success.
- `rollback()` — restore snapshot on failure.
- `setBusy` — optional loading flag for buttons.

Use when the flow is: **one clear snapshot**, **one write**, **rollback = restore snapshot**.

## Project detail

Uses `dispatchClientDataSync` + `HH_PROJECT_EDIT_OPTIMISTIC_REASON` so list/detail share one optimistic path without full refetch.

## Other modules

Apply the same rules: no `router.refresh` / full list refetch on save; patch local state; persist in background; rollback on error.

Covered in app code:

- **Customers** — list modal edit (`customers-client.tsx`); detail page (`customers/[id]/page.tsx`) with `serverFormRef` rollback baseline.
- **Settings → Company** — profile save merges form into `profile` optimistically; success replaces with server row; logo upload/remove uses `dispatchClientDataSync` only (no `router.refresh`).
- **Settings → Permissions** — `savedPermsRef` baseline + upsert in background.
- **Settings → Subcontractors table** — row edit like workers; delete still restores snapshot on failure.
- **Tasks** — new task (temp id → real id), drawer save, toggle done, delete; `createProjectTaskAction` / `updateProjectTaskAction` return the task for local reconciliation; mutations use `dispatchClientDataSync` instead of `syncRouterAndClients` where possible.
