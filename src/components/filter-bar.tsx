import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FilterBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-2xl border border-zinc-200/70 bg-card p-2.5 sm:flex-row sm:items-center sm:justify-between dark:border-border",
        className
      )}
    >
      {children}
    </div>
  );
}
