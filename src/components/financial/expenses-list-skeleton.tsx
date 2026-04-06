"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";

function SkeletonRow() {
  return (
    <li className="flex justify-between items-start gap-4 border-b border-border/50 px-4 py-2.5 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Skeleton className="h-3.5 w-40 max-w-[60%] rounded-sm" />
        <div className="flex flex-wrap gap-1">
          <Skeleton className="h-3 w-16 rounded-sm" />
          <Skeleton className="h-3 w-24 rounded-sm" />
          <Skeleton className="h-3 w-20 rounded-sm" />
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Skeleton className="h-5 w-20 rounded-sm" />
        <Skeleton className="h-3 w-[4.5rem] rounded-sm" />
        <Skeleton className="h-3 w-28 rounded-sm" />
      </div>
    </li>
  );
}

export function ExpensesListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div
      className="exp-list-card overflow-hidden rounded-xl border border-gray-100/60 bg-white/70 backdrop-blur-md dark:border-border/60 dark:bg-card/75"
      aria-hidden
    >
      <ul>
        {Array.from({ length: rows }, (_, i) => (
          <SkeletonRow key={i} />
        ))}
      </ul>
      <div className="border-t border-gray-100/60 px-4 py-2 dark:border-border/60">
        <Skeleton className="h-7 w-full max-w-xs rounded-sm" />
      </div>
    </div>
  );
}
