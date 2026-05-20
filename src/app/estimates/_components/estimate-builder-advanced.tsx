"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function EstimateBuilderAdvanced({
  title = "Advanced",
  children,
  defaultOpen = false,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}): React.ReactElement {
  return (
    <details
      className={cn("group border-t border-border/15 pt-1", className)}
      open={defaultOpen || undefined}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 py-2 text-[11px] font-normal text-zinc-500 transition-colors hover:text-amber-400/80 md:min-h-8 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="h-3 w-3 shrink-0 transition-transform group-open:rotate-180 opacity-70" />
        {title}
      </summary>
      <div className="space-y-3 border-l border-white/10 pb-1 pl-3 pt-1">{children}</div>
    </details>
  );
}
