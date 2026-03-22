"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isPreviewableMime } from "@/lib/documents-db";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Signed URL for the file. */
  url: string | null;
  /** MIME type for choosing viewer. */
  mimeType: string | null;
  fileName: string;
};

export function DocumentPreviewModal({ open, onOpenChange, url, mimeType, fileName }: Props) {
  const isPdf = mimeType?.toLowerCase() === "application/pdf";
  const isImage = mimeType?.toLowerCase().startsWith("image/");
  const canPreview = url && isPreviewableMime(mimeType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl border-border/60 p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-2">
          <DialogTitle className="text-sm font-medium truncate">{fileName}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-auto p-4">
          {!canPreview ? (
            <p className="text-sm text-muted-foreground py-4">
              Preview not available for this file type. Use Download to open the file.
            </p>
          ) : isPdf ? (
            <iframe
              src={url}
              title={fileName}
              className="w-full h-[70vh] min-h-[400px] rounded border border-border/60 bg-muted/30"
            />
          ) : isImage ? (
            /* eslint-disable-next-line @next/next/no-img-element -- document URL is dynamic (storage/external) */
            <img
              src={url}
              alt={fileName}
              className="max-w-full max-h-[70vh] object-contain rounded border border-border/60"
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
