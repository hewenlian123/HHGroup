import Link from "next/link";
import { Activity, ArrowRight, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RecentTransaction } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { TYPO } from "@/lib/typography";
import { cn } from "@/lib/utils";

type AttentionTask = { id: string; title: string; meta: string; due: string };

export function DashboardAttentionFeed({
  tasks,
  recentActivity,
  className,
}: {
  tasks: AttentionTask[];
  recentActivity: RecentTransaction[];
  className?: string;
}) {
  const firstTask = tasks[0];
  const activity = recentActivity[0];

  return (
    <aside className={cn("dashboard-attention-feed min-w-0 rounded-hh-standard p-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={cn(TYPO.tableHeader, "uppercase text-[var(--hh-text-secondary)]")}>
            Attention feed
          </p>
          <h2 className={cn(TYPO.sectionTitle, "mt-2")}>Next signal</h2>
        </div>
        <Activity className="h-4 w-4 shrink-0 text-[var(--hh-warning)]" aria-hidden />
      </div>

      {firstTask ? (
        <div className="mt-4 rounded-hh-standard border border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] p-3">
          <div className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--hh-warning)]" aria-hidden />
            <div className="min-w-0">
              <p className={cn(TYPO.bodyStrong, "line-clamp-2")}>{firstTask.title}</p>
              <p className={cn(TYPO.metadata, "mt-1 line-clamp-2")}>{firstTask.meta}</p>
            </div>
          </div>
          <p className={cn(TYPO.chip, "mt-3 uppercase text-[var(--hh-warning)]")}>
            {firstTask.due}
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-hh-standard border border-[var(--hh-success-border)] bg-[var(--hh-success-soft-fill)] p-3">
          <p className={TYPO.bodyStrong}>No urgent signals</p>
          <p className={cn(TYPO.metadata, "mt-1")}>
            The current dashboard feed has no risk-driven action queued.
          </p>
        </div>
      )}

      <div className="mt-4 border-t border-[var(--hh-border)] pt-4">
        <p className={cn(TYPO.tableHeader, "uppercase text-[var(--hh-text-secondary)]")}>
          Latest movement
        </p>
        {activity ? (
          <div className="mt-3 min-w-0">
            <p className={cn(TYPO.bodyStrong, "truncate")}>{activity.description}</p>
            <div
              className={cn(TYPO.metadata, "mt-1 flex min-w-0 items-center justify-between gap-3")}
            >
              <span className="truncate">{formatDate(activity.date, "compact")}</span>
              <span className={cn(TYPO.amount, "shrink-0")}>{formatCurrency(activity.amount)}</span>
            </div>
          </div>
        ) : (
          <p className={cn(TYPO.metadata, "mt-3")}>
            No recent transactions returned from the current feed.
          </p>
        )}
      </div>

      <Button asChild variant="outline" className="dashboard-attention-link mt-4 w-full">
        <Link href="/financial/owner">
          Owner view
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </Button>
    </aside>
  );
}
