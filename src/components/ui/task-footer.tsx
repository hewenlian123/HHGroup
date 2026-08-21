import * as React from "react";

import { cn } from "@/lib/utils";

type TaskFooterVariant = "dialog" | "sheet" | "sticky";

interface TaskFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: TaskFooterVariant;
}

/** Shared action composition for dialog, sheet, drawer, and sticky task surfaces. */
export function TaskFooter({ className, variant = "dialog", ...props }: TaskFooterProps) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-hh-2 pb-[env(safe-area-inset-bottom)] hh-touch-footer",
        variant === "dialog" &&
          "sticky bottom-0 mt-hh-2 border-t border-[var(--hh-border)] bg-[var(--hh-l5-task-surface)] pt-hh-4 lg:flex-row lg:justify-end lg:[&>button]:w-auto",
        variant === "sheet" && "sm:flex-row sm:justify-end sm:space-x-hh-2 sm:pb-0",
        variant === "sticky" &&
          "sticky bottom-0 z-10 border-t border-[var(--hh-border)] bg-[var(--hh-l5-task-surface)]",
        className
      )}
      {...props}
    />
  );
}
