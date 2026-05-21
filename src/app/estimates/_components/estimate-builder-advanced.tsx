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
      className={cn("group border-t border-white/[0.08] pt-1", className)}
      open={defaultOpen || undefined}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9EA8B8] transition-colors duration-150 hover:text-[#B5BECC] md:min-h-8 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="h-3 w-3 shrink-0 text-[#929CAF] transition-transform group-open:rotate-180" />
        {title}
      </summary>
      <div className="space-y-3 border-l border-white/[0.06] pb-1 pl-3 pt-1">{children}</div>
    </details>
  );
}
