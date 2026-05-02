"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";

function SkeletonRow() {
  return (
    <li className="flex flex-col gap-3 rounded-sm border border-border/50 bg-card p-3 md:flex-row md:items-start md:gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-48 max-w-[70%] rounded-sm" />
        <Skeleton className="h-3 w-full max-w-md rounded-sm" />
      </div>
      <div className="flex flex-wrap gap-1.5 md:flex-1 md:justify-center">
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
}: {
  rows?: number;
  showStatCards?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {showStatCards ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="rounded-sm border border-border/50 bg-card px-3 py-2.5">
              <Skeleton className="h-3 w-20 rounded-sm" />
              <Skeleton className="mt-2 h-6 w-16 rounded-sm" />
            </div>
          ))}
        </div>
      ) : null}
      <ul className="flex flex-col gap-2">
        {Array.from({ length: rows }, (_, i) => (
          <SkeletonRow key={i} />
        ))}
      </ul>
      <div className="border-t border-border/50 px-1 py-2">
        <Skeleton className="h-7 w-full max-w-xs rounded-sm" />
      </div>
    </div>
  );
}
