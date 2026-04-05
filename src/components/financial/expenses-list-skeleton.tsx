"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";

function SkeletonRow() {
  return (
    <li className="flex flex-col gap-2 border-b border-border/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-40 max-w-[60%] rounded-sm" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-3 w-16 rounded-sm" />
          <Skeleton className="h-3 w-24 rounded-sm" />
          <Skeleton className="h-3 w-20 rounded-sm" />
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2 sm:text-right">
        <Skeleton className="h-5 w-20 rounded-sm" />
        <Skeleton className="h-3 w-28 rounded-sm" />
      </div>
    </li>
  );
}

export function ExpensesListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div
      className="exp-list-card overflow-hidden rounded-xl border border-gray-300/60 bg-white/70 backdrop-blur-md dark:border-border/60 dark:bg-card/75"
      aria-hidden
    >
      <ul className="divide-y divide-gray-300/50 dark:divide-border/60">
        {Array.from({ length: rows }, (_, i) => (
          <SkeletonRow key={i} />
        ))}
      </ul>
      <div className="border-t border-gray-300/60 px-4 py-2 dark:border-border/60">
        <Skeleton className="h-7 w-full max-w-xs rounded-sm" />
      </div>
    </div>
  );
}
