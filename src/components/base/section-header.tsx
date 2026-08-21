"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TYPO } from "@/lib/typography";

export interface SectionHeaderProps {
  label?: string;
  title?: string;
  subtitle?: string;
  /** Optional right-side content (e.g. action link). */
  action?: ReactNode;
  className?: string;
}

/** Small uppercase muted label with divider underneath. Linear-style section header. */
export function SectionHeader({ label, title, subtitle, action, className }: SectionHeaderProps) {
  if (title) {
    return (
      <div className={cn("flex items-center justify-between gap-hh-3", className)}>
        <div>
          <h2 className={TYPO.sectionTitle}>{title}</h2>
          {subtitle ? <p className={TYPO.mutedText}>{subtitle}</p> : null}
        </div>
        {action ? <div>{action}</div> : null}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className={TYPO.sectionLabel}>{label}</span>
        {action}
      </div>
      <div className="ui-divider" />
    </div>
  );
}
