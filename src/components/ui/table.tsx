import * as React from "react";

import { cn } from "@/lib/utils";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import { OS, TYPO } from "@/lib/typography";

const tableShellClass = OS.tableShell;

/** Legacy raw table cell borders — light row dividers only (prefer `Table` primitives). */
export const tableCellBorderClass = "border-b border-[var(--hh-border)] last:border-b-0";

export const tableRawThClass = cn(
  "h-9 bg-[var(--hh-l2-operational-surface)] px-3 text-left align-middle",
  TYPO.tableHeader,
  "border-b border-[var(--hh-border)]"
);

export const tableRawTdClass = cn(
  "h-9 max-md:min-h-[44px] px-3 py-0 align-middle text-sm text-[var(--neo-text-primary)]",
  "border-b border-[var(--hh-border)] last:border-b-0"
);

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className={tableShellClass}>
      <div className="max-w-full overflow-x-auto">
        <table
          ref={ref}
          className={cn(
            "w-full caption-bottom border-collapse text-sm text-zinc-900 dark:text-foreground",
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
      "[&>tr]:border-b [&>tr]:border-[var(--hh-border)] [&>tr:last-child]:border-b-0",
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
      "border-t border-[var(--hh-border)] font-medium [&>tr]:last:border-b-0",
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
        "data-[state=selected]:border-l-[var(--hh-border-strong)] data-[state=selected]:bg-[var(--hh-l3-selected)]",
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
      "h-9 bg-[var(--hh-l2-operational-surface)] px-3 text-left align-middle",
      TYPO.tableHeader,
      "border-b border-[var(--hh-border)]",
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
      "h-9 max-md:min-h-[44px] px-3 py-0 align-middle text-sm text-[var(--neo-text-primary)]",
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
    className={cn("mt-3 text-sm text-[var(--neo-text-secondary)]", className)}
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
