import Link from "next/link";
import { Activity, ArrowRight, CircleAlert } from "lucide-react";
import type { RecentTransaction } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/formatters";
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
    <aside className={cn("dashboard-attention-feed min-w-0 rounded-xl p-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-normal text-[var(--hud-muted)]">
            Attention feed
          </p>
          <h2 className="mt-2 text-[1rem] font-semibold leading-tight text-[var(--hud-text)]">
            Next signal
          </h2>
        </div>
        <Activity className="h-4 w-4 shrink-0 text-[var(--hh-warning)]" aria-hidden />
      </div>

      {firstTask ? (
        <div className="mt-4 rounded-lg border border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] p-3">
          <div className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--hh-warning)]" aria-hidden />
            <div className="min-w-0">
              <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--hud-text)]">
                {firstTask.title}
              </p>
              <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-[var(--hud-muted)]">
                {firstTask.meta}
              </p>
            </div>
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-normal text-[var(--hh-warning)]">
            {firstTask.due}
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-[var(--hh-success-border)] bg-[var(--hh-success-soft-fill)] p-3">
          <p className="text-[13px] font-semibold text-[var(--hud-text)]">No urgent signals</p>
          <p className="mt-1 text-[12px] leading-snug text-[var(--hud-muted)]">
            The current dashboard feed has no risk-driven action queued.
          </p>
        </div>
      )}

      <div className="mt-4 border-t border-[var(--hud-line)] pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-normal text-[var(--hud-muted)]">
          Latest movement
        </p>
        {activity ? (
          <div className="mt-3 min-w-0">
            <p className="truncate text-[13px] font-semibold text-[var(--hud-text)]">
              {activity.description}
            </p>
            <div className="mt-1 flex min-w-0 items-center justify-between gap-3 text-[12px] text-[var(--hud-muted)]">
              <span className="truncate">{formatDate(activity.date, "compact")}</span>
              <span className="shrink-0 tabular-nums">{formatCurrency(activity.amount)}</span>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-[12px] leading-snug text-[var(--hud-muted)]">
            No recent transactions returned from the current feed.
          </p>
        )}
      </div>

      <Link
        href="/financial/owner"
        className="dashboard-attention-link mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-[var(--hud-line)] bg-[var(--hud-surface)] px-3 text-[12px] font-semibold text-[var(--hud-text)] transition-colors hover:border-[var(--hh-border-strong)] hover:bg-[var(--hud-surface-muted)]"
      >
        Owner view
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </aside>
  );
}
