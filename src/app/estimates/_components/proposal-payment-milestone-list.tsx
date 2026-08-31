"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatEstimateCurrency } from "./estimate-currency";
import { Wallet } from "lucide-react";
import { ProposalScopePreview } from "./proposal-scope-preview";
import { EB } from "./estimate-builder-ui";
import { formatEstimatePaymentDueDate } from "./estimate-payment-date";

export type ProposalPaymentMilestoneRow = {
  id: string;
  title: string;
  amount: number;
  description?: string | null;
  dueDate?: string | null;
  status?: string | null;
};

export function ProposalPaymentMilestoneList({
  milestones,
  emptyMessage = "No payment milestones yet.",
  actions,
  className,
}: {
  milestones: ProposalPaymentMilestoneRow[];
  emptyMessage?: string;
  actions?: (milestone: ProposalPaymentMilestoneRow) => React.ReactNode;
  className?: string;
}): React.ReactElement {
  if (milestones.length === 0) {
    return (
      <div className={cn(EB.paymentEmptyBox, className)}>
        <Wallet className={cn("h-5 w-5", EB.paymentEmptyIcon)} aria-hidden />
        <p className={cn("text-hh-body leading-snug", EB.paymentEmpty)}>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul className={cn("eb-payment-milestone-list space-y-2", className)}>
      {milestones.map((m) => {
        const due = formatEstimatePaymentDueDate(m.dueDate);
        const dueLabel = due ? `Due: ${due}` : null;
        return (
          <li
            key={m.id}
            id={`estimate-payment-milestone-${m.id}`}
            data-estimate-payment-milestone-id={m.id}
            tabIndex={-1}
            className="eb-payment-milestone-row flex flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-md px-0 py-2.5"
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-hh-body font-semibold leading-snug tracking-normal text-foreground">
                  {m.title.trim() || "—"}
                </p>
                {m.status ? (
                  <span className="rounded-sm border border-border bg-muted/60 px-1.5 py-0.5 text-hh-status font-medium capitalize leading-none text-muted-foreground">
                    {m.status}
                  </span>
                ) : null}
              </div>
              {m.description?.trim() ? (
                <ProposalScopePreview
                  text={m.description}
                  variant="compact"
                  maxBullets={2}
                  className="text-hh-table-cell leading-snug text-muted-foreground"
                />
              ) : null}
              {dueLabel ? (
                <p className="text-hh-table-cell leading-snug text-muted-foreground">{dueLabel}</p>
              ) : null}
            </div>
            <div className="eb-payment-milestone-aside flex shrink-0 items-center gap-2">
              <span className="eb-payment-milestone-amount text-right">
                <span className="block text-hh-status font-medium text-muted-foreground">
                  Milestone amount
                </span>
                <span className="mt-0.5 block text-hh-body font-semibold tabular-nums tracking-normal text-foreground hh-fin">
                  {formatEstimateCurrency(m.amount)}
                </span>
              </span>
              {actions ? actions(m) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
