import { cn } from "@/lib/utils";

/**
 * Global interaction contract (buttons, rows, overlays, fields).
 * Prefer these tokens over one-off durations or hex hovers.
 * Inline loading uses `InlineLoading`; submit actions may use `SubmitSpinner`.
 * Loading indicators keep their text/busy cue when reduced motion stops rotation.
 */

/** App-wide default easing + duration (Linear / iOS-like). */
export const motionTransition =
  "transition-[background-color,border-color,color,box-shadow,opacity] duration-fast ease-motion-out";

/** Hover on buttons, links, list tiles (not heavy cards). */
export const motionInteractiveHover = cn("hover:bg-[var(--hh-l3-hover)]");

/** Press feedback for clickable controls (desktop + mobile scale). */
export const motionClickableActive = cn("active:bg-[var(--hh-l3-pressed)] active:duration-micro");

/** Dense icon-only controls (toolbar, ghost icons). */
export const motionIconButtonHover = "hover:bg-[var(--hh-l3-hover)]";

export const motionIconButtonActive = "active:bg-[var(--hh-l3-pressed)] active:duration-micro";

/** Table / dense list rows — subtler press than full click targets. */
export const motionRowPress = "active:bg-[var(--hh-l3-pressed)] active:duration-micro";

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
 * Shared popover / menu / select surface: restrained fade and optional side entry.
 * Reduced motion uses the existing opacity-only Sheet fade, without spatial entry.
 */
export const motionPopoverLayer = cn(
  "duration-fast ease-motion-out",
  "data-[state=open]:animate-in data-[state=closed]:animate-out",
  "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
  "motion-reduce:data-[state=open]:animate-hh-modal-fade-in motion-reduce:data-[state=closed]:animate-hh-modal-fade-out"
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
export const hhNeoFocusRevealCommand = cn("data-[state=closed]:pointer-events-none");

/** Command palette overlay: keyboard-first, so it appears without delaying input. */
export const hhCommandOverlay = cn("hh-overlay-scrim", "data-[state=closed]:pointer-events-none");

/** Large evidence viewer: centered like a dialog, never a generic page entrance. */
export const hhNeoFocusRevealViewer = cn(
  "data-[state=open]:animate-hh-dialog-in data-[state=closed]:animate-hh-dialog-out",
  "motion-reduce:data-[state=open]:animate-hh-modal-fade-in motion-reduce:data-[state=closed]:animate-hh-modal-fade-out"
);

/** HH Neo Focus Reveal: manually mounted centered panel. */
export const hhNeoFocusRevealPanel = cn(
  "animate-hh-panel-dialog-in motion-reduce:animate-hh-modal-fade-in"
);

/** Base for data rows (group + hover + row press). */
export const motionListRow = cn("group", motionTransition, motionInteractiveHover, motionRowPress);
