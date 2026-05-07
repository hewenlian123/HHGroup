export const TYPO = {
  /** 1. Page title */
  pageTitle:
    "text-[34px] leading-tight font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 md:text-[36px]",

  /** 2. Page subtitle */
  pageSubtitle: "text-[15px] leading-relaxed text-zinc-500 dark:text-zinc-400",

  /** 3. Section label */
  sectionLabel:
    "text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400 dark:text-zinc-500",

  /** 4. KPI value */
  kpiValue: "tabular-nums tracking-tight font-semibold text-zinc-950 dark:text-zinc-50",

  /** 5. KPI subtitle */
  kpiSubtitle: "text-[13px] font-medium text-zinc-500 dark:text-zinc-400",

  /** 5a. KPI label */
  kpiLabel: "text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400",

  /** 6. Table headers */
  tableHeader:
    "text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500",

  /** 7. Primary names */
  primaryName: "text-[15px] font-medium tracking-[-0.01em] text-zinc-900 dark:text-zinc-100",

  /** 8. Secondary IDs */
  secondaryId: "font-mono text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500",

  /** 9. Financial amounts */
  amount: "tabular-nums tracking-tight font-semibold text-zinc-950 dark:text-zinc-50",

  /** 10. Dates */
  date: "font-mono text-[13px] tabular-nums tracking-tight text-zinc-500 dark:text-zinc-400",

  /** 11. Status chips */
  chip: "text-[12px] font-medium tracking-tight",

  /** 12. Buttons */
  button: "text-[14px] font-medium tracking-tight",

  /** 13. Muted body copy */
  mutedText: "text-sm leading-relaxed text-zinc-500 dark:text-zinc-400",
} as const;

export const OS = {
  workspace: "bg-slate-50 dark:bg-background",
  card: "rounded-xl border border-slate-900/[0.06] bg-white/[0.92] shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-border/60 dark:bg-card/90 dark:shadow-none",
  tableShell:
    "relative w-full overflow-hidden rounded-xl border border-slate-900/[0.06] bg-white/[0.92] shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-border/60 dark:bg-card/90",
  tableDivider: "border-slate-900/[0.06] dark:border-border/60",
  filterSurface:
    "rounded-xl border border-slate-900/[0.06] bg-white/[0.92] shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-border/60 dark:bg-card/90",
  primaryButton:
    "bg-[#081225] text-white hover:bg-[#0F172A] focus-visible:ring-emerald-500/30 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400",
  secondaryButton:
    "border border-slate-900/[0.08] bg-white text-zinc-900 hover:bg-slate-50 dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted/45",
  emeraldAccent: "text-emerald-700 dark:text-emerald-400",
  dangerAmount: "text-rose-600 dark:text-rose-400",
  neutralAmount: "text-zinc-950 dark:text-zinc-50",
} as const;

export type StatusTone = "success" | "warning" | "danger" | "neutral" | "info";

export const STATUS_CHIP_CLASS: Record<StatusTone, string> = {
  success: "hh-pill-success",
  warning: "hh-pill-warning",
  danger: "hh-pill-danger",
  neutral: "hh-pill-neutral",
  info: "hh-pill-info",
};

export function statusChipClass(tone: StatusTone = "neutral"): string {
  return STATUS_CHIP_CLASS[tone] ?? STATUS_CHIP_CLASS.neutral;
}

export type AmountTone = "neutral" | "income" | "expense" | "danger";

export const AMOUNT_TONE_CLASS: Record<AmountTone, string> = {
  neutral: OS.neutralAmount,
  income: "text-emerald-700 dark:text-emerald-400",
  expense: OS.dangerAmount,
  danger: OS.dangerAmount,
};

export function amountClass(tone: AmountTone = "neutral"): string {
  return `${TYPO.amount} ${AMOUNT_TONE_CLASS[tone] ?? AMOUNT_TONE_CLASS.neutral}`;
}
