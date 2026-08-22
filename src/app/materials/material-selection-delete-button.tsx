"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { deleteMaterialSelectionAction } from "@/app/materials/actions";
import { cn } from "@/lib/utils";
import { TYPO } from "@/lib/typography";

export function MaterialSelectionDeleteButton({
  id,
  title,
  className,
}: {
  id: string;
  title: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const confirmDelete = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await deleteMaterialSelectionAction(id);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }

    setOpen(false);
    setBusy(false);
    router.refresh();
  }, [id, router]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          "h-8 rounded-hh-compact border-[var(--hh-danger-border)] px-2 text-[var(--hh-danger)] hover:border-[var(--hh-danger-border)] hover:bg-[var(--hh-danger-soft-fill)] hover:text-[var(--hh-danger)]",
          className
        )}
        aria-label={`Delete ${title}`}
        disabled={busy}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        Delete
      </Button>

      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent className="max-w-sm rounded-hh-task border-[var(--hh-danger-border)] bg-[var(--hh-l5-task-surface)] p-5 text-[var(--hh-text-primary)] shadow-task">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-[var(--hh-text-primary)]">
              Delete material selection?
            </DialogTitle>
            <DialogDescription className={TYPO.mutedText}>
              {`Delete "${title}" and its material items? This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p className="rounded-hh-compact border border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] px-3 py-2 text-sm text-[var(--hh-danger)]">
              {error}
            </p>
          ) : null}
          <DialogFooter className="gap-2 border-t border-[var(--hh-border)] pt-3">
            <Button
              type="button"
              variant="outline"
              size="default"
              className="btn-outline-ghost"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              size="default"
              className="btn-outline-destructive"
              disabled={busy}
              onClick={() => void confirmDelete()}
            >
              {busy ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
