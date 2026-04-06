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
    <div className="flex flex-col gap-3 md:hidden">
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
    <div className="rounded-sm border border-border/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={href}
          className="font-medium text-foreground hover:underline min-h-11 inline-flex items-center"
        >
          {row.number}
        </Link>
        <RowActionsMenu
          ariaLabel={`Actions for estimate ${row.number}`}
          actions={[
            { label: "View", onClick: () => startTransition(() => router.push(href)) },
            { label: "Delete", onClick: handleDelete, destructive: true, disabled: isPending },
          ]}
        />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{row.client}</p>
      <p className="text-sm text-foreground">{row.project}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <EstimateStatusBadge status={row.status} />
        <span className="text-sm font-medium tabular-nums text-foreground">
          ${row.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Updated {row.updatedAt}</p>
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
