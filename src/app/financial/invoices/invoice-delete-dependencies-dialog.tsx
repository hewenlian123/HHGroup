"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { InvoiceDeleteDependenciesResult, InvoiceDeleteDependency } from "@/lib/data";

function dependencyMeta(dep: InvoiceDeleteDependency): string {
  const parts = [
    dep.amount != null ? formatCurrency(Number(dep.amount) || 0) : null,
    dep.date ? formatDate(dep.date) : null,
    dep.status ? `Status: ${dep.status}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function InvoiceDeleteDependenciesDialog({
  open,
  onOpenChange,
  dependencies,
  onRefresh,
  checking = false,
  onUnlinkScheduleItem,
  unlinkingId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dependencies: InvoiceDeleteDependenciesResult | null;
  onRefresh: () => void;
  checking?: boolean;
  onUnlinkScheduleItem?: (scheduleItemId: string) => void;
  unlinkingId?: string | null;
}) {
  const blockers = dependencies?.blockers ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Cannot delete yet</DialogTitle>
          <DialogDescription>
            This voided invoice is still linked to other financial records. Open and resolve the
            linked records first, then try deleting again.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {blockers.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              No blocking dependencies were found. Refresh the check and try deleting again.
            </p>
          ) : (
            blockers.map((dep) => {
              const meta = dependencyMeta(dep);
              const canUnlink =
                dep.type === "estimate_payment_schedule_item" &&
                dep.scheduleItemId &&
                onUnlinkScheduleItem;
              return (
                <div
                  key={`${dep.type}-${dep.id}`}
                  className="rounded-md border border-border bg-card px-3 py-3"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{dep.label}</p>
                      {dep.description ? (
                        <p className="mt-1 text-sm text-muted-foreground">{dep.description}</p>
                      ) : null}
                      {meta ? <p className="mt-1 text-xs text-muted-foreground">{meta}</p> : null}
                      <p className="mt-1 break-all text-xs text-muted-foreground">ID: {dep.id}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {dep.href ? (
                        <Button asChild size="sm" variant="outline">
                          <Link href={dep.href}>Open</Link>
                        </Button>
                      ) : null}
                      {canUnlink ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={Boolean(unlinkingId)}
                          onClick={() => onUnlinkScheduleItem(dep.scheduleItemId!)}
                        >
                          {unlinkingId === dep.scheduleItemId ? (
                            <SubmitSpinner loading className="mr-2" />
                          ) : null}
                          Unlink
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" onClick={onRefresh} disabled={checking}>
            {checking ? <SubmitSpinner loading className="mr-2" /> : null}
            Check again
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
