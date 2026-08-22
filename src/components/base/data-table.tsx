"use client";

import * as React from "react";

import { NeoMobileCard, NeoTable } from "@/components/base/neo-primitives";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { motionListTableRow } from "@/lib/motion-system";
import { TYPO } from "@/lib/typography";
import { cn } from "@/lib/utils";

export type DataTableColumn<T> = {
  key: string;
  header: React.ReactNode;
  cell?: (row: T) => React.ReactNode;
  numeric?: boolean;
  className?: string;
  /** Prevent an interactive row click when this cell owns its own controls. */
  stopRowClick?: boolean;
};

export interface DataTableProps<T> {
  cellClassName?: string;
  className?: string;
  columns: DataTableColumn<T>[];
  data: T[];
  emptyState?: React.ReactNode;
  getRowId: (row: T, index?: number) => string;
  headerRowClassName?: string;
  loading?: boolean;
  loadingText?: string;
  mobileTitleKey?: string;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => { label: React.ReactNode; onClick: () => void }[];
  rowClassName?: string;
  rowRole?: "button" | "link";
  selectedRowId?: string | null;
  tableClassName?: string;
  zebra?: boolean;
}

function getCellContent<T>(row: T, column: DataTableColumn<T>): React.ReactNode {
  if (column.cell) return column.cell(row);
  return (row as Record<string, unknown>)[column.key] as React.ReactNode;
}

const interactiveTargetSelector =
  "a,button,input,select,textarea,[role=menuitem],[data-radix-popper-content-wrapper]";

/** Canonical responsive operational table/list composition. */
export function DataTable<T>({
  cellClassName,
  className,
  columns,
  data,
  emptyState = "No records found.",
  getRowId,
  headerRowClassName,
  loading = false,
  loadingText = "Loading...",
  mobileTitleKey,
  onRowClick,
  rowActions,
  rowClassName,
  rowRole = "button",
  selectedRowId,
  tableClassName,
  zebra = false,
}: DataTableProps<T>) {
  const titleColumn = columns.find((column) => column.key === mobileTitleKey) ?? columns[0];

  const activateRow = (e: React.KeyboardEvent, row: T) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onRowClick?.(row);
    }
  };

  return (
    <>
      <div className={cn("relative hidden w-full md:block", className)}>
        <NeoTable
          busy={loading}
          tableClassName={cn("min-w-[640px] caption-bottom lg:min-w-0", tableClassName)}
        >
          <TableHeader>
            <TableRow className={cn("hover:!bg-transparent", headerRowClassName)}>
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  className={cn(column.numeric && "hh-fin text-right", column.className)}
                >
                  {column.header}
                </TableHead>
              ))}
              {rowActions ? <TableHead className="w-hh-10 px-0 text-right" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="pointer-events-none hover:!bg-transparent">
                <TableCell
                  colSpan={columns.length + (rowActions ? 1 : 0)}
                  className="py-hh-8 text-center text-[var(--hh-text-secondary)]"
                >
                  {loadingText}
                </TableCell>
              </TableRow>
            ) : null}
            {!loading && data.length === 0 ? (
              <TableRow className="pointer-events-none hover:!bg-transparent">
                <TableCell
                  colSpan={columns.length + (rowActions ? 1 : 0)}
                  className="py-hh-8 text-center text-[var(--hh-text-secondary)]"
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
                    tabIndex={onRowClick ? 0 : undefined}
                    role={onRowClick ? rowRole : undefined}
                    className={cn(
                      "table-row-compact",
                      motionListTableRow,
                      onRowClick ? "hh-focus-ring cursor-pointer" : "cursor-default",
                      zebra && index % 2 === 1 && "bg-[var(--hh-l3-hover)]",
                      rowClassName
                    )}
                    onClick={(event) => {
                      const target = (event.target as HTMLElement).closest(
                        interactiveTargetSelector
                      );
                      if (!target) onRowClick?.(row);
                    }}
                    onKeyDown={onRowClick ? (event) => activateRow(event, row) : undefined}
                  >
                    {columns.map((column) => (
                      <TableCell
                        key={column.key}
                        onClick={
                          column.stopRowClick ? (event) => event.stopPropagation() : undefined
                        }
                        className={cn(
                          column.numeric && TYPO.amount,
                          cellClassName,
                          column.className
                        )}
                      >
                        {getCellContent(row, column)}
                      </TableCell>
                    ))}
                    {rowActions ? (
                      <TableCell
                        className="w-hh-10 px-0 text-right"
                        onClick={(event) => event.stopPropagation()}
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

      <div className="grid gap-hh-3 md:hidden" aria-busy={loading || undefined}>
        {loading ? <LoadingState text={loadingText} className="py-hh-6" /> : null}
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
                className={cn("p-hh-4", onRowClick && "cursor-pointer")}
                role={onRowClick ? rowRole : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={
                  onRowClick
                    ? (event) => {
                        const target = (event.target as HTMLElement).closest(
                          interactiveTargetSelector
                        );
                        if (!target) onRowClick(row);
                      }
                    : undefined
                }
                onKeyDown={onRowClick ? (event) => activateRow(event, row) : undefined}
              >
                <div className={TYPO.primaryName}>
                  {titleColumn ? getCellContent(row, titleColumn) : null}
                </div>
                <dl className="mt-hh-3 space-y-hh-2">
                  {columns
                    .filter((column) => column.key !== titleColumn?.key)
                    .map((column) => (
                      <div
                        key={column.key}
                        className={cn("flex justify-between gap-hh-2", TYPO.body)}
                      >
                        <dt className={TYPO.tableHeader}>{column.header}</dt>
                        <dd
                          className={cn(
                            "text-right text-[var(--hh-text-primary)]",
                            column.numeric && TYPO.amount
                          )}
                        >
                          {getCellContent(row, column)}
                        </dd>
                      </div>
                    ))}
                </dl>
                {actions.length > 0 ? (
                  <div className="mt-hh-3 flex justify-end" onClick={(e) => e.stopPropagation()}>
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
