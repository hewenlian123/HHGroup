"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (nextPage: number) => void;
  className?: string;
}) {
  const safeTotal = Math.max(0, total);
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const cur = Math.min(Math.max(1, page), totalPages);
  const start = safeTotal === 0 ? 0 : (cur - 1) * safePageSize + 1;
  const end = Math.min(safeTotal, cur * safePageSize);

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2 py-3", className)}>
      <div className="text-xs text-muted-foreground tabular-nums">
        {safeTotal === 0 ? "0 results" : `${start}–${end} of ${safeTotal}`}
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={cur <= 1}
          onClick={() => onPageChange(cur - 1)}
        >
          Previous
        </Button>
        <div className="text-xs text-muted-foreground tabular-nums">
          Page {cur} / {totalPages}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={cur >= totalPages}
          onClick={() => onPageChange(cur + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
