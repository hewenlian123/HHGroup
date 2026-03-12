"use client";

import * as React from "react";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

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

export function DataTable<T>({
  columns,
  data,
  getRowId,
  onRowClick,
  rowActions,
  className,
}: DataTableProps<T>) {
  return (
    <div className={cn("relative w-full overflow-auto", className)}>
      <table className="w-full caption-bottom text-sm">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={cn(
                  col.numeric && "text-right",
                  col.className
                )}
              >
                {col.header}
              </TableHead>
            ))}
            {rowActions ? (
              <TableHead className="w-10 px-0 text-right" />
            ) : null}
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
                  "table-row-compact cursor-pointer border-b border-border/40 transition-colors hover:bg-muted/30",
                  onRowClick && "cursor-pointer"
                )}
                onClick={(e) => {
                  const target = (e.target as HTMLElement).closest("button");
                  if (!target && onRowClick) onRowClick(row);
                }}
              >
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={cn(
                      col.numeric && "num",
                      col.className
                    )}
                  >
                    {col.cell ? col.cell(row) : (row as Record<string, unknown>)[col.key] as React.ReactNode}
                  </TableCell>
                ))}
                {rowActions ? (
                  <TableCell className="w-10 px-0 text-right" onClick={(e) => e.stopPropagation()}>
                    {actions.length > 0 ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
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
  );
}
