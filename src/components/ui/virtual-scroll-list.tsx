"use client";

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";

type Props = {
  count: number;
  /** Fixed row height in px */
  estimateSize: number;
  className?: string;
  /** Row renderer by index */
  children: (index: number) => React.ReactNode;
};

/**
 * Windowed list for long mobile lists (workers, etc.). Fixed row height for performance.
 */
export function VirtualScrollList({ count, estimateSize, className, children }: Props) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 8,
  });

  const items = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={cn("overflow-auto overscroll-contain", className)}
      style={{ contain: "strict" }}
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {items.map((vi) => (
          <div
            key={vi.key}
            className="left-0 top-0 w-full"
            style={{
              position: "absolute",
              height: vi.size,
              transform: `translateY(${vi.start}px)`,
            }}
          >
            {children(vi.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
