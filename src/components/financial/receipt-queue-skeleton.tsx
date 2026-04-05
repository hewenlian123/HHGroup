"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";

function RowSkeleton() {
  return (
    <div className="border-b border-border/50 px-3 py-3 lg:px-4">
      <div className="flex min-w-[700px] items-center gap-3 lg:min-w-[920px]">
        <Skeleton className="h-[52px] w-[52px] shrink-0 rounded-lg" />
        <Skeleton className="h-4 w-14 shrink-0 rounded-sm" />
        <Skeleton className="h-8 min-w-0 flex-1 rounded-sm" />
        <Skeleton className="h-8 w-24 rounded-sm" />
        <Skeleton className="h-8 w-28 rounded-sm" />
        <Skeleton className="h-8 w-32 rounded-sm" />
        <Skeleton className="h-8 w-24 rounded-sm" />
        <Skeleton className="h-8 w-28 rounded-sm" />
        <Skeleton className="h-8 w-24 rounded-sm" />
      </div>
    </div>
  );
}

export function ReceiptQueueSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-28 rounded-sm" />
        <Skeleton className="h-9 w-32 rounded-sm" />
      </div>
      <div className="overflow-x-auto border-b border-border/60">
        {Array.from({ length: rows }, (_, i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
