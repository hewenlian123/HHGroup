"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatEstimateCurrency } from "./estimate-currency";
import { Wallet } from "lucide-react";
import { ProposalScopePreview } from "./proposal-scope-preview";
import { EB } from "./estimate-builder-ui";

export type ProposalPaymentMilestoneRow = {
  id: string;
  title: string;
  amount: number;
  description?: string | null;
  dueDate?: string | null;
};

function formatScheduleDate(value?: string | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString(undefined, { dateStyle: "short" });
}

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
        <p className={cn("text-[14px] leading-snug", EB.paymentEmpty)}>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul className={cn("divide-y divide-white/[0.06]", className)}>
      {milestones.map((m) => {
        const due = formatScheduleDate(m.dueDate);
        const dueLabel = due ? `Due ${due}` : null;
        return (
          <li
            key={m.id}
            className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3 first:pt-1"
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-[14px] font-semibold leading-snug tracking-[-0.01em] text-[#F6F7FA]">
                {m.title.trim() || "—"}
              </p>
              {m.description?.trim() ? (
                <ProposalScopePreview
                  text={m.description}
                  variant="compact"
                  maxBullets={2}
                  className="text-[13px] leading-snug text-[#929CAF]"
                />
              ) : null}
              {dueLabel ? (
                <p className="text-[13px] leading-snug text-[#929CAF]">{dueLabel}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[14px] font-semibold tabular-nums tracking-[-0.01em] text-[#D8DEE8] [font-feature-settings:'tnum']">
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
