"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { OS } from "@/lib/typography";

const skeletonShell = OS.card;

function SkeletonRow({ ledger }: { ledger: boolean }) {
  return (
    <li
      className={cn(
        !ledger && skeletonShell,
        "flex flex-col gap-3 p-3.5 md:flex-row md:items-start md:gap-5",
        ledger
          ? "border-b border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] md:px-4 md:py-3 last:border-b-0"
          : "md:p-4"
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-48 max-w-[70%] rounded-sm" />
        <Skeleton className="h-3 w-full max-w-md rounded-sm" />
      </div>
      <div className="flex flex-wrap gap-2 md:flex-1 md:justify-center">
        <Skeleton className="h-6 w-20 rounded-sm" />
        <Skeleton className="h-6 w-16 rounded-sm" />
        <Skeleton className="h-6 w-24 rounded-sm" />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <Skeleton className="h-5 w-24 rounded-sm" />
        <div className="flex gap-1">
          <Skeleton className="h-7 w-14 rounded-sm" />
          <Skeleton className="h-7 w-12 rounded-sm" />
        </div>
      </div>
    </li>
  );
}

export function ExpensesListSkeleton({
  rows = 8,
  showStatCards = false,
  mode = "default",
}: {
  rows?: number;
  showStatCards?: boolean;
  mode?: "default" | "ledger";
}) {
  const ledger = mode === "ledger";
  return (
    <div
      data-expenses-loading-ledger={ledger ? "" : undefined}
      className={cn("flex flex-col", ledger ? "gap-0" : "gap-3")}
      aria-hidden
    >
      {showStatCards ? (
        ledger ? (
          <div className="flex overflow-hidden rounded-lg border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)]">
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                className="flex min-w-40 flex-1 items-center justify-between gap-3 border-r border-[var(--hh-border)] px-3 py-2.5 last:border-r-0"
              >
                <Skeleton className="h-3 w-16 rounded-sm" />
                <Skeleton className="h-4 w-14 rounded-sm" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className={cn(skeletonShell, "px-3 py-2.5 md:py-3")}>
                <Skeleton className="h-3 w-20 rounded-sm" />
                <Skeleton className="mt-2 h-6 w-16 rounded-sm" />
              </div>
            ))}
          </div>
        )
      ) : null}
      <ul
        className={cn(
          "flex flex-col",
          ledger ? "overflow-hidden border-y border-[var(--hh-border)]" : "gap-2.5"
        )}
      >
        {Array.from({ length: rows }, (_, i) => (
          <SkeletonRow key={i} ledger={ledger} />
        ))}
      </ul>
      <div className={cn("border-t border-[var(--hh-border)] py-2", ledger ? "px-4" : "px-1")}>
        <Skeleton className="h-11 max-w-xs rounded-lg md:h-7" />
      </div>
    </div>
  );
}
