import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

export const projectFinancialTableClass =
  "min-w-0 w-full text-hh-body max-xl:block max-xl:[&_tbody]:grid max-xl:[&_tbody]:gap-3 max-xl:[&_tr]:grid max-xl:[&_tr]:rounded-hh-standard max-xl:[&_tr]:border max-xl:[&_tr]:border-[var(--hh-border)] max-xl:[&_tr]:bg-[var(--hh-l2-operational-surface)]";

export const projectFinancialCellClass =
  "max-xl:flex max-xl:h-auto max-xl:min-w-0 max-xl:items-start max-xl:justify-between max-xl:gap-4 max-xl:border-b max-xl:border-[var(--hh-border)] max-xl:px-3 max-xl:py-2.5 max-xl:text-right max-xl:last:border-b-0";

export const projectFinancialTableHeadClass = "max-xl:sr-only";

export const projectFinancialCellLabelClass =
  "hidden shrink-0 text-left text-hh-metadata font-medium uppercase text-[var(--hh-text-tertiary)] max-xl:inline";

export function projectFinancialHeaderAttributes(id: string) {
  return { id, scope: "col" as const };
}

export function projectFinancialCellAttributes(headerId: string) {
  return { headers: headerId };
}

export function ProjectFinancialTable({ className, ...props }: ComponentPropsWithoutRef<"table">) {
  return <table className={cn(projectFinancialTableClass, className)} {...props} />;
}

export function ProjectFinancialTableHead({
  className,
  ...props
}: ComponentPropsWithoutRef<"thead">) {
  return <thead className={cn(projectFinancialTableHeadClass, className)} {...props} />;
}

export function ProjectFinancialTableHeader({
  className,
  id,
  ...props
}: ComponentPropsWithoutRef<"th"> & { id: string }) {
  return <th {...projectFinancialHeaderAttributes(id)} className={className} {...props} />;
}

type ProjectFinancialTableCellProps = ComponentPropsWithoutRef<"td"> & {
  headerId: string;
  label: string;
};

export function ProjectFinancialTableCell({
  children,
  className,
  headerId,
  label,
  ...props
}: ProjectFinancialTableCellProps) {
  return (
    <td
      {...projectFinancialCellAttributes(headerId)}
      className={cn(projectFinancialCellClass, className)}
      {...props}
    >
      <span aria-hidden="true" className={projectFinancialCellLabelClass}>
        {label}
      </span>
      <div className="min-w-0 max-xl:[overflow-wrap:anywhere]">{children}</div>
    </td>
  );
}
