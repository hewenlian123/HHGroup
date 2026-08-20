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

function EstimateListStatus({ status }: { status: string }) {
  const meta = estimateStatusMeta(status);
  return (
    <NeoStatus
      label={meta.label}
      variant={meta.variant}
      className="h-5 whitespace-nowrap px-2 text-[11px]"
    />
  );
}

export function EstimateMobileList({
  list,
  onRequestDelete,
}: {
  list: EstimateListItem[];
  onRequestDelete: (row: EstimateListItem) => void;
}) {
  return (
    <div
      data-testid="estimate-mobile-list"
      className="estimate-list-mobile-grid grid gap-2 lg:hidden"
    >
      {list.map((row) => (
        <EstimateListRowMobile key={row.id} row={row} onRequestDelete={onRequestDelete} />
      ))}
    </div>
  );
}

const EstimateListRowMobile = memo(function EstimateListRowMobile({
  row,
  onRequestDelete,
}: {
  row: EstimateListItem;
  onRequestDelete: (row: EstimateListItem) => void;
}) {
  const href = `/estimates/${row.id}`;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <NeoMobileCard className="estimate-list-mobile-card flex min-h-[84px] items-start gap-1.5 p-3">
      <Link
        href={href}
        className="estimate-list-mobile-link min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#171717]/15"
      >
        <div className="flex min-w-0 items-baseline justify-between gap-3">
          <p className="truncate text-[14px] font-semibold text-[var(--neo-text-primary)]">
            {row.number}
          </p>
          <NeoAmount className="shrink-0 text-[14px]">
            {formatEstimateCurrency(row.total)}
          </NeoAmount>
        </div>
        <div className="mt-1.5 min-w-0">
          <p className="truncate text-[12px] font-medium leading-4 text-[var(--neo-text-secondary)]">
            {row.client}
          </p>
          <p className="truncate text-[12px] leading-4 text-[var(--neo-text-tertiary)]">
            {row.project}
          </p>
          <div className="mt-2 flex min-w-0 items-center gap-2">
            <EstimateListStatus status={row.status} />
            <span aria-hidden="true" className="text-[var(--neo-border-strong)]">
              ·
            </span>
            <time
              data-testid="estimate-mobile-updated"
              className="truncate text-[11px] tabular-nums text-[var(--neo-text-tertiary)]"
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
            label: "Delete",
            onClick: () => onRequestDelete(row),
            destructive: true,
            disabled: isPending,
          },
        ]}
      />
    </NeoMobileCard>
  );
});

export const EstimateListRow = memo(function EstimateListRow({
  row,
  onRequestDelete,
}: {
  row: EstimateListItem;
  onRequestDelete: (row: EstimateListItem) => void;
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
          className="estimate-list-number-link block w-full text-[var(--neo-text-primary)] transition-colors duration-150 hover:text-black focus:outline-none focus:text-black focus-visible:underline focus-visible:underline-offset-2"
          onClick={(e) => e.stopPropagation()}
        >
          {row.number}
        </Link>
      </td>
      <td className={cn(tableRawTdClass, "estimate-list-col-client")}>
        <span
          data-testid="estimate-row-client"
          className="estimate-list-client-name"
          title={row.client}
        >
          {row.client}
        </span>
      </td>
      <td className={cn(tableRawTdClass, "estimate-list-col-project")}>
        <span
          data-testid="estimate-row-project"
          className="estimate-list-project-name"
          title={row.project}
        >
          {row.project}
        </span>
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
          "estimate-list-col-updated whitespace-nowrap text-[var(--neo-text-secondary)]"
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
              label: "Delete",
              onClick: () => onRequestDelete(row),
              destructive: true,
              disabled: isPending,
            },
          ]}
        />
      </td>
    </tr>
  );
});
