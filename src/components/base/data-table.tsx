"use client";

import * as React from "react";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { motionListTableRow } from "@/lib/motion-system";

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
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Render actions for each row (e.g. Edit, Delete). Shown in ellipsis menu. */
  rowActions?: (row: T) => { label: React.ReactNode; onClick: () => void }[];
  /** Optional class for the table wrapper (e.g. max-h for scroll). */
  className?: string;
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
}: DataTableProps<T>) {
  const titleCol = columns[0];
  return (
    <>
      {/* Desktop/Tablet: table */}
      <div className={cn("relative hidden w-full overflow-x-auto md:block", className)}>
        <table className="w-full min-w-[640px] caption-bottom text-sm lg:min-w-0">
          <TableHeader>
            <TableRow className="hover:!translate-y-0 hover:!bg-transparent active:!scale-100 dark:hover:!bg-transparent">
              {columns.map((col) => (
                <TableHead key={col.key} className={cn(col.numeric && "text-right", col.className)}>
                  {col.header}
                </TableHead>
              ))}
              {rowActions ? <TableHead className="w-10 px-0 text-right" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => {
              const id = getRowId(row);
              const actions = rowActions?.(row) ?? [];
              return (
                <TableRow
                  key={id}
                  className={cn(
                    "table-row-compact",
                    motionListTableRow,
                    onRowClick &&
                      "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/30 focus-visible:ring-offset-0",
                    !onRowClick && "cursor-default"
                  )}
                  onClick={(e) => {
                    const target = (e.target as HTMLElement).closest("button");
                    if (!target && onRowClick) onRowClick(row);
                  }}
                >
                  {columns.map((col) => (
                    <TableCell key={col.key} className={cn(col.numeric && "num", col.className)}>
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
                      {actions.length > 0 ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              className="btn-outline-ghost h-8 w-8 shrink-0 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0"
                              aria-label="Row actions"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {actions.map((action, i) => (
                              <DropdownMenuItem
                                key={i}
                                onSelect={(e) => {
                                  e.preventDefault();
                                  action.onClick();
                                }}
                              >
                                {action.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </table>
      </div>

      {/* Mobile: card layout */}
      <div className="grid gap-3 md:hidden">
        {data.map((row) => {
          const id = getRowId(row);
          const actions = rowActions?.(row) ?? [];
          return (
            <div
              key={id}
              className={cn(
                "rounded-xl border border-gray-100 bg-white p-4 shadow-none transition-colors duration-150 ease-out active:scale-[0.99] hover:bg-gray-50 dark:border-border dark:hover:bg-muted/40",
                onRowClick &&
                  "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/30 focus-visible:ring-offset-0"
              )}
              role={onRowClick ? "button" : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (e) => e.key === "Enter" && onRowClick(row) : undefined}
            >
              <div className="text-sm font-medium text-text-primary">
                {titleCol ? getCellContent(row, titleCol) : null}
              </div>
              <dl className="mt-3 space-y-2">
                {columns.slice(1).map((col) => (
                  <div key={col.key} className="flex justify-between gap-2 text-sm">
                    <dt className="text-text-secondary">{col.header}</dt>
                    <dd className={cn(col.numeric && "text-right tabular-nums")}>
                      {getCellContent(row, col)}
                    </dd>
                  </div>
                ))}
              </dl>
              {actions.length > 0 ? (
                <div className="mt-3 flex justify-end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="btn-outline-ghost min-h-[44px] min-w-[44px]"
                        aria-label="Row actions"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {actions.map((action, i) => (
                        <DropdownMenuItem
                          key={i}
                          onSelect={(e) => {
                            e.preventDefault();
                            action.onClick();
                          }}
                        >
                          {action.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}
