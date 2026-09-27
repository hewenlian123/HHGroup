export const TYPO = {
  pageTitle: "text-hh-page-title text-[var(--hh-text-primary)]",
  pageSubtitle: "text-hh-body text-[var(--hh-text-secondary)]",
  sectionTitle: "text-hh-section-title text-[var(--hh-text-primary)]",
  panelTitle: "text-hh-panel-title text-[var(--hh-text-primary)]",
  body: "text-hh-body text-[var(--hh-text-primary)]",
  bodyStrong: "text-hh-body-strong text-[var(--hh-text-primary)]",
  label: "text-hh-label text-[var(--hh-text-secondary)]",
  metadata: "text-hh-metadata text-[var(--hh-text-secondary)]",
  helper: "text-hh-helper text-[var(--hh-text-secondary)]",
  error: "text-hh-error text-[var(--hh-danger)]",
  sectionLabel: "text-hh-label uppercase text-[var(--hh-text-tertiary)]",
  kpiValue: "hh-fin text-hh-financial text-[var(--hh-text-primary)]",
  kpiTotal: "hh-fin text-hh-financial-total text-[var(--hh-text-primary)]",
  kpiSubtitle: "text-hh-metadata text-[var(--hh-text-secondary)]",
  kpiLabel: "text-hh-label uppercase text-[var(--hh-text-tertiary)]",
  tableHeader: "text-hh-table-header uppercase text-[var(--hh-text-tertiary)]",
  tableCell: "text-hh-table-cell text-[var(--hh-text-primary)]",
  primaryName: "text-hh-body-strong text-[var(--hh-text-primary)]",
  secondaryId: "hh-fin text-hh-metadata text-[var(--hh-text-tertiary)]",
  amount: "hh-fin text-hh-financial text-[var(--hh-text-primary)]",
  date: "hh-fin text-hh-metadata text-[var(--hh-text-secondary)]",
  chip: "text-hh-status",
  button: "text-hh-control",
  mutedText: "text-hh-body text-[var(--hh-text-secondary)]",
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
    "rounded-hh-panel border border-[var(--hh-border)] bg-[var(--hh-l1-workspace)] text-[var(--hh-text-primary)] shadow-none",
  surfaceMuted:
    "rounded-hh-panel border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-primary)]",
  buttonPrimary:
    "border-[var(--hh-action-primary)] bg-[var(--hh-action-primary)] text-[var(--hh-action-primary-foreground)] hover:border-[var(--hh-action-primary-hover)] hover:bg-[var(--hh-action-primary-hover)] active:border-[var(--hh-action-primary-hover)] active:bg-[var(--hh-action-primary-hover)]",
  buttonSecondary:
    "border-[var(--hh-input)] bg-[var(--hh-l1-workspace)] text-[var(--hh-text-primary)] hover:border-[var(--hh-border-emphasis)] hover:bg-[var(--hh-l3-hover)] active:bg-[var(--hh-l3-pressed)]",
  buttonGhost:
    "border-0 bg-transparent text-[var(--hh-text-secondary)] hover:bg-[var(--hh-l3-hover)] hover:text-[var(--hh-text-primary)] active:bg-[var(--hh-l3-pressed)]",
  focusRing: "hh-focus-ring",
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
    "transition-[border-color,box-shadow] duration-200 ease-out hover:border-[var(--hh-border-strong)] hover:shadow-operational",
  iconWell:
    "rounded-hh-compact border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] p-hh-2 text-[var(--hh-text-secondary)]",
  tableShell: `relative w-full overflow-hidden ${NEO.surface}`,
  tableDivider: "border-[var(--hh-border)]",
  filterSurface: NEO.surface,
  emptyState:
    "rounded-hh-standard border border-dashed border-[var(--hh-border-strong)] bg-[var(--hh-l2-operational-surface)] px-hh-5 py-12 text-center shadow-operational",
  primaryButton: NEO.buttonPrimary,
  secondaryButton: NEO.buttonSecondary,
  emeraldAccent: "text-[var(--hh-success)]",
  dangerAmount: "text-[var(--hh-danger)]",
  neutralAmount: "text-[var(--hh-text-primary)]",
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
  muted: "text-[var(--hh-text-secondary)]",
  income: OS.neutralAmount,
  expense: OS.neutralAmount,
  danger: "text-[var(--hh-danger)]",
};

export function amountClass(tone: AmountTone = "neutral"): string {
  return `${TYPO.amount} ${AMOUNT_TONE_CLASS[tone] ?? AMOUNT_TONE_CLASS.neutral}`;
}
