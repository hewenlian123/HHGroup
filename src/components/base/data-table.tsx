"use client";

import * as React from "react";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { NeoMobileCard, NeoTable } from "@/components/base/neo-primitives";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
import { cn } from "@/lib/utils";
import { motionListTableRow } from "@/lib/motion-system";
import { TYPO } from "@/lib/typography";

export type DataTableColumn<T> = {
  key: string;
  header: React.ReactNode;
  /** Render cell content. */
  cell?: (row: T) => React.ReactNode;
  /** Right-align (for numbers). */
  numeric?: boolean;
  /** Optional column width class, e.g. "w-24". */
  className?: string;
};

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  getRowId: (row: T, index?: number) => string;
  onRowClick?: (row: T) => void;
  /** Render actions for each row (e.g. Edit, Delete). Shown in ellipsis menu. */
  rowActions?: (row: T) => { label: React.ReactNode; onClick: () => void }[];
  /** Optional class for the table wrapper (e.g. max-h for scroll). */
  className?: string;
  loading?: boolean;
  loadingText?: string;
  emptyState?: React.ReactNode;
  selectedRowId?: string | null;
}

function getCellContent<T>(row: T, col: DataTableColumn<T>): React.ReactNode {
  if (col.cell) return col.cell(row);
  return (row as Record<string, unknown>)[col.key] as React.ReactNode;
}

export function DataTable<T>({
  columns,
  data,
  getRowId,
  onRowClick,
  rowActions,
  className,
  loading = false,
  loadingText = "Loading...",
  emptyState = "No records found.",
  selectedRowId,
}: DataTableProps<T>) {
  const titleCol = columns[0];
  return (
    <>
      {/* Desktop/Tablet: table */}
      <div className={cn("relative hidden w-full md:block", className)}>
        <NeoTable tableClassName="min-w-[640px] caption-bottom text-sm lg:min-w-0">
          <TableHeader>
            <TableRow className="hover:!translate-y-0 hover:!bg-transparent active:!scale-100 dark:hover:!bg-transparent">
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(col.numeric && "text-right tabular-nums", col.className)}
                >
                  {col.header}
                </TableHead>
              ))}
              {rowActions ? <TableHead className="w-10 px-0 text-right" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="pointer-events-none hover:!bg-transparent active:!scale-100">
                <TableCell
                  colSpan={columns.length + (rowActions ? 1 : 0)}
                  className="py-8 text-center text-[var(--neo-text-secondary)]"
                >
                  {loadingText}
                </TableCell>
              </TableRow>
            ) : null}
            {!loading && data.length === 0 ? (
              <TableRow className="pointer-events-none hover:!bg-transparent active:!scale-100">
                <TableCell
                  colSpan={columns.length + (rowActions ? 1 : 0)}
                  className="py-8 text-center text-[var(--neo-text-secondary)]"
                >
                  {emptyState}
                </TableCell>
              </TableRow>
            ) : null}
            {!loading &&
              data.map((row, index) => {
                const id = getRowId(row, index);
                const actions = rowActions?.(row) ?? [];
                const isSelected = selectedRowId === id;
                return (
                  <TableRow
                    key={id}
                    data-state={isSelected ? "selected" : undefined}
                    aria-selected={isSelected || undefined}
                    className={cn(
                      "table-row-compact",
                      motionListTableRow,
                      onRowClick &&
                        "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)] focus-visible:ring-offset-0",
                      !onRowClick && "cursor-default"
                    )}
                    onClick={(e) => {
                      const target = (e.target as HTMLElement).closest("button");
                      if (!target && onRowClick) onRowClick(row);
                    }}
                  >
                    {columns.map((col) => (
                      <TableCell
                        key={col.key}
                        className={cn(col.numeric && "num font-semibold", col.className)}
                      >
                        {col.cell
                          ? col.cell(row)
                          : ((row as Record<string, unknown>)[col.key] as React.ReactNode)}
                      </TableCell>
                    ))}
                    {rowActions ? (
                      <TableCell
                        className="w-10 px-0 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <RowActionsMenu
                          appearance="list"
                          actions={actions}
                          ariaLabel="Row actions"
                        />
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
          </TableBody>
        </NeoTable>
      </div>

      {/* Mobile: card layout */}
      <div className="grid gap-3 md:hidden">
        {loading ? <LoadingState text={loadingText} className="py-6" /> : null}
        {!loading && data.length === 0 ? (
          <EmptyState title={typeof emptyState === "string" ? emptyState : "No records found."} />
        ) : null}
        {!loading &&
          data.map((row, index) => {
            const id = getRowId(row, index);
            const actions = rowActions?.(row) ?? [];
            const isSelected = selectedRowId === id;
            return (
              <NeoMobileCard
                key={id}
                selected={isSelected}
                className={cn(
                  "p-4",
                  onRowClick &&
                    "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)] focus-visible:ring-offset-0"
                )}
                role={onRowClick ? "button" : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (e) => e.key === "Enter" && onRowClick(row) : undefined}
              >
                <div className={TYPO.primaryName}>
                  {titleCol ? getCellContent(row, titleCol) : null}
                </div>
                <dl className="mt-3 space-y-2">
                  {columns.slice(1).map((col) => (
                    <div key={col.key} className="flex justify-between gap-2 text-sm">
                      <dt className={TYPO.tableHeader}>{col.header}</dt>
                      <dd
                        className={cn(
                          "text-right text-[var(--neo-text-primary)]",
                          col.numeric && TYPO.amount
                        )}
                      >
                        {getCellContent(row, col)}
                      </dd>
                    </div>
                  ))}
                </dl>
                {actions.length > 0 ? (
                  <div className="mt-3 flex justify-end" onClick={(e) => e.stopPropagation()}>
                    <RowActionsMenu actions={actions} ariaLabel="Row actions" appearance="list" />
                  </div>
                ) : null}
              </NeoMobileCard>
            );
          })}
      </div>
    </>
  );
}
