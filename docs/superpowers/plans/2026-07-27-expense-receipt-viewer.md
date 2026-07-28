# Expense Receipt Viewer Implementation Plan

> Local implementation only. Do not commit, push, deploy, or modify
> `supabase/.temp/cli-latest`.

## 1. Establish regression contracts

- Extend the Expense Inbox receipt preview Playwright coverage with accessible dialog semantics,
  focus restoration, Escape, backdrop behavior, toolbar actions, stable Inbox URL/state,
  responsive layouts, reduced motion, stale-image isolation, and protected failure messaging.
- Run the targeted test before implementation and record the expected failure.

## 2. Add receipt viewer types and local interaction state

- Define display-only receipt metadata and presentation types.
- Implement local fit/zoom/pan/rotation state with bounded transforms.
- Reset transient transforms when the selected receipt changes.
- Ignore stale image decode completion.

## 3. Build the reusable presentation components

- Build the Radix Dialog shell with independent overlay and content motion.
- Build the stable image canvas with delayed loading indicator, skeleton, decoded reveal, retry,
  and existing signed-URL refresh callbacks.
- Build the toolbar with labelled controls, desktop hints, visible focus, and touch targets.
- Build a responsive read-only metadata panel using existing expense values only.

## 4. Integrate without changing secure access

- Extend the global preview session with an optional receipt presentation and focus-return target.
- Preserve the existing open/patch/close, signed URL cache, preflight, expiry refresh, and
  stale-session logic.
- Opt in only from Expense Inbox `openReceiptPreview(row)`.
- Keep the generic attachment viewer unchanged for unrelated modules.

## 5. Validate locally

- Run targeted unit/component tests if applicable.
- Run the targeted receipt viewer Playwright suite against local Docker Supabase.
- Verify desktop `1440×900` and `1280×800`, tablet `820×1180`, mobile `390×844`, and landscape.
- Check cached/uncached, tall/wide/high-resolution, failure/retry, rapid reopen, multiple receipts,
  keyboard-only, reduced motion, overflow, console, duplicate requests, and stale media.
- Run `git diff --check`, `npm run lint`, and `npx tsc --noEmit`.
- Confirm only scoped files changed and `supabase/.temp/cli-latest` remains the pre-existing
  uncommitted change.
