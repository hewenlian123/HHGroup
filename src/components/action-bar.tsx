import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ActionBar({
  left,
  right,
  children,
  className,
}: {
  left?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-b border-zinc-200/70 pb-3 sm:flex-row sm:items-center sm:justify-between dark:border-border",
        className
      )}
    >
      {children ?? (
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-2">{left}</div>
          <div className="flex items-center gap-2">{right}</div>
        </>
      )}
    </div>
  );
}
