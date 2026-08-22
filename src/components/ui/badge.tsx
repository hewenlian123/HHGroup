import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { TYPO } from "@/lib/typography";

const badgeVariants = cva(
  cn("inline-flex items-center rounded-full border px-hh-2 py-0.5", TYPO.chip),
  {
    variants: {
      variant: {
        default:
          "border-[var(--hh-border)] bg-[var(--hh-l3-hover)] text-[var(--hh-text-secondary)]",
        secondary:
          "border-[var(--hh-border)] bg-[var(--hh-l3-hover)] text-[var(--hh-text-secondary)]",
        destructive:
          "border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] text-[var(--hh-danger)]",
        outline: "border-[var(--hh-border-strong)] bg-transparent text-[var(--hh-text-primary)]",
        neutral:
          "border-[var(--hh-border)] bg-[var(--hh-l3-hover)] text-[var(--hh-text-secondary)]",
        success:
          "border-[var(--hh-success-border)] bg-[var(--hh-success-soft-fill)] text-[var(--hh-success)]",
        warning:
          "border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] text-[var(--hh-warning)]",
        information:
          "border-[var(--hh-information-border)] bg-[var(--hh-information-soft-fill)] text-[var(--hh-information)]",
        danger:
          "border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] text-[var(--hh-danger)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
