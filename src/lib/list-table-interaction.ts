import { cn } from "@/lib/utils";

/** Clickable data row — Airtable-style flat hover (no lift). */
export const listTableRowClassName = cn(
  "group cursor-pointer border-0 transition-colors duration-150",
  "hover:bg-[#F5F7FA]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111827]/10 dark:focus-visible:ring-border/60",
  "dark:hover:bg-muted/40"
);

/** Primary title / name column */
export const listTablePrimaryCellClassName =
  "transition-opacity duration-200 group-hover:opacity-80";

/** Currency / numeric emphasis columns (beats per-column color on hover). */
export const listTableAmountCellClassName = cn(
  "transition-colors duration-200 group-hover:!text-text-primary dark:group-hover:!text-foreground"
);

/** Row actions trigger: always visible (keyboard, screen readers, E2E); hover still styles the control. */
export const listRowActionsTriggerClassName = cn(
  "h-auto w-auto min-h-0 min-w-0 shrink-0 p-2 rounded-lg text-muted-foreground",
  "opacity-100 transition-opacity duration-200",
  "hover:bg-white hover:text-foreground hover:shadow-sm",
  "data-[state=open]:opacity-100 data-[state=open]:bg-white data-[state=open]:shadow-sm dark:data-[state=open]:bg-popover"
);

export const listRowActionsContentClassName = cn(
  "min-w-[160px] border-[0.5px] border-gray-300 bg-white p-0 py-2 shadow-lg rounded-card",
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
