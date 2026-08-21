import * as React from "react";

import { amountClass, type AmountTone } from "@/lib/typography";
import { cn } from "@/lib/utils";

export interface FinancialTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  align?: "start" | "end";
  tone?: AmountTone;
}

/** FIN-aligned operational amount; callers retain ownership of financial meaning. */
export const FinancialText = React.forwardRef<HTMLSpanElement, FinancialTextProps>(
  ({ align, className, tone = "neutral", ...props }, ref) => (
    <span
      ref={ref}
      className={cn("hh-fin", amountClass(tone), align === "end" && "text-right", className)}
      {...props}
    />
  )
);
FinancialText.displayName = "FinancialText";
