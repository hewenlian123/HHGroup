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
      className={cn("group border-b border-border/60", className)}
      open={defaultOpen || undefined}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 py-3 text-sm font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
        {title}
      </summary>
      <div className="pb-4 pt-1">{children}</div>
    </details>
  );
}
