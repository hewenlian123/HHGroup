import { cn } from "@/lib/utils";

/** Estimate Builder — Warm Graphite Premium tokens (see estimate-builder-glass.css). */
export const EB = {
  shell: "estimate-builder",
  shellNew: "estimate-builder estimate-builder-new",
  glassPanel: "eb-glass-panel",
  glassPanelCustomer: "eb-glass-panel eb-glass-panel-customer",
  dateField: "eb-date-field",
  glassScope: "eb-glass-scope",
  glassSidebar: "eb-glass-sidebar",
  glassSidebarFloat: "eb-glass-sidebar eb-glass-sidebar-float",
  overviewStickyAside: "eb-estimate-overview-sticky",
  overviewStickyFloating: "is-floating",
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
  lineItemDragRow: "eb-line-item-drag-row",
  lineItemFirstRow: "eb-line-item-first-row",
  lineItemFirstRowPricing: "eb-line-item-first-row eb-line-item-first-row--pricing",
  lineItemGrid: "eb-line-item-grid",
  lineItemGridPricing: "eb-line-item-grid eb-line-item-grid--pricing",
  lineItemGridSimple: "eb-line-item-grid eb-line-item-grid--simple",
  lineItemTitleField: "eb-line-item-title-field",
  lineItemPricingWrap: "eb-line-item-pricing-wrap",
  lineFieldStack: "flex min-w-0 flex-col gap-1",
  lineFieldStackContents: "eb-line-field-stack-contents flex min-w-0 flex-col gap-1",
  lineTitleLabel: "eb-line-title-label",
  lineTitleInputWrap: "eb-line-title-input-wrap",
  linePricingQty: "eb-line-pricing-qty",
  lineQtyLabel: "eb-line-qty-label",
  lineQtyInput: "eb-line-qty-input",
  linePricingUnit: "eb-line-pricing-unit",
  lineUnitLabel: "eb-line-unit-label",
  lineUnitInput: "eb-line-unit-input",
  linePricingTotalCol: "eb-line-pricing-total-col",
  lineTotalLabel: "eb-line-total-label",
  lineItemDescriptionBlock: "eb-line-item-description-block",
  lineItemActionsBar: "eb-line-item-actions-bar",
  lineItemActionsInner: "eb-line-item-actions-inner",
  lineItemIcon: "eb-line-item-icon",
  lineTotalActionArea: "eb-line-total-action-area",
  lineTotalBlock: "eb-line-total-block",
  lineTotalAmount: "eb-line-total-amount",
  lineItemMoreTrigger:
    "eb-line-item-more-trigger inline-flex h-7 w-7 min-h-7 min-w-7 shrink-0 items-center justify-center rounded-md border-0 bg-transparent p-0 text-[#929CAF] opacity-[0.65] transition-[opacity,background,color] duration-150 hover:bg-white/[0.05] hover:text-[#B5BECC] hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/15 max-md:min-h-9 max-md:min-w-9 max-md:h-9 max-md:w-9 max-md:opacity-90",
  lineItemMoreMenu: "eb-line-item-more-menu min-w-[9.5rem] w-[9.5rem] rounded-md border p-1",
  lineItemMoreMenuItem:
    "eb-line-item-more-menu-item flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] leading-snug text-[#D8DEE8] outline-none transition-colors",
  lineItemMoreMenuItemDanger: "eb-line-item-more-menu-item--danger",
  linePricingTotal: "eb-line-pricing-total",
  iconAction: "eb-icon-action",
  portalPrimaryButton:
    "!border-white/10 !bg-[#10131a] !text-[#D8B46A] shadow-[0_10px_24px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.06)] hover:!bg-[#141820] hover:!text-[#e8d4a8] focus-visible:!ring-amber-200/25",
  portalGhostButton:
    "!border-white/10 !bg-white/[0.035] !text-[#B5BECC] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:!bg-white/[0.08] hover:!text-[#F6F7FA] focus-visible:!ring-amber-200/25",

  draftBadge: "eb-draft-badge",
  draftBadgePill: "eb-draft-badge-pill",
  pageTitle: "text-xl font-semibold tracking-[-0.02em] text-[#F6F7FA]",
  pageMeta: "text-[13px] leading-snug text-[#929CAF]",
  section: "pb-5 last:pb-0",
  sectionTitle: "text-[15px] font-semibold tracking-[-0.01em] leading-snug text-[#F6F7FA]",
  sectionSubtitle: "mt-0.5 text-[12.5px] leading-snug text-[#929CAF]",
  scopeHeading: "text-[15px] font-semibold tracking-[-0.01em] leading-snug text-[#F6F7FA]",
  scopeSubtitle: "mt-0.5 text-[12.5px] leading-snug text-[#929CAF]",
  scopeEmpty: "eb-scope-empty",
  scopeEmptyMessage: "eb-scope-empty-message",
  fieldStack: "space-y-1",
  label: "sr-only",
  coreGrid: "grid grid-cols-1 gap-3 sm:grid-cols-2",
  readGrid: "grid grid-cols-2 gap-x-5 gap-y-3.5 sm:grid-cols-4",
  readRow: "space-y-0.5 min-w-0",
  readLabel: "text-[11px] font-semibold uppercase tracking-[0.06em] leading-tight text-[#9EA8B8]",
  readValue: "text-[14px] font-medium leading-snug text-[#F6F7FA] truncate",
  readValueMuted:
    "text-[14px] leading-snug text-[#D8DEE8] truncate tabular-nums [font-feature-settings:'tnum']",
  readDash: "text-[14px] leading-snug text-[#A7B0C0]",
  input:
    "eb-input min-h-11 w-full rounded-md px-3 py-1 text-base font-normal leading-[1.4] text-[#F4F7FB] transition-[border-color,background,box-shadow] duration-200 placeholder:text-[#7F899B] placeholder:font-normal focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:text-[#697386] disabled:opacity-100 md:h-8 md:min-h-8 md:px-2.5 md:text-[14px] md:leading-[1.4]",
  inputMuted: "font-normal text-[#D8DEE8]",
  inputNumeric: "text-right tabular-nums",
  lineTableHead:
    "border-b border-white/[0.06] pb-2 text-[11px] font-semibold uppercase tracking-[0.06em] leading-tight text-[#9EA8B8]",
  /** Lighter pricing strip below proposal scope cards */
  pricingSection: "mt-5 border-t border-white/[0.06] pt-3",
  pricingTableHead:
    "border-b border-white/[0.05] pb-2 text-[11px] font-semibold uppercase tracking-[0.06em] leading-tight text-[#9EA8B8]",
  pricingTableRow:
    "border-b border-white/[0.035] transition-colors duration-150 last:border-0 hover:bg-white/[0.02]",
  lineTableRow:
    "eb-line-row border-b border-white/[0.04] transition-colors duration-150 group/line last:border-0",
  lineRowActions:
    "opacity-0 group-hover/line:opacity-100 transition-opacity duration-150 max-md:opacity-100",
  lineDetailsLink:
    "inline-flex min-h-11 items-center px-2 text-[13px] opacity-0 transition-[opacity,color] duration-150 group-hover/line:opacity-100 focus-visible:opacity-100 focus-visible:outline-none md:min-h-0 md:px-0 max-md:opacity-100 eb-gold-link",
  lineTotal:
    "text-[13px] font-semibold tabular-nums text-[#D8DEE8] [font-feature-settings:'tnum'] md:text-[14px]",
  scopeBlock: "mb-2 last:mb-0",
  scopeBlockHeader:
    "eb-scope-section-header flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1.5 border-b border-white/[0.06] pb-2 pt-0",
  addSectionComposer: "eb-add-section-composer",
  scopeBlockTitle: "text-[15.5px] font-semibold tracking-[-0.01em] leading-snug text-[#F6F7FA]",
  scopeBlockTotal:
    "text-[14px] font-semibold tabular-nums tracking-[-0.01em] text-[#D8DEE8] [font-feature-settings:'tnum']",
  composerAddSection:
    "eb-add-section eb-action-secondary inline-flex min-h-11 items-center gap-1.5 px-2.5 text-[14px] font-medium leading-[1.35] md:h-8 md:min-h-8",
  commandMenu: "z-[100] max-h-64 overflow-y-auto rounded-xl border py-1 eb-glass-command",
  commandMenuItem:
    "mx-1 cursor-pointer rounded-lg px-2.5 py-2 text-[14px] leading-snug text-[#B5BECC] transition-colors hover:bg-white/[0.06] hover:text-[#F6F7FA]",
  commandMenuItemActive: "bg-white/[0.06] text-[#F6F7FA]",
  addLineLink:
    "eb-add-line inline-flex h-8 min-h-8 items-center gap-1.5 rounded-[0.625rem] border px-2.5 text-[13px] font-medium leading-none transition-[color,background,border-color,opacity] duration-150",
  lineIndexBadge:
    "eb-line-index inline-flex w-[32px] shrink-0 items-center justify-start text-[12.5px] font-medium tabular-nums leading-none tracking-[-0.02em] text-[#A7B0C0] [font-feature-settings:'tnum']",
  paymentTitle: "text-[15px] font-semibold leading-snug text-[#F6F7FA]",
  paymentSubtitle: "mt-0.5 text-[12.5px] leading-snug text-[#929CAF]",
  paymentStatLabel: "text-[13px] leading-snug text-[#9EA8B8]",
  paymentStatValue:
    "text-[14px] font-semibold tabular-nums text-[#D8DEE8] [font-feature-settings:'tnum']",
  categoryGroup: "mb-3 last:mb-0",
  scopeSectionSortable: "eb-scope-section-sortable relative",
  scopeSectionDragging: "eb-scope-section-dragging",
  scopeSectionDragHandle: "eb-scope-section-drag-handle",
  scopeSectionHeaderRow: "flex min-w-0 flex-1 items-center gap-1.5",
  scopeSectionCollapseBtn: "eb-scope-section-collapse-btn",
  scopeSectionHeaderCollapsed: "eb-scope-section-header--collapsed",
  scopeSectionHeaderMeta: "eb-scope-section-header-meta flex shrink-0 items-center gap-3",
  scopeSectionItemCount:
    "eb-scope-section-item-count text-[12.5px] font-medium tabular-nums leading-none text-[#929CAF]",
  scopeSectionBody:
    "eb-scope-section-body grid transition-[grid-template-rows,opacity] duration-150 ease-out",
  scopeSectionBodyCollapsed: "eb-scope-section-body--collapsed",
  scopeSectionBodyInner: "eb-scope-section-body-inner min-h-0 overflow-hidden",
  scopeSectionMobile: "eb-scope-section-mobile mb-3 last:mb-0",
  builderPickerMenu: "eb-builder-picker-menu z-[100] max-h-72 min-w-[12rem] overflow-y-auto",
  builderPickerGroupLabel:
    "px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#7f899b]",
  lineItemStatusPill:
    "eb-line-item-status-pill inline-flex shrink-0 items-center rounded-sm border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[10.5px] font-medium leading-none tracking-[0.01em] text-[#929caf]",
  noteBlock: "eb-note-block border-b border-white/[0.06] pb-3 last:border-0 last:pb-0",
  noteBlockTextarea: "eb-note-block-textarea",
  categorySectionTotal: "text-[13px] font-normal tabular-nums text-[#929CAF]",
  backLink:
    "inline-flex min-h-11 items-center gap-1 text-[14px] leading-snug text-[#929CAF] transition-colors duration-200 hover:text-[#B5BECC]",
  summaryInternalLabel:
    "text-[11px] font-semibold uppercase tracking-[0.08em] leading-tight text-[#9EA8B8]",
  summaryLineLabel: "text-[13px] leading-snug text-[#9EA8B8]",
  summaryLineValue: "text-[14px] tabular-nums text-[#D8DEE8] [font-feature-settings:'tnum']",
  summaryLineValueMuted: "text-[14px] tabular-nums text-[#929CAF] [font-feature-settings:'tnum']",
  draftPanel: "eb-draft-panel",

  /** Premium glass sheets (Estimate Builder drawers only) */
  sheetGlass: "estimate-builder eb-sheet-glass",
  sheetGlassWide: "eb-sheet-glass-wide",
  sheetGlassNarrow: "eb-sheet-glass-narrow",
  sheetHeader: "eb-sheet-header",
  sheetTitle: "eb-sheet-title",
  sheetContent: "eb-sheet-content",
  sheetContentInner: "eb-sheet-content-inner",
  sheetFooter: "eb-sheet-footer",
  sheetFooterActions: "eb-sheet-footer-actions",
  sheetField: "eb-sheet-field",
  sheetLabel: "eb-sheet-label",
  sheetLabelRow: "flex flex-wrap items-center justify-between gap-2",
  sheetHelperTrigger:
    "h-7 min-h-7 shrink-0 px-2 text-[11px] font-medium tracking-wide text-[#929CAF] hover:bg-white/[0.06] hover:text-[#D8DEE8]",
  sheetHelperChips: "mt-1.5 flex flex-wrap gap-1.5",
  sheetHelperChip:
    "h-7 min-h-7 rounded-sm border border-white/[0.08] bg-white/[0.03] px-2.5 text-[11px] font-medium tracking-wide text-[#B5BECC] hover:border-white/[0.12] hover:bg-white/[0.06] hover:text-[#D8DEE8]",
  sheetHelperHint: "mt-1 text-[11px] leading-snug text-[#929CAF]",
  paymentAmountRow: "flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-2",
  paymentAmountCol: "min-w-0 flex-1",
  paymentPercentCol: "w-full shrink-0 sm:w-[5.75rem]",
  paymentPercentHelper: "eb-payment-percent-helper mt-1.5",
  sheetSectionLabel: "eb-sheet-section-label",
  sheetInput: "eb-sheet-input",
  sheetTextarea: "eb-sheet-textarea",
  sheetPrimary: "eb-sheet-primary",
  sheetSecondary: "eb-sheet-secondary",
} as const;

export function ebInput(className?: string): string {
  return cn(EB.input, className);
}

export function ebSheetInput(className?: string): string {
  return cn(EB.sheetInput, className);
}

export function ebSheetGlassWide(className?: string): string {
  return cn(
    EB.sheetGlass,
    EB.sheetGlassWide,
    EB.shellNew,
    "flex max-h-[100vh] max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden p-0",
    className
  );
}

export function ebSheetGlassNarrow(className?: string): string {
  return cn(
    EB.sheetGlass,
    EB.sheetGlassNarrow,
    "flex max-h-[100vh] max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden p-0",
    className
  );
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
