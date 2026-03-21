"use client";

import { syncRouterAndClients } from "@/lib/sync-router-client";
import { useCallback, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TableCell, TableRow } from "@/components/ui/table";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
import type { EstimateListItem } from "@/lib/data";
import { EstimateStatusBadge } from "./_components/estimate-status-badge";

type DeleteAction = (formData: FormData) => Promise<void>;

export function EstimateListRow({
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
      void syncRouterAndClients(router);
    });
  }, [row.id, deleteAction, router]);

  return (
    <TableRow className="border-b border-zinc-100/50 dark:border-border/30 hover:bg-zinc-50/30 dark:hover:bg-muted/5">
      <TableCell className="font-medium cursor-pointer" onClick={() => router.push(href)}>
        <Link href={href} className="block w-full text-foreground hover:underline focus:outline-none focus:underline" onClick={(e) => e.stopPropagation()}>
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
            { label: "View", onClick: () => router.push(href) },
            { label: "Delete", onClick: handleDelete, destructive: true, disabled: isPending },
          ]}
        />
      </TableCell>
    </TableRow>
  );
}
