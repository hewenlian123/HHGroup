export const TYPO = {
  /** 1. Page title */
  pageTitle:
    "text-[34px] leading-tight font-semibold tracking-normal text-zinc-950 dark:text-zinc-50 md:text-[36px]",

  /** 2. Page subtitle */
  pageSubtitle: "text-[15px] leading-relaxed text-zinc-500 dark:text-zinc-400",

  /** 3. Section label */
  sectionLabel:
    "text-[11px] font-medium uppercase tracking-normal text-zinc-400 dark:text-zinc-500",

  /** 4. KPI value */
  kpiValue: "tabular-nums tracking-normal font-semibold text-zinc-950 dark:text-zinc-50",

  /** 5. KPI subtitle */
  kpiSubtitle: "text-[13px] font-medium text-zinc-500 dark:text-zinc-400",

  /** 5a. KPI label */
  kpiLabel: "text-[11px] font-medium uppercase tracking-normal text-zinc-500 dark:text-zinc-400",

  /** 6. Table headers */
  tableHeader: "text-[11px] font-medium uppercase tracking-normal text-zinc-400 dark:text-zinc-500",

  /** 7. Primary names */
  primaryName: "text-[15px] font-medium tracking-normal text-zinc-900 dark:text-zinc-100",

  /** 8. Secondary IDs */
  secondaryId: "font-mono text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500",

  /** 9. Financial amounts */
  amount: "tabular-nums tracking-normal font-semibold text-zinc-950 dark:text-zinc-50",

  /** 10. Dates */
  date: "font-mono text-[13px] tabular-nums tracking-normal text-zinc-500 dark:text-zinc-400",

  /** 11. Status chips */
  chip: "text-[12px] font-medium tracking-normal",

  /** 12. Buttons */
  button: "text-[14px] font-medium tracking-normal",

  /** 13. Muted body copy */
  mutedText: "text-sm leading-relaxed text-zinc-500 dark:text-zinc-400",
} as const;

export const NEO = {
  workspace: "neo-workspace-canvas",
  appShell: "neo-app-shell",
  commandBar: "neo-command-bar",
  sidebar: "neo-sidebar",
  panel: "neo-panel",
  toolbar: "neo-toolbar",
  input: "neo-input",
  amount: "neo-amount",
  surface:
    "rounded-xl border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-[var(--neo-text-primary)] shadow-[var(--neo-shadow-panel)]",
  surfaceMuted:
    "rounded-lg border border-[var(--neo-border)] bg-[var(--neo-surface-muted)] text-[var(--neo-text-primary)]",
  buttonPrimary:
    "border-transparent bg-[var(--neo-graphite-950)] text-white hover:bg-[var(--neo-graphite-800)] focus-visible:ring-[var(--neo-gold-ring)] dark:bg-[var(--neo-gold)] dark:text-zinc-950 dark:hover:bg-[var(--neo-gold-soft)]",
  buttonSecondary:
    "border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-[var(--neo-text-primary)] hover:bg-[var(--neo-surface-muted)] dark:border-[var(--neo-border)] dark:bg-[var(--neo-surface-raised)] dark:text-[var(--neo-text-primary)] dark:hover:bg-[var(--neo-surface-muted)]",
  buttonGhost:
    "border-0 bg-transparent text-[var(--neo-text-secondary)] hover:bg-[var(--neo-surface-muted)] hover:text-[var(--neo-text-primary)]",
  focusRing:
    "focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)] focus-visible:ring-offset-0",
  status: {
    success: "hh-pill-success",
    warning: "hh-pill-warning",
    danger: "hh-pill-danger",
    neutral: "hh-pill-neutral",
    info: "hh-pill-info",
  },
} as const;

export const OS = {
  workspace: NEO.workspace,
  card: NEO.surface,
  cardHover:
    "transition-[border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-px hover:border-[var(--neo-border-strong)] hover:shadow-[0_18px_44px_rgba(17,19,21,0.08)]",
  iconWell:
    "rounded-md border border-[var(--neo-border)] bg-[var(--neo-surface-muted)] p-2 text-[var(--neo-text-secondary)]",
  tableShell: `relative w-full overflow-hidden ${NEO.surface}`,
  tableDivider: "border-[var(--neo-border)]",
  filterSurface: NEO.surface,
  emptyState:
    "rounded-xl border border-dashed border-[var(--neo-border-strong)] bg-[var(--neo-surface-muted)] px-5 py-12 text-center",
  primaryButton: NEO.buttonPrimary,
  secondaryButton: NEO.buttonSecondary,
  emeraldAccent: "text-emerald-700 dark:text-emerald-400",
  dangerAmount: "text-rose-600 dark:text-rose-400",
  neutralAmount: "text-[var(--neo-text-primary)]",
} as const;

export type StatusTone = "success" | "warning" | "danger" | "neutral" | "info";

export const STATUS_CHIP_CLASS: Record<StatusTone, string> = {
  success: NEO.status.success,
  warning: NEO.status.warning,
  danger: NEO.status.danger,
  neutral: NEO.status.neutral,
  info: NEO.status.info,
};

export function statusChipClass(tone: StatusTone = "neutral"): string {
  return STATUS_CHIP_CLASS[tone] ?? STATUS_CHIP_CLASS.neutral;
}

export type AmountTone = "neutral" | "muted" | "income" | "expense" | "danger";

export const AMOUNT_TONE_CLASS: Record<AmountTone, string> = {
  neutral: OS.neutralAmount,
  muted: "text-[var(--neo-text-secondary)]",
  income: "text-emerald-700 dark:text-emerald-400",
  expense: OS.dangerAmount,
  danger: OS.dangerAmount,
};

export function amountClass(tone: AmountTone = "neutral"): string {
  return `${TYPO.amount} ${AMOUNT_TONE_CLASS[tone] ?? AMOUNT_TONE_CLASS.neutral}`;
}
