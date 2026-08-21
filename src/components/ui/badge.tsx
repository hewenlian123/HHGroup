import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { TYPO } from "@/lib/typography";

const badgeVariants = cva(
  cn(
    "inline-flex items-center rounded-full px-2 py-0.5 transition-colors focus:outline-none focus:ring-1 focus:ring-[var(--neo-gold-ring)]",
    TYPO.chip
  ),
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-[var(--neo-graphite-950)] text-white dark:bg-[var(--neo-gold)] dark:text-zinc-950",
        secondary:
          "border border-transparent bg-[var(--neo-surface-muted)] text-[var(--neo-text-secondary)]",
        destructive:
          "border border-transparent bg-[#FEE2E2] text-[#991B1B] dark:bg-red-950/40 dark:text-red-300",
        outline:
          "border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-[var(--neo-text-primary)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
