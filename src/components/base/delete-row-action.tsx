"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "./confirm-dialog";
import { cn } from "@/lib/utils";

export function DeleteRowAction(props: {
  /** Whether row is hovered; use group-hover styles on the button itself. */
  className?: string;
  disabled?: boolean;
  busy?: boolean;
  onDelete: () => Promise<void> | void;
  /** Override dialog copy (defaults to English default). */
  title?: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
}) {
  const {
    className,
    disabled,
    busy,
    onDelete,
    title = "Are you sure you want to delete this record?",
    description,
    confirmLabel = "Delete",
    cancelLabel = "Cancel",
  } = props;

  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        className={cn(
          "h-8 w-8 inline-flex items-center justify-center rounded-sm touch-manipulation text-red-600 hover:text-red-700 hover:bg-red-50/60",
          "transition-colors duration-75 ease-out active:opacity-80",
          className
        )}
        onClick={() => setOpen(true)}
        aria-label="Delete"
        disabled={disabled || busy}
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        destructive
        onConfirm={onDelete}
      />
    </>
  );
}
