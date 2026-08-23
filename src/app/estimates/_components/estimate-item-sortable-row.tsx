"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";

export function EstimateItemSortableRow({
  id,
  lineOrdinal,
  disabled = false,
  children,
}: {
  id: string;
  lineOrdinal: number;
  disabled?: boolean;
  children: (dragHandle: React.ReactNode) => React.ReactNode;
}): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({ id, disabled });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const dragHandle = (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 min-h-7 w-7 min-w-7 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground active:cursor-grabbing",
        disabled && "cursor-wait opacity-50"
      )}
      {...attributes}
      {...listeners}
      aria-label={`Drag to reorder line item ${lineOrdinal}`}
      aria-describedby="estimate-item-move-status"
      disabled={disabled}
    >
      <GripVertical className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative",
        isDragging && "z-20 opacity-55",
        isOver && !isDragging && "border-t-2 border-t-primary"
      )}
      data-item-dragging={isDragging ? "true" : undefined}
      data-item-drop-target={isOver && !isDragging ? "true" : undefined}
    >
      {children(dragHandle)}
    </div>
  );
}
