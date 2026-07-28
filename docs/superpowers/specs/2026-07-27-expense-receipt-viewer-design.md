# Expense Receipt Viewer Design

Date: 2026-07-27
Status: Approved direction supplied by the user; implementation authorized locally only.

## Problem

Expense Inbox receipt previews currently open inside the global `AttachmentPreviewModal`, a
manually portalled full-viewport surface. The modal is not connected to the launching `View`
button through an accessible dialog primitive. On coarse-pointer devices,
`useFastMobilePreviewMotion` sets the initial shell opacity to `1` and the opening duration to
`0`, while desktop still replaces the page with a full-screen graphite layer. The result is an
abrupt flash that feels like route navigation even though the Inbox route and table remain
mounted.

## Guardrails

- Preserve the existing receipt item collection, signed-URL resolution, cache, preflight,
  expiry refresh, retry, and stale-session guards.
- Do not alter Supabase Storage permissions, RLS, database schema, upload/OCR/approval flows,
  or financial calculations.
- Do not remount the Inbox table or move viewer state into the table.
- Keep the existing generic attachment viewer presentation for non-Expense-Inbox callers.
- Add no new dependency.

## Architecture

The existing global attachment-preview context remains the orchestration boundary. Its session
payload gains an optional receipt presentation descriptor:

- `presentation: "receipt"`
- immutable, display-only metadata derived from the already loaded `Expense`
- the exact focused element captured when the session opens

The context continues to own open/patch/close and signed URL session state. When the receipt
presentation is selected, it renders a reusable receipt-specific component family:

- `ReceiptViewer` — controlled Radix Dialog root, portal, focus lifecycle, responsive shell
- `ReceiptViewerToolbar` — labelled zoom, rotate, fit/reset, download, and close controls
- `ReceiptImageCanvas` — stable loading/error/media stage and transform-based gestures
- `ReceiptViewerMetadata` — display-only existing expense facts
- `useReceiptViewer` — local zoom, pan, rotation, keyboard, pointer, and touch state

The component API receives already-authorized preview files and callbacks. It never queries
Supabase, signs URLs, uploads files, or mutates expenses.

## Interaction States

1. `opening`: click target remains the focus-return anchor; backdrop and shell mount immediately.
2. `resolving`: stable canvas skeleton is visible while the signed URL is resolved.
3. `loading`: media URL exists; the image decodes inside the stable canvas.
4. `ready`: decoded image fades in; controls become active.
5. `error`: protected URL details stay hidden; Retry and Download/Open Original are offered only
   through existing authorized callbacks.
6. `closing`: shell and backdrop exit gently, then focus returns to the exact launching button.

Opening motion uses a 180 ms backdrop fade and a 220 ms shell fade/scale/10 px translation.
Decoded media reveals over 160 ms. Closing uses 160 ms. Reduced motion removes transform motion
and retains a minimal opacity transition.

## Responsive Layout

- Desktop: centered elevated shell, maximum `1180px × 860px`, image-first split with a compact
  right metadata rail.
- Tablet: nearly full-screen shell with a narrower metadata rail and touch-sized controls.
- Mobile: `100dvh` full-screen shell, safe-area-aware header/footer, image-first canvas, and a
  collapsible metadata section.
- Landscape mobile/tablet: the canvas remains primary and controls stay within the dynamic
  viewport without horizontal overflow.

## Accessibility

Radix Dialog supplies modal semantics, background inertness, focus trapping, and Escape handling.
The viewer provides a meaningful title and description, visible dark-surface focus rings, labelled
icon controls, keyboard zoom/reset commands, and explicit focus restoration to the launch button.
Raw signed URLs are never included in accessible text.

## Open-Source Assessment

- Radix Dialog: adopted through the already installed `@radix-ui/react-dialog`; maintained, MIT,
  and aligned with the repository primitives.
- shadcn/ui Dialog/Sheet: composition and responsive shell patterns adapted to existing local
  primitives; no package addition.
- PhotoSwipe: interaction patterns reviewed, but not added. Version 5.4.4 is MIT and approximately
  1.2 MB unpacked; it expects known image dimensions and recommends bounded image sizes, which does
  not fit the current receipt records cleanly.
- Vaul: gesture ideas reviewed, but not added. The repository declares itself unmaintained and a
  drawer dependency is unnecessary for a mobile full-screen viewer.

## Verification

Automated coverage will verify shell-first loading, focus trap/restoration, Escape and close
behavior, backdrop handling, zoom/reset/rotate, stale-image isolation, responsive layouts,
reduced motion, overflow, protected error messages, and preservation of the Inbox URL/state.
Real-browser QA will use the local Docker Supabase environment at desktop, tablet, mobile, and
landscape sizes. No production data or deployment is permitted in this task.
