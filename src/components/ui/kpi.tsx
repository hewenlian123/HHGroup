import * as React from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TYPO } from "@/lib/typography";

export type KpiTone = "neutral" | "positive" | "negative" | "warning";

const kpiToneClass: Record<KpiTone, string> = {
  neutral: "text-[var(--hh-text-primary)]",
  positive: "text-[var(--hh-success)]",
  negative: "text-[var(--hh-danger)]",
  warning: "text-[var(--hh-warning)]",
};

export interface KpiProps extends React.HTMLAttributes<HTMLDivElement> {
  emphasis?: boolean;
  icon?: React.ReactNode;
  label: React.ReactNode;
  meta?: React.ReactNode;
  tone?: KpiTone;
  value: React.ReactNode;
  valueClassName?: string;
}

/** Canonical operational metric composition; domain meaning stays with callers. */
export function Kpi({
  className,
  emphasis = false,
  icon,
  label,
  meta,
  tone = "neutral",
  value,
  valueClassName,
  ...props
}: KpiProps) {
  return (
    <Card
      className={cn(
        "relative flex min-h-[108px] min-w-0 flex-col overflow-hidden p-hh-panel-standard",
        className
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-hh-3">
        <div className="min-w-0">
          <p className={TYPO.kpiLabel}>{label}</p>
          <p
            className={cn(
              "mt-hh-2 break-words",
              emphasis ? TYPO.kpiTotal : TYPO.kpiValue,
              kpiToneClass[tone],
              valueClassName
            )}
          >
            {value}
          </p>
        </div>
        {icon ? <div className="shrink-0">{icon}</div> : null}
      </div>
      {meta ? <p className={cn("mt-auto pt-hh-2", TYPO.kpiSubtitle)}>{meta}</p> : null}
    </Card>
  );
}
