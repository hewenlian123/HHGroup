"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { EB } from "./estimate-builder-ui";
import {
  DEFAULT_LINE_ITEM_STATUS,
  isDefaultLineItemStatus,
  LINE_ITEM_STATUS_LABELS,
  type EstimateLineItemStatus,
} from "./estimate-line-item-status";

export function EstimateLineItemStatusPill({
  status,
}: {
  status: EstimateLineItemStatus | undefined;
}): React.ReactElement | null {
  const resolved = status ?? DEFAULT_LINE_ITEM_STATUS;
  if (isDefaultLineItemStatus(resolved)) return null;
  return (
    <span className={cn(EB.lineItemStatusPill)} title={LINE_ITEM_STATUS_LABELS[resolved]}>
      {LINE_ITEM_STATUS_LABELS[resolved]}
    </span>
  );
}
