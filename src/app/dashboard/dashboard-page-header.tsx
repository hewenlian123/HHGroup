import type { ReactNode } from "react";

import { formatDate } from "@/lib/formatters";
import { TYPO } from "@/lib/typography";
import { cn } from "@/lib/utils";

/** Static title content shared by the loaded and loading Operations Home. */
export function DashboardPageHeader({ actions }: { actions?: ReactNode }) {
  return (
    <header
      data-dashboard-page-header="true"
      className="flex min-w-0 flex-col gap-4 md:flex-row md:items-end md:justify-between"
    >
      <div className="min-w-0">
        <h1 className={cn(TYPO.pageTitle, "text-[var(--hh-text-primary)]")}>Operations Home</h1>
        <p className={cn(TYPO.pageSubtitle, "mt-2 max-w-[44rem] text-pretty")}>
          Priorities, guarded project profit, and recent finance activity.
        </p>
      </div>
      <div className="flex min-w-0 flex-col gap-3 md:items-end">
        <time className={cn(TYPO.date, "text-[var(--hh-text-secondary)]")}>
          {formatDate(new Date())}
        </time>
        {actions}
      </div>
    </header>
  );
}
