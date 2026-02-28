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
}: DataTableProps<T>) {
  return (
    <Table className={cn("border-0", className)}>
      <TableHeader>
        <TableRow className={cn("hover:bg-transparent", headerClassName)}>
          {columns.map((col) => (
            <TableHead key={col.key} className={cn(col.align === "right" && "text-right", col.className)}>
              {col.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
              {loadingText}
            </TableCell>
          </TableRow>
        ) : null}
        {!loading && data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
              {emptyText}
            </TableCell>
          </TableRow>
        ) : null}
        {!loading && data.map((row, index) => (
          <TableRow
            key={keyExtractor(row)}
            className={cn(
              "border-b border-zinc-100/50 transition-colors duration-100 hover:bg-muted/20 dark:border-border/30",
              zebra && index % 2 === 1 && "bg-muted/10",
              rowClassName
            )}
          >
            {columns.map((col) => (
              <TableCell key={col.key} className={cn(col.align === "right" && "text-right", cellClassName, col.className)}>
                {col.render ? col.render(row) : (row as Record<string, unknown>)[col.key] as React.ReactNode}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
