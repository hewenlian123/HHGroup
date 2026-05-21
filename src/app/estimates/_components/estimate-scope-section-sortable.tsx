"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { EB } from "./estimate-builder-ui";

export type EstimateScopeSortableSectionProps = {
  id: string;
  disabled?: boolean;
  isDropTarget?: boolean;
  children: (dragHandle: React.ReactNode | null) => React.ReactNode;
};

/** Whole scope section block — drag only via handle in section header. */
export function EstimateScopeSortableSection({
  id,
  disabled = false,
  isDropTarget = false,
  children,
}: EstimateScopeSortableSectionProps): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const dragHandle = disabled ? null : (
    <button
      type="button"
      className={EB.scopeSectionDragHandle}
      aria-label="Reorder section"
      {...attributes}
      {...listeners}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <GripVertical className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-estimate-section-id={id}
      data-sortable-over={isDropTarget ? "true" : undefined}
      className={cn(
        EB.categoryGroup,
        EB.scopeSectionSortable,
        isDragging && EB.scopeSectionDragging
      )}
    >
      {children(dragHandle)}
    </div>
  );
}
