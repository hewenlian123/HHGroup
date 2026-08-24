import { cn } from "@/lib/utils";

/** Estimate Workspace — Operational Compact class map. */
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
  workbench: "eb-estimate-workbench grid min-w-0 gap-4",
  glassMobileBar: "eb-glass-mobile-bar",
  glassHeader: "eb-glass-header",
  glassCommand: "eb-glass-command",
  glassNotes: "eb-glass-notes",
  scopeTableWrap: "eb-scope-table-wrap",
  goldTotal: "eb-gold-total",
  goldLink: "eb-gold-link",
  goldAccent: "eb-gold-accent",
  tabularNums: "hh-fin",

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
  lineItemGridHeader: "eb-line-item-grid-header hidden xl:grid",
  lineItemItemCell: "eb-line-item-item-cell",
  lineItemTitleField: "eb-line-item-title-field",
  lineItemPricingWrap: "eb-line-item-pricing-wrap",
  lineFieldStack: "flex min-w-0 flex-col gap-1",
  lineFieldStackContents: "eb-line-field-stack-contents flex min-w-0 flex-col gap-1",
  lineTitleLabel: "eb-line-title-label",
  lineTitleInputWrap: "eb-line-title-input-wrap",
  linePricingQty: "eb-line-pricing-qty",
  lineQtyLabel: "eb-line-qty-label",
  lineQtyInput: "eb-line-qty-input",
  linePricingMeasure: "eb-line-pricing-measure",
  lineMeasureLabel: "eb-line-measure-label",
  lineMeasureInput: "eb-line-measure-input",
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
    "eb-line-item-more-trigger inline-flex h-7 w-7 min-h-7 min-w-7 shrink-0 items-center justify-center rounded-hh-compact border-0 bg-transparent p-0 text-muted-foreground opacity-70 transition-[opacity,background,color] duration-150 hover:!translate-y-0 hover:bg-muted hover:text-foreground hover:opacity-100 active:!scale-100 active:!duration-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:h-11 max-md:w-11 max-md:min-h-11 max-md:min-w-11 max-md:opacity-90",
  lineItemMoreMenu:
    "eb-line-item-more-menu min-w-[9.5rem] w-[9.5rem] rounded-hh-compact border p-1",
  lineItemMoreMenuItem:
    "eb-line-item-more-menu-item text-hh-table-cell flex cursor-pointer items-center gap-2 rounded-hh-compact px-2 py-1.5 text-foreground outline-none transition-colors",
  lineItemMoreMenuItemDanger: "eb-line-item-more-menu-item--danger",
  linePricingTotal: "eb-line-pricing-total",
  iconAction: "eb-icon-action",
  portalPrimaryButton:
    "!border-foreground !bg-foreground !text-background shadow-sm hover:!bg-foreground/90 focus-visible:!ring-ring",
  portalGhostButton:
    "!border-border !bg-background !text-foreground shadow-none hover:!bg-muted focus-visible:!ring-ring",

  draftBadge: "eb-draft-badge",
  draftBadgePill: "eb-draft-badge-pill",
  pageTitle: "eb-page-title text-hh-page-title text-foreground",
  pageMeta: "eb-page-meta text-hh-metadata text-muted-foreground",
  section: "pb-5 last:pb-0",
  sectionTitle: "eb-section-title text-hh-section-title text-foreground",
  sectionSubtitle: "eb-section-subtitle mt-0.5 text-hh-metadata text-muted-foreground",
  scopeHeading: "eb-scope-heading text-hh-section-title text-foreground",
  scopeSubtitle: "eb-scope-subtitle mt-0.5 text-hh-metadata text-muted-foreground",
  scopeEmpty: "eb-scope-empty",
  scopeEmptyMessage: "eb-scope-empty-message",
  fieldStack: "space-y-1",
  label: "sr-only",
  coreGrid: "grid grid-cols-1 gap-3 sm:grid-cols-2",
  readGrid: "grid grid-cols-2 gap-x-5 gap-y-3.5 sm:grid-cols-4",
  readRow: "space-y-0.5 min-w-0",
  readLabel: "eb-read-label text-hh-table-header uppercase text-muted-foreground",
  readValue: "eb-read-value text-hh-label truncate text-foreground",
  readValueMuted: "eb-read-value-muted text-hh-metadata hh-fin truncate text-muted-foreground",
  readDash: "eb-read-dash text-hh-body text-muted-foreground",
  input:
    "eb-input hh-type-text-entry min-h-11 w-full rounded-hh-compact px-3 py-1 text-foreground transition-[border-color,background,box-shadow] duration-150 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:opacity-100 md:h-8 md:min-h-8 md:px-2.5",
  inputMuted: "font-normal text-foreground",
  inputNumeric: "hh-fin text-right",
  lineTableHead: "border-b border-border pb-2 text-hh-table-header uppercase text-muted-foreground",
  /** Lighter pricing strip below proposal scope cards */
  pricingSection: "mt-5 border-t border-border pt-3",
  pricingTableHead:
    "border-b border-border pb-2 text-hh-table-header uppercase text-muted-foreground",
  pricingTableRow:
    "border-b border-border/70 transition-colors duration-150 last:border-0 hover:bg-muted/40",
  lineTableRow:
    "eb-line-row border-b border-border/70 transition-colors duration-150 group/line last:border-0",
  lineRowActions:
    "opacity-0 group-hover/line:opacity-100 transition-opacity duration-150 max-md:opacity-100",
  lineDetailsLink:
    "inline-flex min-h-11 items-center px-2 text-hh-table-cell opacity-0 transition-[opacity,color] duration-150 group-hover/line:opacity-100 focus-visible:opacity-100 focus-visible:outline-none md:min-h-0 md:px-0 max-md:opacity-100 eb-gold-link",
  lineTotal: "eb-line-total text-hh-financial hh-fin text-foreground",
  scopeBlock: "mb-2 last:mb-0",
  scopeBlockHeader:
    "eb-scope-section-header flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1.5 border-b border-border pb-2 pt-0",
  addSectionComposer: "eb-add-section-composer",
  scopeBlockTitle: "eb-scope-block-title text-hh-section-title text-foreground",
  scopeBlockTotal: "eb-scope-block-total text-hh-financial hh-fin text-foreground",
  composerAddSection:
    "eb-add-section eb-action-secondary inline-flex min-h-11 items-center gap-1.5 px-2.5 text-hh-control md:h-8 md:min-h-8",
  commandMenu: "z-[100] max-h-64 overflow-y-auto rounded-hh-task border py-1 eb-glass-command",
  commandMenuItem:
    "mx-1 flex min-h-11 cursor-pointer items-center gap-2 rounded-hh-compact px-2.5 py-2 text-hh-body text-foreground transition-colors hover:bg-muted md:min-h-0",
  commandMenuItemActive: "bg-muted text-foreground",
  addLineLink:
    "eb-add-line inline-flex min-h-11 items-center gap-1.5 rounded-hh-standard border px-2.5 text-hh-control transition-[color,background,border-color,opacity] duration-150 md:h-8 md:min-h-8",
  lineIndexBadge:
    "eb-line-index inline-flex w-[32px] shrink-0 items-center justify-start text-hh-metadata hh-fin text-muted-foreground",
  paymentTitle: "eb-payment-title text-hh-section-title text-foreground",
  paymentSubtitle: "eb-payment-subtitle mt-0.5 text-hh-metadata text-muted-foreground",
  paymentStatLabel: "eb-payment-stat-label text-hh-table-cell text-muted-foreground",
  paymentStatValue: "eb-payment-stat-value text-hh-financial hh-fin text-foreground",
  categoryGroup: "mb-2 last:mb-0",
  addNextSectionRow: "eb-add-next-section-row",
  addFinalSectionRow: "eb-add-final-section-row",
  scopeSectionInserted: "eb-scope-section-inserted",
  scopeSectionSortable: "eb-scope-section-sortable relative",
  scopeSectionDragging: "eb-scope-section-dragging",
  scopeSectionDragHandle: "eb-scope-section-drag-handle",
  scopeSectionHeaderRow: "eb-scope-section-header-row flex min-w-0 flex-1 items-center gap-1.5",
  scopeSectionCollapseBtn: "eb-scope-section-collapse-btn",
  scopeSectionHeaderCollapsed: "eb-scope-section-header--collapsed",
  scopeSectionHeaderMeta: "eb-scope-section-header-meta flex shrink-0 items-center gap-2",
  scopeSectionAddLine:
    "eb-scope-section-add-line inline-flex min-h-11 items-center gap-1 rounded-hh-compact border border-border bg-background px-2.5 text-hh-control text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-8 md:min-h-8",
  scopeSectionItemCount:
    "eb-scope-section-item-count text-hh-metadata hh-fin text-muted-foreground",
  scopeSectionBody:
    "eb-scope-section-body grid transition-[grid-template-rows,opacity] duration-150 ease-out",
  scopeSectionBodyCollapsed: "eb-scope-section-body--collapsed",
  scopeSectionBodyInner: "eb-scope-section-body-inner min-h-0 overflow-hidden",
  scopeSectionMobile: "eb-scope-section-mobile mb-3 last:mb-0",
  builderPickerMenu: "eb-builder-picker-menu z-[100] max-h-72 min-w-[12rem] overflow-y-auto",
  builderPickerGroupLabel: "px-2.5 py-1.5 text-hh-table-header uppercase text-muted-foreground",
  lineItemStatusPill:
    "eb-line-item-status-pill inline-flex shrink-0 items-center rounded-hh-compact border border-border bg-muted/60 px-1.5 py-0.5 text-hh-status text-muted-foreground",
  noteBlock: "eb-note-block pb-3 last:pb-0",
  noteBlockTextarea: "eb-note-block-textarea",
  categorySectionTotal: "text-hh-table-cell hh-fin text-muted-foreground",
  backLink:
    "inline-flex min-h-11 items-center gap-1 text-hh-body text-muted-foreground transition-colors duration-150 hover:text-foreground",
  summaryInternalLabel: "text-hh-table-header uppercase text-muted-foreground",
  summaryLineLabel: "text-hh-table-cell text-muted-foreground",
  summaryLineValue: "text-hh-financial hh-fin text-foreground",
  summaryLineValueMuted: "text-hh-financial hh-fin text-muted-foreground",
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
    "eb-sheet-helper-trigger h-7 min-h-7 shrink-0 px-2 text-hh-status text-muted-foreground hover:bg-muted hover:text-foreground",
  sheetHelperChips: "mt-1.5 flex flex-wrap gap-1.5",
  sheetHelperChip:
    "eb-sheet-helper-chip h-7 min-h-7 rounded-hh-compact border border-border bg-background px-2.5 text-hh-status text-muted-foreground hover:bg-muted hover:text-foreground",
  sheetHelperHint: "mt-1 text-hh-helper text-muted-foreground",
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
