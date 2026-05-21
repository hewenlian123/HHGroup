import { cn } from "@/lib/utils";

/** Estimate Builder — dark glass tokens (see estimate-builder-glass.css). */
export const EB = {
  shell: "estimate-builder",
  glassPanel: "eb-glass-panel",
  glassPanelCustomer: "eb-glass-panel eb-glass-panel-customer",
  dateField: "eb-date-field",
  glassScope: "eb-glass-scope",
  glassSidebar: "eb-glass-sidebar",
  glassSidebarFloat: "eb-glass-sidebar eb-glass-sidebar-float",
  glassMobileBar: "eb-glass-mobile-bar",
  glassHeader: "eb-glass-header",
  glassCommand: "eb-glass-command",
  glassNotes: "eb-glass-notes",
  scopeTableWrap: "eb-scope-table-wrap",
  goldTotal: "eb-gold-total",
  goldLink: "eb-gold-link",
  goldAccent: "eb-gold-accent",
  tabularNums: "tabular-nums [font-feature-settings:'tnum']",

  btnPrimary: "eb-btn-primary",
  btnGhost: "eb-btn-ghost",
  btnText: "eb-btn-text",
  actionSecondary: "eb-action-secondary",
  paymentSchedule: "eb-payment-schedule",
  paymentScheduleNested: "eb-payment-schedule-nested",
  paymentHeaderDuplicate: "eb-payment-header-duplicate",
  paymentEmptyBox: "eb-payment-empty-box",
  paymentEmpty: "eb-payment-empty",
  paymentEmptyIcon: "eb-payment-empty-icon",
  sectionHeaderIcon: "eb-section-header-chip-icon",
  sectionHeaderChip: "eb-section-header-chip",
  lineItemCard: "eb-line-item-card",
  iconAction: "eb-icon-action",
  portalPrimaryButton:
    "!border-white/10 !bg-slate-950 !text-amber-100 shadow-[0_10px_24px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.06)] hover:!bg-slate-900 hover:!text-amber-50 focus-visible:!ring-amber-200/25",
  portalGhostButton:
    "!border-white/10 !bg-white/[0.035] !text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:!bg-white/[0.08] hover:!text-zinc-50 focus-visible:!ring-amber-200/25",

  pageTitle: "text-xl font-semibold tracking-tight text-slate-50",
  pageMeta: "text-xs text-slate-400",
  section: "pb-5 last:pb-0",
  sectionTitle: "text-sm font-semibold tracking-tight text-slate-100",
  sectionSubtitle: "mt-0.5 text-[11px] text-slate-400",
  scopeHeading: "text-sm font-semibold tracking-tight text-slate-50",
  scopeSubtitle: "mt-0.5 text-[11px] text-slate-400",
  scopeEmpty: "eb-scope-empty",
  scopeEmptyMessage: "eb-scope-empty-message",
  fieldStack: "space-y-1",
  label: "sr-only",
  coreGrid: "grid grid-cols-1 gap-3 sm:grid-cols-2",
  readGrid: "grid grid-cols-2 gap-x-5 gap-y-3.5 sm:grid-cols-4",
  readRow: "space-y-0.5 min-w-0",
  readLabel: "text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400",
  readValue: "text-sm font-medium text-slate-100 truncate",
  readValueMuted: "text-sm text-slate-300 truncate tabular-nums [font-feature-settings:'tnum']",
  readDash: "text-sm text-slate-500",
  input:
    "eb-input min-h-11 w-full rounded-md px-3 py-1 text-base font-normal text-slate-50 transition-[border-color,background,box-shadow] duration-150 placeholder:text-slate-500 placeholder:font-normal focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 md:h-8 md:min-h-8 md:px-2.5 md:text-sm",
  inputMuted: "font-normal text-slate-200",
  inputNumeric: "text-right tabular-nums",
  lineTableHead:
    "border-b border-white/[0.06] pb-2 text-[10px] font-medium uppercase tracking-[0.07em] text-zinc-400",
  /** Lighter pricing strip below proposal scope cards */
  pricingSection: "mt-5 border-t border-white/[0.06] pt-3",
  pricingTableHead:
    "border-b border-white/[0.05] pb-2 text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500",
  pricingTableRow:
    "border-b border-white/[0.035] transition-colors duration-150 last:border-0 hover:bg-white/[0.02]",
  lineTableRow:
    "eb-line-row border-b border-white/[0.04] transition-colors duration-150 group/line last:border-0",
  lineRowActions:
    "opacity-0 group-hover/line:opacity-100 transition-opacity duration-150 max-md:opacity-100",
  lineDetailsLink:
    "inline-flex min-h-11 items-center px-2 text-[11px] opacity-0 transition-[opacity,color] duration-150 group-hover/line:opacity-100 focus-visible:opacity-100 focus-visible:outline-none md:min-h-0 md:px-0 max-md:opacity-100 eb-gold-link",
  lineTotal: "text-sm font-medium tabular-nums text-zinc-100 [font-feature-settings:'tnum']",
  scopeBlock: "mb-2 last:mb-0",
  scopeBlockHeader:
    "eb-scope-section-header flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-white/[0.06] pb-2.5 pt-0",
  addSectionComposer: "eb-add-section-composer",
  scopeBlockTitle: "text-[15px] font-semibold tracking-tight text-zinc-50",
  scopeBlockTotal:
    "text-sm font-semibold tabular-nums tracking-tight text-zinc-100 [font-feature-settings:'tnum']",
  composerAddSection:
    "eb-add-section eb-action-secondary inline-flex min-h-11 items-center gap-1.5 px-2.5 text-xs font-medium md:h-8 md:min-h-8",
  commandMenu: "z-[100] max-h-64 overflow-y-auto rounded-xl border py-1 eb-glass-command",
  commandMenuItem:
    "mx-1 cursor-pointer rounded-lg px-2.5 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/[0.08]",
  commandMenuItemActive: "bg-white/[0.08] text-zinc-50",
  addLineLink:
    "eb-add-line inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-zinc-400 transition-[color,background] duration-150 hover:bg-white/[0.04] hover:text-zinc-200 max-md:min-h-11 md:min-h-8",
  lineIndexBadge:
    "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded px-1 text-[10px] font-medium tabular-nums text-zinc-500 [font-feature-settings:'tnum']",
  paymentTitle: "text-sm font-medium text-slate-100",
  paymentSubtitle: "mt-0.5 text-[11px] text-slate-300",
  paymentStatLabel: "text-xs text-slate-300",
  paymentStatValue: "font-semibold tabular-nums text-slate-100 [font-feature-settings:'tnum']",
  categoryGroup: "mb-3 last:mb-0",
  categorySectionTotal: "text-xs font-normal tabular-nums text-zinc-400",
  backLink:
    "inline-flex min-h-11 items-center gap-1 text-sm text-slate-400 transition-colors duration-150 hover:text-slate-200",
  summaryInternalLabel: "text-[10px] font-medium uppercase tracking-[0.1em] text-zinc-400",
  summaryLineLabel: "text-xs text-zinc-500",
  summaryLineValue: "text-xs tabular-nums text-zinc-200 [font-feature-settings:'tnum']",
  summaryLineValueMuted: "text-xs tabular-nums text-zinc-500 [font-feature-settings:'tnum']",
  draftPanel: "eb-draft-panel",
} as const;

export function ebInput(className?: string): string {
  return cn(EB.input, className);
}

export function ebGlassPanel(className?: string): string {
  return cn(EB.glassPanel, "rounded-lg p-3 sm:p-4", className);
}

export function ebGlassCustomerPanel(className?: string): string {
  return cn(EB.glassPanelCustomer, "rounded-lg p-3 sm:p-4", className);
}

export function ebGlassScope(className?: string): string {
  return cn(EB.glassScope, "rounded-md", className);
}
