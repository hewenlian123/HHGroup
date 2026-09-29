import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/** Invoice detail and project overview card language. */
export const sectionCardClass =
  "overflow-hidden rounded-card border border-[var(--hh-line)] bg-[var(--hh-surface)] text-[var(--hh-text)] shadow-card";

export function SectionCard({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn(sectionCardClass, className)} {...props} />;
}
