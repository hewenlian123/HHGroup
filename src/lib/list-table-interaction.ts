import { cn } from "@/lib/utils";

/** Unified list/table row: hover lift + warm bg (Linear-style). */
export const listTableRowClassName = cn(
  "group cursor-pointer rounded-xl border-b-0 transition-all duration-200 ease-out",
  "hover:-translate-y-px hover:bg-[#F7F7F5] hover:shadow-[0_2px_8px_rgba(0,0,0,0.03)]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite/10 dark:focus-visible:ring-border/60",
  "dark:hover:bg-muted/40"
);

/** Primary title / name column */
export const listTablePrimaryCellClassName =
  "transition-opacity duration-200 group-hover:opacity-80";

/** Currency / numeric emphasis columns (beats per-column color on hover). */
export const listTableAmountCellClassName = cn(
  "transition-colors duration-200 group-hover:!text-[#2D2D2D] dark:group-hover:!text-foreground"
);

/** Row actions trigger: always visible (keyboard, screen readers, E2E); hover still styles the control. */
export const listRowActionsTriggerClassName = cn(
  "h-auto w-auto min-h-0 min-w-0 shrink-0 p-2 rounded-lg text-muted-foreground",
  "opacity-100 transition-opacity duration-200",
  "hover:bg-white hover:text-foreground hover:shadow-sm",
  "data-[state=open]:opacity-100 data-[state=open]:bg-white data-[state=open]:shadow-sm dark:data-[state=open]:bg-popover"
);

export const listRowActionsContentClassName = cn(
  "min-w-[160px] border border-[#EBEBE9] bg-white p-0 py-2 shadow-lg rounded-xl",
  "dark:border-border dark:bg-popover dark:text-popover-foreground"
);

export const listRowActionsItemClassName = cn(
  "cursor-pointer rounded-none px-4 py-2 text-sm",
  "focus:bg-[#F7F7F5] hover:bg-[#F7F7F5]",
  "dark:focus:bg-muted/60 dark:hover:bg-muted/60"
);

export const listRowActionsDestructiveClassName = cn(
  "text-red-500 focus:text-red-500 dark:text-red-400 dark:focus:text-red-400"
);
