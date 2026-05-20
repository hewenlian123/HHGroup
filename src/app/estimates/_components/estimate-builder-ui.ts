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

  btnPrimary: "eb-btn-primary",
  btnGhost: "eb-btn-ghost",
  portalPrimaryButton:
    "!border-white/10 !bg-slate-950 !text-amber-100 shadow-[0_10px_24px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.06)] hover:!bg-slate-900 hover:!text-amber-50 focus-visible:!ring-amber-200/25",
  portalGhostButton:
    "!border-white/10 !bg-white/[0.035] !text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:!bg-white/[0.08] hover:!text-zinc-50 focus-visible:!ring-amber-200/25",

  pageTitle: "text-xl font-semibold tracking-tight text-zinc-50",
  pageMeta: "text-xs text-zinc-500",
  section: "pb-5 last:pb-0",
  sectionTitle: "text-sm font-semibold tracking-tight text-zinc-100",
  sectionSubtitle: "mt-0.5 text-[11px] text-zinc-500",
  scopeHeading: "text-sm font-semibold tracking-tight text-zinc-100",
  scopeSubtitle: "mt-0.5 text-[11px] text-zinc-500",
  fieldStack: "space-y-1",
  label: "sr-only",
  coreGrid: "grid grid-cols-1 gap-3 sm:grid-cols-2",
  readGrid: "grid grid-cols-2 gap-x-5 gap-y-3.5 sm:grid-cols-4",
  readRow: "space-y-0.5 min-w-0",
  readLabel: "text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-400",
  readValue: "text-sm font-medium text-zinc-100 truncate",
  readValueMuted: "text-sm text-zinc-300 truncate tabular-nums",
  input:
    "eb-input min-h-11 w-full rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-1 text-base font-normal text-zinc-100 transition-[border-color,background] duration-100 placeholder:text-zinc-600 placeholder:font-normal hover:border-white/[0.09] hover:bg-white/[0.035] focus-visible:border-white/[0.14] focus-visible:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-[0_0_0_2px_rgba(255,255,255,0.05)] disabled:cursor-not-allowed disabled:opacity-50 md:h-8 md:min-h-8 md:px-2.5 md:text-sm",
  inputMuted: "font-normal text-zinc-400 hover:text-zinc-200 focus-visible:text-zinc-50",
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
  lineTotal: "text-sm font-medium tabular-nums text-zinc-200",
  scopeBlock: "mb-2 last:mb-0",
  scopeBlockHeader:
    "eb-scope-section-header flex items-baseline justify-between gap-x-4 gap-y-1 border-b border-white/[0.08] pb-2 pt-0",
  addSectionComposer: "eb-add-section-composer",
  scopeBlockTitle: "text-[15px] font-semibold tracking-tight text-zinc-100",
  scopeBlockTotal: "text-sm font-semibold tabular-nums tracking-tight text-zinc-200",
  composerAddSection:
    "eb-add-section inline-flex min-h-11 items-center gap-1.5 px-3 text-xs font-medium md:h-8 md:min-h-8",
  commandMenu: "z-[100] max-h-64 overflow-y-auto rounded-xl border py-1 eb-glass-command",
  commandMenuItem:
    "mx-1 cursor-pointer rounded-lg px-2.5 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/[0.08]",
  commandMenuItemActive: "bg-white/[0.08] text-zinc-50",
  addLineLink:
    "inline-flex h-8 items-center gap-1 px-2 text-xs font-medium text-zinc-400 transition-colors eb-gold-link max-md:min-h-11",
  categoryGroup: "mb-3 last:mb-0",
  categorySectionTotal: "text-xs font-normal tabular-nums text-zinc-400",
  backLink:
    "inline-flex min-h-11 items-center gap-1 text-sm text-zinc-400 transition-colors hover:text-zinc-200",
  summaryInternalLabel: "text-[10px] font-medium uppercase tracking-[0.1em] text-zinc-500",
  summaryLineLabel: "text-xs text-zinc-500",
  summaryLineValue: "text-xs tabular-nums text-zinc-300",
  summaryLineValueMuted: "text-xs tabular-nums text-zinc-600",
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
