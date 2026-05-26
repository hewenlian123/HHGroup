"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type EstimateAutoResizeTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  minHeight?: number;
  maxHeight?: number;
};

export function EstimateAutoResizeTextarea({
  className,
  minHeight = 52,
  maxHeight = 360,
  onChange,
  rows = 1,
  style,
  value,
  ...props
}: EstimateAutoResizeTextareaProps): React.ReactElement {
  const ref = React.useRef<HTMLTextAreaElement | null>(null);

  const resize = React.useCallback(
    (node: HTMLTextAreaElement | null): void => {
      if (!node) return;
      node.style.height = "auto";
      const scrollHeight = node.scrollHeight;
      const nextHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
      node.style.height = `${nextHeight}px`;
      node.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";
    },
    [maxHeight, minHeight]
  );

  React.useLayoutEffect(() => {
    resize(ref.current);
  }, [resize, value]);

  return (
    <textarea
      ref={ref}
      rows={rows}
      value={value}
      onChange={(e) => {
        onChange?.(e);
        resize(e.currentTarget);
      }}
      className={cn("eb-auto-resize-textarea resize-none overflow-hidden", className)}
      style={{ ...style, maxHeight }}
      {...props}
    />
  );
}
