import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { NeoMobileCard } from "@/components/base/neo-primitives";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listTableAmountCellClassName,
  listTablePrimaryCellClassName,
  listTableRowClassName,
  listTableRowStaticClassName,
} from "@/lib/list-table-interaction";
import { NEO, OS, TYPO } from "@/lib/typography";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
  align?: "left" | "right";
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  loading?: boolean;
  loadingText?: string;
  emptyText?: string;
  className?: string;
  headerClassName?: string;
  rowClassName?: string;
  cellClassName?: string;
  zebra?: boolean;
  /** Column key to use as card title on mobile (default: first column). */
  mobileTitleKey?: string;
  /** Row click → detail (skips clicks on links, buttons, menus). */
  onRowClick?: (row: T) => void;
  /** Adds `group-hover:opacity-80` to this column’s cells. */
  primaryColumnKey?: string;
  /** Adds amount emphasis on row hover. */
  amountColumnKeys?: string[];
  /** Stops row click when interacting with this column (default `actions`). */
  actionsColumnKey?: string;
  /** Optional selected row id for gold-accent row state. */
  selectedRowId?: string | null;
}

function getCellContent<T>(row: T, col: Column<T>): React.ReactNode {
  if (col.render) return col.render(row);
  return (row as Record<string, unknown>)[col.key] as React.ReactNode;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  loading = false,
  loadingText = "Loading...",
  emptyText = "No records found.",
  className,
  headerClassName,
  rowClassName,
  cellClassName,
  zebra = false,
  mobileTitleKey,
  onRowClick,
  primaryColumnKey,
  amountColumnKeys,
  actionsColumnKey = "actions",
  selectedRowId,
}: DataTableProps<T>) {
  const dataColumns = columns.filter((c) => c.key !== actionsColumnKey);
  const actionsColumn = columns.find((c) => c.key === actionsColumnKey);
  const titleKey = mobileTitleKey ?? dataColumns[0]?.key;
  const cardColumns = actionsColumn ? [...dataColumns, actionsColumn] : dataColumns;

  return (
    <>
      {loading ? <span className="sr-only">{loadingText}</span> : null}
      {/* Desktop/Tablet: table */}
      <div className="table-responsive relative hidden w-full overflow-x-auto md:block">
        <Table className={cn("min-w-[640px] border-0 lg:min-w-0", className)}>
          <TableHeader>
            <TableRow
              className={cn(
                "hover:!translate-y-0 hover:!bg-transparent active:!scale-100 dark:hover:!bg-transparent",
                headerClassName
              )}
            >
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(col.align === "right" && "text-right tabular-nums", col.className)}
                >
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: Math.min(6, Math.max(3, data.length || 5)) }, (_, i) => (
                  <TableRow
                    key={`sk-${i}`}
                    className="pointer-events-none border-0 hover:!translate-y-0 hover:!bg-transparent active:!scale-100"
                  >
                    {columns.map((col) => (
                      <TableCell key={col.key} className="py-3">
                        <Skeleton
                          className={cn(
                            "h-4 rounded-md",
                            col.align === "right" ? "ml-auto w-20" : "w-full max-w-[10rem]"
                          )}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : null}
            {!loading && data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-8 text-center text-[var(--neo-text-secondary)]"
                >
                  {emptyText}
                </TableCell>
              </TableRow>
            ) : null}
            {!loading &&
              data.map((row, index) => {
                const rowId = keyExtractor(row);
                const isSelected = selectedRowId === rowId;
                return (
                  <TableRow
                    key={rowId}
                    data-state={isSelected ? "selected" : undefined}
                    aria-selected={isSelected || undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    role={onRowClick ? "link" : undefined}
                    onClick={
                      onRowClick
                        ? (e) => {
                            const el = e.target as HTMLElement;
                            if (
                              el.closest(
                                "a,button,[role=menuitem],[data-radix-popper-content-wrapper]"
                              )
                            )
                              return;
                            onRowClick(row);
                          }
                        : undefined
                    }
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onRowClick(row);
                            }
                          }
                        : undefined
                    }
                    className={cn(
                      onRowClick ? listTableRowClassName : listTableRowStaticClassName,
                      zebra && index % 2 === 1 && !onRowClick && "bg-slate-50/70 dark:bg-muted/10",
                      rowClassName
                    )}
                  >
                    {columns.map((col) => (
                      <TableCell
                        key={col.key}
                        onClick={
                          onRowClick && col.key === actionsColumnKey
                            ? (e) => e.stopPropagation()
                            : undefined
                        }
                        className={cn(
                          col.align === "right" && NEO.amount,
                          onRowClick &&
                            col.key === primaryColumnKey &&
                            listTablePrimaryCellClassName,
                          cellClassName,
                          col.className,
                          onRowClick &&
                            amountColumnKeys?.includes(col.key) &&
                            listTableAmountCellClassName
                        )}
                      >
                        {col.render
                          ? col.render(row)
                          : ((row as Record<string, unknown>)[col.key] as React.ReactNode)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: card layout */}
      <div className="grid gap-3 md:hidden">
        {loading ? (
          <div className="grid gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={`msk-${i}`} className={cn(OS.card, "px-4 py-3")}>
                <Skeleton className="h-5 w-2/3 rounded-md" />
                <div className="mt-3 space-y-2">
                  <Skeleton className="h-4 w-full rounded-md" />
                  <Skeleton className="h-4 w-5/6 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        ) : data.length === 0 ? (
          <EmptyState title={emptyText} className="px-4 py-6" />
        ) : (
          data.map((row) => {
            const titleCol = columns.find((c) => c.key === titleKey);
            const rowId = keyExtractor(row);
            const isSelected = selectedRowId === rowId;
            return (
              <NeoMobileCard key={rowId} className={cn("px-4 py-3")} selected={isSelected}>
                <div className={TYPO.primaryName}>
                  {titleCol ? getCellContent(row, titleCol) : null}
                </div>
                <dl className="mt-3 space-y-2">
                  {cardColumns
                    .filter((col) => col.key !== titleKey)
                    .map((col) => (
                      <div key={col.key} className="flex justify-between gap-2 text-sm">
                        <dt className={TYPO.tableHeader}>{col.header}</dt>
                        <dd
                          className={cn(
                            "text-right",
                            col.align === "right" ? NEO.amount : "text-[var(--neo-text-primary)]"
                          )}
                        >
                          {getCellContent(row, col)}
                        </dd>
                      </div>
                    ))}
                </dl>
              </NeoMobileCard>
            );
          })
        )}
      </div>
    </>
  );
}
