"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  cancelLabel?: string;
  children?: React.ReactNode;
  className?: string;
  confirmLabel: string;
  description?: React.ReactNode;
  destructive?: boolean;
  /** @deprecated Confirmation now follows the fail-safe async contract. */
  dismissBeforeAsync?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
}

function confirmationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The action could not be completed. Try again or cancel safely.";
}

/** Canonical consequential-action confirmation with fail-safe async ownership. */
export function ConfirmDialog({
  cancelLabel = "Cancel",
  children,
  className,
  confirmLabel,
  description,
  destructive,
  loading = false,
  onConfirm,
  onOpenChange,
  open,
  title,
}: ConfirmDialogProps) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const restoreFocusRef = React.useRef<HTMLElement | null>(null);
  const isBusy = loading || busy;

  React.useEffect(() => {
    if (open) return;
    const rememberFocus = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement) restoreFocusRef.current = event.target;
    };
    if (
      !restoreFocusRef.current &&
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
    ) {
      restoreFocusRef.current = document.activeElement;
    }
    document.addEventListener("focusin", rememberFocus);
    return () => document.removeEventListener("focusin", rememberFocus);
  }, [open]);

  React.useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (isBusy && !nextOpen) return;
    if (!nextOpen) setError(null);
    onOpenChange(nextOpen);
  };

  const handleConfirm = async () => {
    if (isBusy) return;
    setError(null);
    setBusy(true);
    try {
      await Promise.resolve(onConfirm());
      onOpenChange(false);
    } catch (cause) {
      setError(confirmationErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        closeDisabled={isBusy}
        className={cn(
          "max-w-sm border-[var(--hh-border-strong)] bg-[var(--hh-l5-task-surface)] text-[var(--hh-text-primary)] shadow-task",
          destructive && "border-[var(--hh-danger-border)]",
          className
        )}
        onEscapeKeyDown={(event) => {
          if (isBusy) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (isBusy) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (isBusy) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          const focusTarget = restoreFocusRef.current;
          if (!focusTarget?.isConnected) return;
          event.preventDefault();
          focusTarget.focus({ preventScroll: true });
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        {error ? (
          <p
            role="alert"
            className="rounded-hh-standard border border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] p-hh-3 text-hh-error text-[var(--hh-danger)]"
          >
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="quiet"
            onClick={() => handleOpenChange(false)}
            disabled={isBusy}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "primary"}
            onClick={() => void handleConfirm()}
            disabled={isBusy}
            aria-busy={isBusy || undefined}
          >
            {isBusy ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
