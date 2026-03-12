"use client";

import { useCallback, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Pencil, Trash2 } from "lucide-react";
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

  const handleDelete = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm("Delete this estimate?")) return;
      const form = (e.currentTarget as HTMLButtonElement).closest("form");
      if (!form) return;
      const formData = new FormData(form);
      startTransition(async () => {
        await deleteAction(formData);
        router.refresh();
      });
    },
    [deleteAction, router]
  );

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
      <TableCell className="w-0 whitespace-nowrap">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg" asChild>
            <Link href={href} onClick={(e) => e.stopPropagation()}>
              <Pencil className="h-4 w-4 text-muted-foreground" aria-label="Edit" />
            </Link>
          </Button>
          <form className="inline-block">
            <input type="hidden" name="estimateId" value={row.id} />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleDelete}
              disabled={isPending}
              aria-label="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </TableCell>
    </TableRow>
  );
}
