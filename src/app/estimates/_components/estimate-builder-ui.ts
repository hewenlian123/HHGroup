import { cn } from "@/lib/utils";

/** Shared Estimate Builder surface tokens (Stripe / Linear / Notion). */
export const EB = {
  pageTitle: "text-2xl font-semibold tracking-tight text-foreground",
  pageMeta: "text-xs text-muted-foreground/50",
  section: "border-b border-border/15 pb-10 last:border-0",
  sectionTitle: "text-lg font-semibold tracking-tight text-foreground",
  sectionSubtitle: "mt-0.5 text-xs text-muted-foreground/50",
  scopeHeading: "text-base font-semibold tracking-tight text-foreground",
  scopeSubtitle: "mt-0.5 text-[11px] text-muted-foreground/45",
  fieldStack: "space-y-1",
  label: "sr-only",
  coreGrid: "grid grid-cols-1 gap-4 sm:grid-cols-2",
  readGrid: "grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4",
  readRow: "space-y-0.5 min-w-0",
  readLabel: "text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground/45",
  readValue: "text-sm font-medium text-foreground truncate",
  readValueMuted: "text-sm text-muted-foreground/70 truncate tabular-nums",
  input:
    "h-7 rounded-[3px] border-0 border-b border-transparent bg-transparent px-0.5 py-0.5 text-sm font-medium text-foreground shadow-none transition-[color,border-color] placeholder:text-muted-foreground/35 placeholder:font-normal hover:border-border/30 focus-visible:border-border/50 focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 max-md:min-h-[44px] max-md:px-2 max-md:text-base md:min-h-7",
  inputMuted:
    "font-normal text-muted-foreground/75 hover:text-foreground/90 focus-visible:text-foreground",
  inputNumeric: "text-right tabular-nums",
  lineTableHead:
    "border-b border-border/10 pb-2 text-[10px] font-normal tracking-wide text-muted-foreground/45",
  lineTableRow:
    "border-b border-border/[0.07] transition-colors group/line hover:bg-muted/[0.025] last:border-0",
  lineRowActions: "opacity-0 group-hover/line:opacity-100 transition-opacity duration-150",
  lineDetailsLink:
    "text-[11px] text-muted-foreground/30 opacity-0 transition-opacity duration-150 group-hover/line:opacity-100 hover:text-muted-foreground/55 focus-visible:opacity-100 focus-visible:outline-none",
  lineTotal: "text-sm font-medium tabular-nums text-muted-foreground/80",
  scopeBlock: "mb-8 last:mb-0",
  scopeBlockHeader:
    "flex list-none cursor-pointer items-center justify-between gap-3 border-b border-border/10 py-2.5 hover:bg-transparent",
  scopeBlockTitle: "text-[15px] font-semibold tracking-tight text-foreground",
  scopeBlockTotal: "text-xs font-normal tabular-nums text-muted-foreground/45",
  composerAddSection:
    "inline-flex h-7 items-center gap-1 rounded-[3px] px-2 text-xs font-medium text-muted-foreground/70 transition-colors hover:bg-muted/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
  commandMenu:
    "z-[100] overflow-y-auto rounded-md border border-border/15 bg-popover py-1 shadow-[var(--shadow-popover)]",
  commandMenuItem:
    "mx-1 cursor-pointer rounded-[3px] px-2.5 py-1.5 text-sm text-foreground/90 hover:bg-muted/50",
  commandMenuItemActive: "bg-muted/55 text-foreground",
  addLineLink:
    "inline-flex h-7 items-center gap-1 px-1 text-xs text-muted-foreground/45 transition-colors hover:text-foreground",
  /** @deprecated alias — use scopeBlock */
  categoryGroup: "mb-8 last:mb-0",
  categorySectionTotal: "text-xs font-normal tabular-nums text-muted-foreground/45",
} as const;

export function ebInput(className?: string): string {
  return cn(EB.input, className);
}
