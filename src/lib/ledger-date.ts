import { formatDate } from "@/lib/formatters";

export type LedgerDateDensity = "compact" | "table";

/**
 * Display-only date formatting for Finance/Labor ledger rows.
 * Does NOT change parsing, sorting, filters, or backend — it only remaps the display string.
 */
export function formatLedgerDate(
  value: string | Date | null | undefined,
  density: LedgerDateDensity = "table"
): string {
  if (density === "compact") return formatDate(value, "compact"); // e.g. "May 7"
  // e.g. "May 07, 2026" -> "May 07 · 2026"
  return formatDate(value, "table").replace(", ", " · ");
}

export const LEDGER_DATE_CLASS =
  'font-sans text-[13px] font-medium tracking-tight tabular-nums text-zinc-500 dark:text-zinc-400 [font-feature-settings:"zero"_0]';
