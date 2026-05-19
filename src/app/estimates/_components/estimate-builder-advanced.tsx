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
    <details className={cn("group", className)} open={defaultOpen || undefined}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 py-2 text-xs font-medium text-muted-foreground/80 hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" />
        {title}
      </summary>
      <div className="space-y-3 pb-1 pt-2">{children}</div>
    </details>
  );
}
