import { cn } from "@/lib/utils";
import { motionInputFocus, motionListRow, motionListTableRow } from "@/lib/motion-system";

/** Clickable data row — shared list motion + focus ring. */
export const listTableRowClassName = cn(motionListTableRow, "cursor-pointer", motionInputFocus);

/** Non-clickable table row — same hover/active; `group` for row-action menus. */
export const listTableRowStaticClassName = motionListTableRow;

/** Flex / block list rows (e.g. change-order list) — same motion; no `border-0`. */
export const listFlexRowClassName = motionListRow;

/** Primary title / name column */
export const listTablePrimaryCellClassName =
  "transition-opacity duration-200 group-hover:opacity-80";

/** Currency / numeric emphasis columns (beats per-column color on hover). */
export const listTableAmountCellClassName = cn(
  "transition-colors duration-200 group-hover:!text-text-primary dark:group-hover:!text-foreground"
);

/** Row actions trigger: hidden until row hover/focus on desktop; always visible on touch (<md). */
export const listRowActionsTriggerClassName = cn(
  "h-auto w-auto min-h-0 min-w-0 shrink-0 rounded-lg p-2 text-muted-foreground",
  "opacity-0 transition-all duration-150 ease-out group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100",
  "hover:-translate-y-px hover:bg-white hover:text-foreground hover:shadow-sm active:scale-[0.97] active:duration-100 max-md:active:scale-[0.96]",
  "data-[state=open]:!opacity-100 data-[state=open]:bg-white data-[state=open]:shadow-sm dark:data-[state=open]:bg-popover"
);

export const listRowActionsContentClassName = cn(
  "min-w-[160px] rounded-md border border-gray-100 bg-white p-0 py-2 shadow-sm",
  "dark:border-border dark:bg-popover dark:text-popover-foreground"
);

export const listRowActionsItemClassName = cn(
  "cursor-pointer rounded-none px-4 py-2 text-sm",
  "focus:bg-[#F9FAFB] hover:bg-[#F9FAFB]",
  "dark:focus:bg-muted/60 dark:hover:bg-muted/60"
);

export const listRowActionsDestructiveClassName = cn(
  "text-[#DC2626] focus:text-[#DC2626] hover:bg-[#DC2626] hover:text-white dark:text-red-400 dark:focus:text-red-400"
);
