"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatEstimateCurrency } from "./estimate-currency";
import { ProposalScopePreview } from "./proposal-scope-preview";

export type ProposalPaymentMilestoneRow = {
  id: string;
  title: string;
  amount: number;
  description?: string | null;
  dueDate?: string | null;
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
      <p className={cn("py-6 text-center text-sm text-zinc-500", className)}>{emptyMessage}</p>
    );
  }

  return (
    <ul className={cn("divide-y divide-white/[0.06]", className)}>
      {milestones.map((m) => {
        const due =
          m.dueDate?.trim() &&
          (() => {
            try {
              return new Date(m.dueDate).toLocaleDateString(undefined, {
                dateStyle: "short",
              });
            } catch {
              return m.dueDate;
            }
          })();
        const dueLabel = due ? `Due ${due}` : null;
        return (
          <li
            key={m.id}
            className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3 first:pt-1"
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-sm font-semibold tracking-tight text-zinc-100">
                {m.title.trim() || "—"}
              </p>
              {m.description?.trim() ? (
                <ProposalScopePreview
                  text={m.description}
                  variant="compact"
                  maxBullets={2}
                  className="text-xs text-zinc-500"
                />
              ) : null}
              {dueLabel ? <p className="text-xs text-zinc-500">{dueLabel}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-semibold tabular-nums tracking-tight text-zinc-100">
                {formatEstimateCurrency(m.amount)}
              </span>
              {actions ? actions(m) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
