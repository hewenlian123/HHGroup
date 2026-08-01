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
    <div className="grid gap-3 md:hidden">
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
    <NeoMobileCard className="flex min-h-[76px] items-start gap-3 p-3">
      <Link
        href={href}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)]"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--neo-text-primary)]">
            {row.number}
          </p>
          <p className="mt-1 truncate text-xs text-[var(--neo-text-secondary)]">
            {row.client} · {row.project}
          </p>
          <div className="mt-2">
            <EstimateListStatus status={row.status} />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <NeoAmount className="text-sm">{formatEstimateCurrency(row.total)}</NeoAmount>
        </div>
      </Link>
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
      className={cn("group", listTableRowClassName)}
      onClick={() => startTransition(() => router.push(href))}
    >
      <td className={cn(tableRawTdClass, "font-medium")}>
        <Link
          href={href}
          className="block w-full text-[var(--neo-text-primary)] transition-colors hover:text-[var(--neo-gold)] focus:outline-none focus:text-[var(--neo-gold)]"
          onClick={(e) => e.stopPropagation()}
        >
          {row.number}
        </Link>
      </td>
      <td className={tableRawTdClass}>{row.client}</td>
      <td className={tableRawTdClass}>{row.project}</td>
      <td className={tableRawTdClass}>
        <EstimateListStatus status={row.status} />
      </td>
      <td className={cn(tableRawTdClass, "text-right")}>
        <NeoAmount>{formatEstimateCurrency(row.total)}</NeoAmount>
      </td>
      <td className={cn(tableRawTdClass, "whitespace-nowrap text-[var(--neo-text-secondary)]")}>
        {row.updatedAt}
      </td>
      <td className={cn(tableRawTdClass, "w-10 text-right")} onClick={(e) => e.stopPropagation()}>
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
