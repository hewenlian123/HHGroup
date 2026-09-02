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
import type {
  PaymentReceivedDeleteDependenciesResult,
  PaymentReceivedDeleteDependency,
} from "@/lib/data";

function dependencyMeta(dep: PaymentReceivedDeleteDependency): string {
  const parts = [
    dep.amount != null ? formatCurrency(Number(dep.amount) || 0) : null,
    dep.date ? formatDate(dep.date) : null,
    dep.status ? `Status: ${dep.status}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function PaymentDeleteDependenciesDialog({
  open,
  onOpenChange,
  dependencies,
  onRefresh,
  checking = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dependencies: PaymentReceivedDeleteDependenciesResult | null;
  onRefresh: () => void;
  checking?: boolean;
}) {
  const blockers = dependencies?.blockers ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-revenue-ar-v2 className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Cannot delete payment yet</DialogTitle>
          <DialogDescription>
            This voided payment is still linked to records that cannot be removed automatically.
            Open and resolve the linked records first, then try deleting again.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {blockers.length === 0 ? (
            <p className="rounded-hh-compact border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              No blocking dependencies were found. Refresh the check and try deleting again.
            </p>
          ) : (
            blockers.map((dep) => {
              const meta = dependencyMeta(dep);
              return (
                <div
                  key={`${dep.type}-${dep.id}`}
                  className="rounded-hh-compact border border-border bg-card px-3 py-3"
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
                    {dep.href ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={dep.href}>Open</Link>
                      </Button>
                    ) : null}
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
