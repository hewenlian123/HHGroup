"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ExpenseAttachment } from "@/lib/data";

export function AttachmentPreviewDialog({
  attachment,
  open,
  onOpenChange,
}: {
  attachment: ExpenseAttachment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isImage = attachment?.mimeType.startsWith("image/");
  const isPdf = attachment?.mimeType === "application/pdf";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-[95vw] max-h-[95vh] w-full overflow-hidden flex flex-col p-0",
          "sm:max-w-2xl"
        )}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="text-base truncate">{attachment?.fileName ?? "Preview"}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-auto px-6 pb-6 flex items-center justify-center bg-muted/30">
          {attachment && (
            <>
              {isImage && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={attachment.url}
                    alt={attachment.fileName}
                    className="max-w-full max-h-[70vh] w-auto h-auto object-contain"
                  />
                </>
              )}
              {isPdf && (
                <iframe
                  src={attachment.url}
                  title={attachment.fileName}
                  className="w-full h-[70vh] min-h-[400px] rounded-lg border border-zinc-200/60 dark:border-border"
                />
              )}
              {!isImage && !isPdf && (
                <p className="text-sm text-muted-foreground">Preview not available for this file type.</p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
