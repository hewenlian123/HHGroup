"use client";

import * as React from "react";
import { useAttachmentPreview } from "@/contexts/attachment-preview-context";
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
  const { openPreview, closePreview } = useAttachmentPreview();

  React.useEffect(() => {
    if (!open) {
      closePreview();
      return;
    }
    if (!attachment) return;
    const isImage = attachment.mimeType.startsWith("image/");
    const isPdf = attachment.mimeType === "application/pdf";
    openPreview({
      files: [
        {
          url: attachment.url,
          fileName: attachment.fileName ?? "Preview",
          fileType: isPdf ? "pdf" : "image",
          unsupported: !isImage && !isPdf,
        },
      ],
      initialIndex: 0,
      onClosed: () => onOpenChange(false),
    });
  }, [
    open,
    attachment?.id,
    attachment?.url,
    attachment?.fileName,
    attachment?.mimeType,
    openPreview,
    closePreview,
    onOpenChange,
  ]);

  return null;
}
