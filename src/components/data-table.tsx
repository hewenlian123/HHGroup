import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  listTableAmountCellClassName,
  listTablePrimaryCellClassName,
  listTableRowClassName,
} from "@/lib/list-table-interaction";

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
}: DataTableProps<T>) {
  const dataColumns = columns.filter((c) => c.key !== actionsColumnKey);
  const actionsColumn = columns.find((c) => c.key === actionsColumnKey);
  const titleKey = mobileTitleKey ?? dataColumns[0]?.key;
  const cardColumns = actionsColumn ? [...dataColumns, actionsColumn] : dataColumns;

  return (
    <>
      {/* Desktop/Tablet: table */}
      <div className="table-responsive relative hidden w-full md:block">
        <Table className={cn("min-w-[480px] md:min-w-0 border-0", className)}>
          <TableHeader>
            <TableRow className={cn("hover:bg-transparent", headerClassName)}>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    col.align === "right" && "text-right font-mono tabular-nums",
                    col.className
                  )}
                >
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-8 text-center text-muted-foreground"
                >
                  {loadingText}
                </TableCell>
              </TableRow>
            ) : null}
            {!loading && data.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-8 text-center text-muted-foreground"
                >
                  {emptyText}
                </TableCell>
              </TableRow>
            ) : null}
            {!loading &&
              data.map((row, index) => (
                <TableRow
                  key={keyExtractor(row)}
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
                    onRowClick
                      ? listTableRowClassName
                      : "border-0 transition-colors hover:bg-[#F5F7FA] dark:hover:bg-muted/30",
                    zebra && index % 2 === 1 && !onRowClick && "bg-[#FAFAFA]/80 dark:bg-muted/10",
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
                        col.align === "right" && "text-right font-mono tabular-nums",
                        onRowClick && col.key === primaryColumnKey && listTablePrimaryCellClassName,
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
              ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: card layout */}
      <div className="grid gap-3 md:hidden">
        {loading ? (
          <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            {loadingText}
          </div>
        ) : data.length === 0 ? (
          <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          data.map((row) => {
            const titleCol = columns.find((c) => c.key === titleKey);
            return (
              <div
                key={keyExtractor(row)}
                className="rounded-lg border border-border/60 bg-background p-4 shadow-[var(--shadow-1)]"
              >
                <div className="text-base font-medium text-foreground">
                  {titleCol ? getCellContent(row, titleCol) : null}
                </div>
                <dl className="mt-3 space-y-2">
                  {cardColumns
                    .filter((col) => col.key !== titleKey)
                    .map((col) => (
                      <div key={col.key} className="flex justify-between gap-2 text-sm">
                        <dt className="text-muted-foreground">{col.header}</dt>
                        <dd
                          className={cn(
                            "text-right tabular-nums",
                            col.align === "right" && "text-right"
                          )}
                        >
                          {getCellContent(row, col)}
                        </dd>
                      </div>
                    ))}
                </dl>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
