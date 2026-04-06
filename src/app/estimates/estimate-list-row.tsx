"use client";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import { memo, useCallback, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TableCell, TableRow } from "@/components/ui/table";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
import type { EstimateListItem } from "@/lib/data";
import { EstimateStatusBadge } from "./_components/estimate-status-badge";

type DeleteAction = (formData: FormData) => Promise<void>;

export function EstimateMobileList({
  list,
  deleteAction,
}: {
  list: EstimateListItem[];
  deleteAction: DeleteAction;
}) {
  return (
    <div className="divide-y divide-gray-100 dark:divide-border/60 md:hidden">
      {list.map((row) => (
        <EstimateListRowMobile key={row.id} row={row} deleteAction={deleteAction} />
      ))}
    </div>
  );
}

const EstimateListRowMobile = memo(function EstimateListRowMobile({
  row,
  deleteAction,
}: {
  row: EstimateListItem;
  deleteAction: DeleteAction;
}) {
  const href = `/estimates/${row.id}`;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleDelete = useCallback(() => {
    if (!confirm("Delete this estimate?")) return;
    const formData = new FormData();
    formData.set("estimateId", row.id);
    startTransition(async () => {
      await deleteAction(formData);
      syncRouterNonBlocking(router);
    });
  }, [row.id, deleteAction, router]);

  return (
    <div className="flex min-h-[48px] items-center gap-2 py-2.5">
      <Link
        href={href}
        className="flex min-w-0 flex-1 items-center gap-3 text-left active:bg-muted/30"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{row.number}</p>
          <p className="truncate text-xs text-text-secondary dark:text-muted-foreground">
            {row.client} · {row.project}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-sm font-medium tabular-nums text-foreground">
            ${row.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
          <EstimateStatusBadge status={row.status} />
        </div>
      </Link>
      <RowActionsMenu
        ariaLabel={`Actions for estimate ${row.number}`}
        actions={[
          { label: "View", onClick: () => startTransition(() => router.push(href)) },
          { label: "Delete", onClick: handleDelete, destructive: true, disabled: isPending },
        ]}
      />
    </div>
  );
});

export const EstimateListRow = memo(function EstimateListRow({
  row,
  deleteAction,
}: {
  row: EstimateListItem;
  deleteAction: DeleteAction;
}) {
  const href = `/estimates/${row.id}`;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleDelete = useCallback(() => {
    if (!confirm("Delete this estimate?")) return;
    const formData = new FormData();
    formData.set("estimateId", row.id);
    startTransition(async () => {
      await deleteAction(formData);
      syncRouterNonBlocking(router);
    });
  }, [row.id, deleteAction, router]);

  return (
    <TableRow>
      <TableCell
        className="font-medium cursor-pointer"
        onClick={() => startTransition(() => router.push(href))}
      >
        <Link
          href={href}
          className="block w-full text-foreground hover:underline focus:outline-none focus:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {row.number}
        </Link>
      </TableCell>
      <TableCell className="text-foreground">{row.client}</TableCell>
      <TableCell className="text-foreground">{row.project}</TableCell>
      <TableCell>
        <EstimateStatusBadge status={row.status} />
      </TableCell>
      <TableCell className="text-right tabular-nums font-medium text-foreground">
        ${row.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </TableCell>
      <TableCell className="text-muted-foreground">{row.updatedAt}</TableCell>
      <TableCell className="w-10 text-right" onClick={(e) => e.stopPropagation()}>
        <RowActionsMenu
          ariaLabel={`Actions for estimate ${row.number}`}
          actions={[
            { label: "View", onClick: () => startTransition(() => router.push(href)) },
            { label: "Delete", onClick: handleDelete, destructive: true, disabled: isPending },
          ]}
        />
      </TableCell>
    </TableRow>
  );
});
