"use client";

import { memo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  NeoAmount,
  NeoMobileCard,
  NeoStatus,
  RowActionsMenu,
  type StatusBadgeVariant,
} from "@/components/base";
import { tableRawTdClass } from "@/components/ui/table";
import { listTableRowClassName } from "@/lib/list-table-interaction";
import type { EstimateListItem } from "@/lib/data";
import { formatEstimateCurrency } from "./_components/estimate-currency";
import { cn } from "@/lib/utils";

function estimateStatusMeta(status: string): { label: string; variant: StatusBadgeVariant } {
  if (status === "Draft") return { label: "Draft", variant: "muted" };
  if (status === "Sent") return { label: "Sent", variant: "warning" };
  if (status === "Approved") return { label: "Approved", variant: "success" };
  if (status === "Rejected") return { label: "Rejected", variant: "danger" };
  if (status === "Converted") return { label: "Converted to Project", variant: "success" };
  return { label: status || "Unknown", variant: "default" };
}

function estimateRevisionLabel(row: EstimateListItem): string {
  return `${row.number} Rev ${row.revisionNumber ?? 0}`;
}

function EstimateListStatus({ status }: { status: string }) {
  const meta = estimateStatusMeta(status);
  return (
    <NeoStatus
      label={meta.label}
      variant={meta.variant}
      className="text-hh-status h-5 whitespace-nowrap px-2"
    />
  );
}

export function EstimateMobileList({
  list,
  onRequestDelete,
  onCopyPrevious,
}: {
  list: EstimateListItem[];
  onRequestDelete: (row: EstimateListItem) => void;
  onCopyPrevious: (row: EstimateListItem) => void;
}) {
  return (
    <div
      data-testid="estimate-mobile-list"
      className="estimate-list-mobile-grid grid gap-2 lg:hidden"
    >
      {list.map((row) => (
        <EstimateListRowMobile
          key={row.id}
          row={row}
          onRequestDelete={onRequestDelete}
          onCopyPrevious={onCopyPrevious}
        />
      ))}
    </div>
  );
}

const EstimateListRowMobile = memo(function EstimateListRowMobile({
  row,
  onRequestDelete,
  onCopyPrevious,
}: {
  row: EstimateListItem;
  onRequestDelete: (row: EstimateListItem) => void;
  onCopyPrevious: (row: EstimateListItem) => void;
}) {
  const href = `/estimates/${row.id}`;
  const revisionLabel = estimateRevisionLabel(row);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <NeoMobileCard className="estimate-list-mobile-card flex min-h-[84px] items-start gap-1.5 p-3">
      <Link
        href={href}
        className="estimate-list-mobile-link min-w-0 flex-1 rounded-hh-compact text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)]"
      >
        <div className="flex min-w-0 items-baseline justify-between gap-3">
          <p className="text-hh-body-strong truncate text-[var(--hh-text-primary)]">
            {revisionLabel}
          </p>
          <NeoAmount className="hh-fin shrink-0">{formatEstimateCurrency(row.total)}</NeoAmount>
        </div>
        <div className="mt-1.5 min-w-0">
          <p className="text-hh-label truncate text-[var(--hh-text-secondary)]">{row.client}</p>
          <p className="text-hh-metadata truncate text-[var(--hh-text-tertiary)]">{row.project}</p>
          <div className="mt-2 flex min-w-0 items-center gap-2">
            <EstimateListStatus status={row.status} />
            <span aria-hidden="true" className="text-[var(--hh-border-strong)]">
              ·
            </span>
            <time
              data-testid="estimate-mobile-updated"
              className="text-hh-status hh-fin truncate text-[var(--hh-text-tertiary)]"
              dateTime={row.updatedAt}
            >
              {row.updatedAt}
            </time>
          </div>
        </div>
      </Link>
      <RowActionsMenu
        appearance="list"
        className="estimate-list-mobile-actions"
        ariaLabel={`Actions for estimate ${row.number}`}
        actions={[
          { label: "View", onClick: () => startTransition(() => router.push(href)) },
          {
            label: "Copy Previous as Draft",
            onClick: () => onCopyPrevious(row),
            disabled: isPending,
          },
          ...(row.status === "Draft"
            ? [
                {
                  label: "Delete",
                  onClick: () => onRequestDelete(row),
                  destructive: true,
                  disabled: isPending,
                },
              ]
            : []),
        ]}
      />
    </NeoMobileCard>
  );
});

export const EstimateListRow = memo(function EstimateListRow({
  row,
  onRequestDelete,
  onCopyPrevious,
}: {
  row: EstimateListItem;
  onRequestDelete: (row: EstimateListItem) => void;
  onCopyPrevious: (row: EstimateListItem) => void;
}) {
  const href = `/estimates/${row.id}`;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <tr
      className={cn("estimate-list-row group", listTableRowClassName)}
      onClick={() => startTransition(() => router.push(href))}
    >
      <td className={cn(tableRawTdClass, "estimate-list-col-number font-medium")}>
        <Link
          href={href}
          className="estimate-list-number-link block w-full text-[var(--hh-text-primary)] transition-colors duration-150 hover:text-[var(--hh-text-strong)] focus:text-[var(--hh-text-strong)] focus:outline-none focus-visible:underline focus-visible:underline-offset-2"
          onClick={(e) => e.stopPropagation()}
        >
          {row.number}
          {row.isCurrentRevision === false ? (
            <span className="ml-2 text-hh-status font-normal text-[var(--hh-text-tertiary)]">
              Historical
            </span>
          ) : null}
        </Link>
      </td>
      <td className={cn(tableRawTdClass, "estimate-list-col-customer-project")}>
        <span className="estimate-list-customer-project">
          <span
            data-testid="estimate-row-client"
            className="estimate-list-client-name"
            title={row.client}
          >
            {row.client}
          </span>
          <span
            data-testid="estimate-row-project"
            className="estimate-list-project-name"
            title={row.project}
          >
            {row.project}
          </span>
        </span>
      </td>
      <td className={cn(tableRawTdClass, "estimate-list-col-revision")}>
        <span className="estimate-list-revision-label">Rev {row.revisionNumber ?? 0}</span>
      </td>
      <td className={cn(tableRawTdClass, "estimate-list-col-status")}>
        <EstimateListStatus status={row.status} />
      </td>
      <td className={cn(tableRawTdClass, "estimate-list-col-total text-right")}>
        <NeoAmount className="estimate-list-row-total">
          {formatEstimateCurrency(row.total)}
        </NeoAmount>
      </td>
      <td
        className={cn(
          tableRawTdClass,
          "estimate-list-col-updated hh-fin whitespace-nowrap text-[var(--hh-text-secondary)]"
        )}
      >
        <time dateTime={row.updatedAt}>{row.updatedAt}</time>
      </td>
      <td
        className={cn(tableRawTdClass, "estimate-list-col-actions text-right")}
        onClick={(e) => e.stopPropagation()}
      >
        <RowActionsMenu
          appearance="list"
          ariaLabel={`Actions for estimate ${row.number}`}
          actions={[
            { label: "View", onClick: () => startTransition(() => router.push(href)) },
            {
              label: "Copy Previous as Draft",
              onClick: () => onCopyPrevious(row),
              disabled: isPending,
            },
            ...(row.status === "Draft"
              ? [
                  {
                    label: "Delete",
                    onClick: () => onRequestDelete(row),
                    destructive: true,
                    disabled: isPending,
                  },
                ]
              : []),
          ]}
        />
      </td>
    </tr>
  );
});
