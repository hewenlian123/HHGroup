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
  const attachmentId = attachment?.id ?? null;
  const attachmentUrl = attachment?.url ?? "";
  const attachmentFileName = attachment?.fileName ?? "Preview";
  const attachmentMimeType = attachment?.mimeType ?? "";

  React.useEffect(() => {
    if (!open) {
      closePreview();
      return;
    }
    if (!attachmentId) return;
    const isImage = attachmentMimeType.startsWith("image/");
    const isPdf = attachmentMimeType === "application/pdf";
    openPreview({
      files: [
        {
          url: attachmentUrl,
          fileName: attachmentFileName,
          fileType: isPdf ? "pdf" : "image",
          unsupported: !isImage && !isPdf,
        },
      ],
      initialIndex: 0,
      onClosed: () => onOpenChange(false),
    });
  }, [
    open,
    attachmentId,
    attachmentUrl,
    attachmentFileName,
    attachmentMimeType,
    openPreview,
    closePreview,
    onOpenChange,
  ]);

  return null;
}
