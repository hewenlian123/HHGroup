"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SectionHeaderProps {
  label: string;
  /** Optional right-side content (e.g. action link). */
  action?: ReactNode;
  className?: string;
}

/** Small uppercase muted label with divider underneath. Linear-style section header. */
export function SectionHeader({ label, action, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground">
          {label}
        </span>
        {action}
      </div>
      <div className="ui-divider" />
    </div>
  );
}
