import { cn } from "@/lib/utils";

/**
 * Global interaction contract (buttons, rows, overlays, fields).
 * Prefer these tokens over one-off durations or hex hovers.
 * Inline loading: `InlineLoading` from `@/components/ui/skeleton` (no spinners in UI).
 */

/** App-wide default easing + duration (Linear / iOS-like). */
export const motionTransition =
  "transition-[background-color,border-color,color,box-shadow,opacity] duration-150 ease-out";

/** Hover on buttons, links, list tiles (not heavy cards). */
export const motionInteractiveHover = cn("hover:bg-[var(--hh-l3-hover)]");

/** Press feedback for clickable controls (desktop + mobile scale). */
export const motionClickableActive = cn("active:bg-[var(--hh-l3-pressed)] active:duration-100");

/** Dense icon-only controls (toolbar, ghost icons). */
export const motionIconButtonHover = "hover:bg-[var(--hh-l3-hover)]";

export const motionIconButtonActive = "active:bg-[var(--hh-l3-pressed)] active:duration-100";

/** Table / dense list rows — subtler press than full click targets. */
export const motionRowPress = "active:bg-[var(--hh-l3-pressed)] active:duration-100";

/** Data table rows — no vertical nudge; Linear-style flat hover. */
export const motionListTableRow = cn(
  "group",
  motionTransition,
  "hover:bg-[var(--hh-l3-hover)]",
  motionRowPress
);

/** Form controls — ring only, no layout jump. */
export const motionInputFocus = cn("hh-focus-ring");

/** Optional: bordered cards / image tiles that should feel “lifted”. */
export const motionCardHover = cn(
  motionTransition,
  "hover:border-[var(--hh-border-strong)] hover:shadow-operational"
);

/**
 * Shared popover / menu surface: restrained fade only.
 * Pair with slide-in-from-* from Radix side if needed.
 */
export const motionPopoverLayer = cn(
  "duration-150 ease-out",
  "data-[state=open]:animate-in data-[state=closed]:animate-out",
  "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
);

/** HH Neo Focus Reveal: shared modal overlay. */
export const hhNeoFocusRevealOverlay = cn(
  "hh-overlay-scrim",
  "data-[state=open]:animate-hh-modal-fade-in data-[state=closed]:animate-hh-modal-fade-out",
  "motion-reduce:data-[state=open]:animate-hh-modal-fade-in motion-reduce:data-[state=closed]:animate-hh-modal-fade-out",
  "data-[state=closed]:pointer-events-none"
);

/** HH Neo Focus Reveal: centered desktop dialog content. */
export const hhNeoFocusRevealDialog = cn(
  "md:data-[state=open]:animate-hh-dialog-in md:data-[state=closed]:animate-hh-dialog-out",
  "motion-reduce:md:data-[state=open]:animate-hh-modal-fade-in motion-reduce:md:data-[state=closed]:animate-hh-modal-fade-out"
);

/** HH Neo Focus Reveal: mobile near-full bottom sheet content. */
export const hhNeoFocusRevealMobileSheet = cn(
  "max-md:data-[state=open]:animate-hh-sheet-in max-md:data-[state=closed]:animate-hh-sheet-out",
  "motion-reduce:max-md:data-[state=open]:animate-hh-modal-fade-in motion-reduce:max-md:data-[state=closed]:animate-hh-modal-fade-out"
);

/** HH Neo Focus Reveal: command palette surface. */
export const hhNeoFocusRevealCommand = cn(
  "sm:data-[state=open]:animate-hh-command-dialog-in sm:data-[state=closed]:animate-hh-command-dialog-out",
  "max-sm:data-[state=open]:animate-hh-sheet-in max-sm:data-[state=closed]:animate-hh-sheet-out",
  "motion-reduce:data-[state=open]:animate-hh-modal-fade-in motion-reduce:data-[state=closed]:animate-hh-modal-fade-out"
);

/** HH Neo Focus Reveal: manually mounted centered panel. */
export const hhNeoFocusRevealPanel = cn(
  "animate-hh-panel-dialog-in motion-reduce:animate-hh-modal-fade-in"
);

/** Base for data rows (group + hover + row press). */
export const motionListRow = cn("group", motionTransition, motionInteractiveHover, motionRowPress);
