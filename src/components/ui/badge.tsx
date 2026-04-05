import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-brand-primary/25",
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-text-primary text-white dark:bg-zinc-100 dark:text-zinc-900",
        secondary:
          "border border-transparent bg-page text-text-secondary dark:bg-zinc-800 dark:text-zinc-300",
        destructive:
          "border border-transparent bg-[#FEE2E2] text-[#991B1B] dark:bg-red-950/40 dark:text-red-300",
        outline:
          "border-[0.5px] border-gray-300 bg-card text-text-primary dark:border-zinc-700 dark:text-zinc-300",
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
