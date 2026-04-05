"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  /** Primary action (e.g. "Delete"). Uses danger variant when destructive. */
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  /** Use danger button style for confirm. */
  destructive?: boolean;
  /** Disable confirm while async onConfirm is running. */
  loading?: boolean;
  /**
   * When true (default), closes the dialog immediately on confirm, then runs onConfirm.
   * Parent should perform optimistic UI updates inside onConfirm and handle rollback on failure.
   */
  dismissBeforeAsync?: boolean;
  children?: React.ReactNode;
  className?: string;
}

/** Simple confirmation modal. Minimal design, consistent action buttons. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  destructive,
  loading = false,
  dismissBeforeAsync = true,
  children,
  className,
}: ConfirmDialogProps) {
  const [busy, setBusy] = React.useState(false);
  const isBusy = loading || busy;

  const handleConfirm = () => {
    if (dismissBeforeAsync) {
      onOpenChange(false);
      void Promise.resolve(onConfirm()).catch((err) => {
        console.error("[ConfirmDialog] onConfirm failed:", err);
      });
      return;
    }
    void (async () => {
      setBusy(true);
      try {
        await Promise.resolve(onConfirm());
        onOpenChange(false);
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-sm border-border/60 p-5 shadow-[var(--shadow-1)] rounded-md",
          className
        )}
      >
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-sm text-muted-foreground">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        {children}
        <DialogFooter className="gap-2 pt-3">
          <Button
            variant="outline"
            size="default"
            className="btn-outline-ghost"
            onClick={() => onOpenChange(false)}
            disabled={isBusy}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "outline" : "default"}
            className={destructive ? "btn-outline-destructive" : undefined}
            size="default"
            onClick={handleConfirm}
            disabled={isBusy}
          >
            {isBusy ? "..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
