import { cn } from "@/lib/utils";
import { motionInputFocus, motionListRow, motionListTableRow } from "@/lib/motion-system";

/** Clickable data row — shared list motion + focus ring. */
export const listTableRowClassName = cn(
  motionListTableRow,
  "cursor-pointer active:bg-[var(--hh-l3-pressed)]",
  motionInputFocus
);

/** Non-clickable table row — same hover/active; `group` for row-action menus. */
export const listTableRowStaticClassName = cn(
  motionListTableRow,
  "active:bg-[var(--hh-l3-pressed)]"
);

/** Flex / block list rows (e.g. change-order list) — same motion; no `border-0`. */
export const listFlexRowClassName = cn(motionListRow, "active:bg-[var(--hh-l3-pressed)]");

/** Primary title / name column */
export const listTablePrimaryCellClassName =
  "transition-opacity duration-200 group-hover:opacity-80";

/** Currency / numeric emphasis columns (beats per-column color on hover). */
export const listTableAmountCellClassName = cn(
  "tabular-nums tracking-normal font-semibold transition-colors duration-200 group-hover:!text-[var(--neo-text-primary)]"
);

/** Row actions trigger: hidden until row hover/focus on desktop; always visible on touch (<md). */
export const listRowActionsTriggerClassName = cn(
  "hh-touch-square h-auto w-auto min-h-0 min-w-0 shrink-0 rounded-hh-standard p-hh-2 text-[var(--neo-text-secondary)]",
  "opacity-0 transition-all duration-150 ease-out group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100",
  "hover:-translate-y-px hover:bg-[var(--hh-l3-hover)] hover:text-[var(--neo-text-primary)] hover:shadow-sm active:scale-[0.97] active:bg-[var(--hh-l3-pressed)] active:duration-100 max-md:active:scale-[0.96]",
  "data-[state=open]:!opacity-100 data-[state=open]:bg-[var(--hh-l3-selected)] data-[state=open]:shadow-sm"
);

export const listRowActionsContentClassName = cn(
  "min-w-[160px] rounded-hh-standard border border-[var(--hh-border-floating)] bg-[var(--hh-l4-floating-surface)] p-0 py-hh-2 text-[var(--neo-text-primary)] shadow-floating"
);

export const listRowActionsItemClassName = cn(
  "hh-touch-row min-h-hh-row-dense cursor-pointer rounded-hh-compact px-hh-4 py-hh-2 text-sm",
  "focus:bg-[var(--hh-l3-hover)] hover:bg-[var(--hh-l3-hover)] active:bg-[var(--hh-l3-pressed)]"
);

export const listRowActionsDestructiveClassName = cn(
  "text-rose-600 focus:text-rose-600 hover:bg-rose-600 hover:text-white dark:text-rose-400 dark:focus:text-rose-400"
);
