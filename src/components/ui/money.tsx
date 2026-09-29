import type { HTMLAttributes } from "react";

import { formatOverviewMoney } from "@/lib/financial/project-overview-display";
import { cn } from "@/lib/utils";

/**
 * Display money only. Two decimals, U+2212 negatives.
 * Does not derive or round a new financial total.
 */
export function Money({
  value,
  sign = "auto",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  value: number | null | undefined;
  sign?: "auto" | "always";
}) {
  return (
    <span className={cn("hh-fin tabular-nums", className)} {...props}>
      {formatOverviewMoney(value, { sign })}
    </span>
  );
}
