import { cn } from "@/lib/utils";

/** Shared Estimate Builder surface tokens (Linear / Stripe weight). */
export const EB = {
  section: "border-b border-border/40 pb-7",
  sectionTitle: "text-sm font-semibold tracking-tight text-foreground",
  sectionSubtitle: "text-sm text-muted-foreground/80 truncate",
  fieldStack: "space-y-1",
  label: "text-[11px] font-medium text-muted-foreground/80",
  coreGrid: "grid grid-cols-1 gap-3 sm:grid-cols-2",
  readGrid: "grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4",
  readRow: "space-y-0.5 min-w-0",
  readLabel: "text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground/65",
  readValue: "text-sm font-medium text-foreground truncate",
  readValueMuted: "text-sm text-muted-foreground/90 truncate tabular-nums",
  input:
    "h-8 rounded-sm border-border/35 bg-transparent px-2.5 py-1 text-sm shadow-none transition-colors placeholder:text-muted-foreground/50 hover:border-border/55 focus-visible:border-foreground/20 focus-visible:bg-background focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 max-md:min-h-[44px] max-md:text-base md:min-h-8",
  inputNumeric: "text-right tabular-nums",
  lineTableHead: "border-b border-border/25 text-[11px] font-medium text-muted-foreground/70",
  lineTableRow: "border-b border-border/20 transition-colors hover:bg-muted/[0.03] last:border-0",
  lineTotal: "text-sm font-medium tabular-nums text-muted-foreground",
} as const;

export function ebInput(className?: string): string {
  return cn(EB.input, className);
}
