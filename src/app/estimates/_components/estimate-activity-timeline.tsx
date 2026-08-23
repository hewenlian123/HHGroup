"use client";

import Link from "next/link";
import { Activity, ArrowUpRight } from "lucide-react";

import { formatEstimateActivityEvent, type EstimateActivityEvent } from "@/lib/estimate-activity";
import { cn } from "@/lib/utils";

function formatOccurredAt(value: string): string {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

export function EstimateActivityTimeline({
  events,
  revisionNumber,
  className,
}: {
  events: EstimateActivityEvent[] | null;
  revisionNumber: number;
  className?: string;
}): React.ReactElement {
  return (
    <section
      className={cn(
        "mx-3 mb-4 rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-3 shadow-operational md:mx-4 md:p-4",
        className
      )}
      aria-labelledby="estimate-activity-heading"
      data-testid="estimate-activity-timeline"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--hh-border)] pb-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Activity
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-[var(--hh-text-secondary)]"
          />
          <h2
            id="estimate-activity-heading"
            className="text-sm font-semibold text-[var(--hh-text-primary)]"
          >
            Activity
          </h2>
        </div>
        <span className="shrink-0 text-xs text-[var(--hh-text-tertiary)]">
          Rev {revisionNumber}
        </span>
      </div>

      {events === null ? (
        <p className="py-4 text-sm text-[var(--hh-text-secondary)]" role="status">
          Activity is temporarily unavailable.
        </p>
      ) : events.length === 0 ? (
        <p className="py-4 text-sm text-[var(--hh-text-secondary)]">
          No recorded business activity.
        </p>
      ) : (
        <ol className="divide-y divide-[var(--hh-border)]">
          {events.map((event) => {
            const presentation = formatEstimateActivityEvent(event);
            return (
              <li
                key={event.id}
                className="grid grid-cols-[0.5rem_minmax(0,1fr)] gap-3 py-3 first:pt-3 last:pb-1"
              >
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-2 w-2 rounded-full bg-[var(--hh-action-primary)]"
                />
                <div className="min-w-0">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--hh-text-primary)]">
                        {presentation.title}
                      </p>
                      {presentation.detail ? (
                        <p className="mt-0.5 text-xs text-[var(--hh-text-secondary)]">
                          {presentation.detail}
                        </p>
                      ) : null}
                    </div>
                    <time
                      dateTime={event.occurredAt}
                      className="shrink-0 text-xs tabular-nums text-[var(--hh-text-tertiary)]"
                    >
                      {formatOccurredAt(event.occurredAt)}
                    </time>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--hh-text-secondary)]">
                    <span>{event.actorLabel}</span>
                    {presentation.relatedHref && presentation.relatedLabel ? (
                      <Link
                        href={presentation.relatedHref}
                        className="inline-flex min-h-7 items-center gap-1 font-medium text-[var(--hh-action-primary)] hover:underline"
                      >
                        {presentation.relatedLabel}
                        <ArrowUpRight aria-hidden="true" className="h-3 w-3" />
                      </Link>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
