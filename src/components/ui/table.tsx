import * as React from "react";

import { cn } from "@/lib/utils";

const tableShellClass =
  "relative w-full overflow-hidden rounded-[10px] border-[0.5px] border-solid border-gray-300 bg-white dark:border-border";

/** Shared vertical rules + bottom line (last column has no right border). */
export const tableCellBorderClass =
  "border-b-[0.5px] border-r-[0.5px] border-solid border-gray-300 last:border-r-0 dark:border-border";

/** For legacy `<table>` markup — matches `TableHead`. */
export const tableRawThClass = cn(
  "h-8 bg-[#F9FAFB] px-3 text-left align-middle text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]",
  tableCellBorderClass
);

/** For legacy `<table>` body cells — matches `TableCell` rhythm. */
export const tableRawTdClass = cn(
  "min-h-[44px] px-3 py-3 align-middle text-[13px] text-[#374151] dark:text-foreground",
  tableCellBorderClass
);

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className={tableShellClass}>
      <div className="max-w-full overflow-x-auto">
        <table
          ref={ref}
          className={cn(
            "w-full caption-bottom border-collapse text-[13px] text-[#374151] dark:text-foreground",
            className
          )}
          {...props}
        />
      </div>
    </div>
  )
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-0", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child>td]:border-b-0 [&_tr:last-child>th]:border-b-0", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t border-gray-300 [border-top-width:0.5px] font-medium dark:border-border [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-0 transition-colors hover:bg-[#F5F7FA] data-[state=selected]:bg-muted dark:hover:bg-muted/50",
        "[&>td:first-child]:font-medium",
        className
      )}
      {...props}
    />
  )
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-8 bg-[#F9FAFB] px-3 text-left align-middle text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]",
      tableCellBorderClass,
      "[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "h-11 min-h-[44px] px-3 py-0 align-middle",
      tableCellBorderClass,
      "[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-3 text-sm text-text-secondary dark:text-muted-foreground", className)}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };

/** Outer shell only (for legacy `<table>` markup) — matches `Table` wrapper. */
export function TableShell({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn(tableShellClass, className)}>{children}</div>;
}
