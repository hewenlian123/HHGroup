/**
 * Phase 2 – Base component system (Linear-style).
 * Use these across the app; do not refactor all pages at once.
 */

export { DataTable, type DataTableColumn, type DataTableProps } from "./data-table";

export { PageLayout, PageHeader, ActionBar, Divider, MainContent } from "./page-layout";

export { StatusBadge, type StatusBadgeProps, type StatusBadgeVariant } from "./status-badge";

export {
  MatchStatusBadge,
  bankTransactionMatchKind,
  type MatchStatusBadgeProps,
  type MatchStatusKind,
} from "./match-status-badge";

export { Drawer, type DrawerProps } from "./drawer";

export { ConfirmDialog, type ConfirmDialogProps } from "./confirm-dialog";

export { DeleteRowAction } from "./delete-row-action";

export { RowActionsMenu, type RowAction, type RowActionsMenuProps } from "./row-actions-menu";

export { SectionHeader, type SectionHeaderProps } from "./section-header";

export { EmptyState } from "../empty-state";

export { LoadingState } from "../loading-state";

export {
  AmountCell,
  FilterToolbar,
  KpiTile,
  MobileListRow,
  NeoAmount,
  NeoBulkActions,
  NeoMobileCard,
  NeoPanel,
  NeoStatus,
  NeoTable,
  NeoToolbar,
} from "./neo-primitives";

export {
  NeoActionFooter,
  NeoDatePicker,
  NeoDrawer,
  NeoFieldLabel,
  NeoFormGrid,
  NeoFormSection,
  NeoInput,
  NeoModal,
  NeoSelect,
  NeoTextarea,
  neoFormErrorClassName,
  neoFormFieldClassName,
  neoFormNoticeClassName,
  neoFormPanelClassName,
} from "./neo-form";
