import { cn } from "@/lib/utils";

/**
 * Global interaction contract (buttons, rows, overlays, fields).
 * Prefer these tokens over one-off durations or hex hovers.
 * Inline loading: `InlineLoading` from `@/components/ui/skeleton` (no spinners in UI).
 */

/** App-wide default easing + duration (Linear / iOS-like). */
export const motionTransition = "transition-all duration-150 ease-out";

/** Hover on buttons, links, list tiles (not heavy cards). */
export const motionInteractiveHover = cn(
  "hover:-translate-y-px hover:bg-gray-50 dark:hover:bg-muted/40"
);

/** Press feedback for clickable controls (desktop + mobile scale). */
export const motionClickableActive = cn(
  "active:scale-[0.97] active:duration-100 max-md:active:scale-[0.96]"
);

/** Dense icon-only controls (toolbar, ghost icons). */
export const motionIconButtonHover = "hover:bg-gray-100 dark:hover:bg-muted/50";

export const motionIconButtonActive = "active:scale-[0.95] active:duration-100";

/** Table / dense list rows — subtler press than full click targets. */
export const motionRowPress = "active:scale-[0.99] active:duration-100";

/** Data table rows — no vertical nudge; Linear-style flat hover. */
export const motionListTableRow = cn(
  "group",
  motionTransition,
  "hover:bg-gray-50 dark:hover:bg-muted/30",
  motionRowPress
);

/** Form controls — ring only, no layout jump. */
export const motionInputFocus = cn(
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/30 focus-visible:ring-offset-0"
);

/** Optional: bordered cards / image tiles that should feel “lifted”. */
export const motionCardHover = cn(motionTransition, "hover:scale-[1.02] hover:shadow-md");

/**
 * Shared popover / menu surface: fade + zoom (matches dropdown spec).
 * Pair with slide-in-from-* from Radix side if needed.
 */
export const motionPopoverLayer = cn(
  "duration-150 ease-out",
  "data-[state=open]:animate-in data-[state=closed]:animate-out",
  "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
  "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
);

/** Base for data rows (group + hover + row press). */
export const motionListRow = cn("group", motionTransition, motionInteractiveHover, motionRowPress);
