"use client";

import * as React from "react";
import { useAttachmentPreview } from "@/contexts/attachment-preview-context";
import { inferAttachmentPreviewType } from "@/components/attachment-preview-modal";
import { isPreviewableMime } from "@/lib/documents-db";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Signed URL for the file. */
  url: string | null;
  /** MIME type for choosing viewer. */
  mimeType: string | null;
  fileName: string;
  isLoading?: boolean;
};

export function DocumentPreviewModal({
  open,
  onOpenChange,
  url,
  mimeType,
  fileName,
  isLoading = false,
}: Props) {
  const { openPreview, closePreview } = useAttachmentPreview();

  React.useEffect(() => {
    if (!open) {
      closePreview();
      return;
    }
    const isPdf = mimeType?.toLowerCase() === "application/pdf";
    const isImage = Boolean(mimeType?.toLowerCase().startsWith("image/"));
    const canPreview = Boolean(url && isPreviewableMime(mimeType));
    const unsupported = Boolean(url && !canPreview);
    const fileType: "image" | "pdf" = isPdf
      ? "pdf"
      : isImage
        ? "image"
        : inferAttachmentPreviewType(fileName, url ?? "");
    openPreview({
      url: url ?? "",
      fileName: fileName || "Document",
      fileType,
      unsupported,
      isLoading: Boolean(isLoading) || (!url && open),
      onClosed: () => onOpenChange(false),
    });
  }, [open, url, mimeType, fileName, isLoading, openPreview, closePreview, onOpenChange]);

  return null;
}
