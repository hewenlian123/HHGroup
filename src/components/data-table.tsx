import * as React from "react";

import {
  DataTable as CanonicalDataTable,
  type DataTableColumn,
} from "@/components/base/data-table";
import {
  listTableAmountCellClassName,
  listTablePrimaryCellClassName,
} from "@/lib/list-table-interaction";
import { cn } from "@/lib/utils";

export interface Column<T> {
  align?: "left" | "right";
  className?: string;
  header: string;
  key: string;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  actionsColumnKey?: string;
  amountColumnKeys?: string[];
  cellClassName?: string;
  className?: string;
  columns: Column<T>[];
  data: T[];
  emptyText?: string;
  headerClassName?: string;
  keyExtractor: (row: T) => string;
  loading?: boolean;
  loadingText?: string;
  mobileTitleKey?: string;
  onRowClick?: (row: T) => void;
  primaryColumnKey?: string;
  rowClassName?: string;
  selectedRowId?: string | null;
  zebra?: boolean;
}

/** Compatibility adapter for the former project-table API. */
export function DataTable<T>({
  actionsColumnKey = "actions",
  amountColumnKeys,
  cellClassName,
  className,
  columns,
  data,
  emptyText,
  headerClassName,
  keyExtractor,
  loading,
  loadingText,
  mobileTitleKey,
  onRowClick,
  primaryColumnKey,
  rowClassName,
  selectedRowId,
  zebra,
}: DataTableProps<T>) {
  const canonicalColumns: DataTableColumn<T>[] = columns.map((column) => ({
    key: column.key,
    header: column.header,
    cell: column.render,
    numeric: column.align === "right",
    stopRowClick: column.key === actionsColumnKey,
    className: cn(
      column.className,
      column.key === primaryColumnKey && listTablePrimaryCellClassName,
      amountColumnKeys?.includes(column.key) && listTableAmountCellClassName
    ),
  }));

  return (
    <CanonicalDataTable
      columns={canonicalColumns}
      data={data}
      getRowId={keyExtractor}
      loading={loading}
      loadingText={loadingText}
      emptyState={emptyText}
      selectedRowId={selectedRowId}
      onRowClick={onRowClick}
      rowRole="link"
      tableClassName={className}
      headerRowClassName={headerClassName}
      rowClassName={rowClassName}
      cellClassName={cellClassName}
      zebra={zebra}
      mobileTitleKey={mobileTitleKey}
    />
  );
}
