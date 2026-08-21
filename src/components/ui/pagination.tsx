"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  loading = false,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (nextPage: number) => void;
  loading?: boolean;
  className?: string;
}) {
  const safeTotal = Math.max(0, total);
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const cur = Math.min(Math.max(1, page), totalPages);
  const start = safeTotal === 0 ? 0 : (cur - 1) * safePageSize + 1;
  const end = Math.min(safeTotal, cur * safePageSize);

  return (
    <nav
      aria-label="Pagination"
      aria-busy={loading || undefined}
      className={cn("flex flex-wrap items-center justify-between gap-hh-2 py-hh-3", className)}
    >
      <div className="hh-fin text-hh-metadata text-[var(--neo-text-secondary)]" aria-live="polite">
        {safeTotal === 0 ? "0 results" : `${start}–${end} of ${safeTotal}`}
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading || cur <= 1}
          onClick={() => onPageChange(cur - 1)}
        >
          Previous
        </Button>
        <div
          className="hh-fin text-hh-metadata text-[var(--neo-text-secondary)]"
          aria-current="page"
        >
          Page {cur} / {totalPages}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading || cur >= totalPages}
          onClick={() => onPageChange(cur + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
