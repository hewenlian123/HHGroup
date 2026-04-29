import * as React from "react";

import { cn } from "@/lib/utils";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";

const tableShellClass =
  "relative w-full overflow-hidden rounded-xl border border-gray-100 bg-white shadow-none dark:border-border dark:bg-card";

/** Legacy raw table cell borders — light row dividers only (prefer `Table` primitives). */
export const tableCellBorderClass = "border-b border-gray-100 last:border-b-0 dark:border-border";

export const tableRawThClass = cn(
  "h-9 bg-white px-3 text-left align-middle text-xs font-medium uppercase tracking-wide text-text-secondary dark:bg-card",
  "border-b border-gray-100 dark:border-border"
);

export const tableRawTdClass = cn(
  "h-9 max-md:min-h-[44px] px-3 py-0 align-middle text-sm text-text-primary dark:text-foreground",
  "border-b border-gray-100 last:border-b-0 dark:border-border"
);

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className={tableShellClass}>
      <div className="max-w-full overflow-x-auto">
        <table
          ref={ref}
          className={cn(
            "w-full caption-bottom border-collapse text-sm text-text-primary dark:text-foreground",
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
  <thead
    ref={ref}
    className={cn(
      "[&_tr]:border-0 [&_tr]:hover:!translate-y-0 [&_tr]:hover:!bg-transparent dark:[&_tr]:hover:!bg-transparent [&_tr]:active:!scale-100",
      className
    )}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn(
      "[&>tr]:border-b [&>tr]:border-gray-100 [&>tr:last-child]:border-b-0 dark:[&>tr]:border-border",
      className
    )}
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
      "border-t border-gray-100 font-medium dark:border-border [&>tr]:last:border-b-0",
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
        listTableRowStaticClassName,
        "border-l-2 border-l-transparent transition-colors",
        "data-[state=selected]:border-l-brand-primary data-[state=selected]:bg-blue-50 dark:data-[state=selected]:bg-blue-950/30",
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
      "h-9 bg-white px-3 text-left align-middle text-xs font-medium uppercase tracking-wide text-text-secondary dark:bg-card",
      "border-b border-gray-100 dark:border-border",
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
      "h-9 max-md:min-h-[44px] px-3 py-0 align-middle text-sm text-text-primary dark:text-foreground",
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
  ...rest
}: {
  className?: string;
  children: React.ReactNode;
} & React.ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cn(tableShellClass, className)} {...rest}>
      {children}
    </div>
  );
}
