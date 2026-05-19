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
      className={cn("group border-t border-border/20 pt-1", className)}
      open={defaultOpen || undefined}
    >
      <summary className="flex cursor-pointer list-none items-center gap-1 py-2 text-[11px] font-normal text-muted-foreground/50 hover:text-muted-foreground/75 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="h-3 w-3 shrink-0 transition-transform group-open:rotate-180 opacity-70" />
        {title}
      </summary>
      <div className="space-y-3 border-l border-border/15 pb-1 pl-3 pt-1">{children}</div>
    </details>
  );
}
