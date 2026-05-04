import {
  inferAttachmentPreviewType,
  type AttachmentPreviewFileItem,
} from "@/components/attachment-preview-modal";
import type { ExpenseReceiptItem } from "@/lib/expense-receipt-items";
import { peekCachedReceiptSignedUrl } from "@/lib/receipt-preview-url-cache";

type ShellSource = ExpenseReceiptItem & { attachmentId?: string };

/**
 * Build attachment preview file entries immediately (sync): HTTP URLs and cached signed URLs
 * get a real `url`; otherwise `pendingSignedUrl` is true so the modal can open without waiting.
 */
export function buildReceiptPreviewShellFiles(items: ShellSource[]): AttachmentPreviewFileItem[] {
  return items.map((it, i) => {
    const raw = (it.url ?? "").trim();
    const name = it.fileName ?? `File ${i + 1}`;
    if (!raw) {
      const empty: AttachmentPreviewFileItem = {
        url: "",
        fileName: name,
        fileType: inferAttachmentPreviewType(name, ""),
      };
      return it.attachmentId ? { ...empty, attachmentId: it.attachmentId } : empty;
    }
    if (raw.startsWith("blob:")) {
      const blobItem: AttachmentPreviewFileItem = {
        url: raw,
        fileName: name,
        fileType: inferAttachmentPreviewType(name, raw),
      };
      return it.attachmentId ? { ...blobItem, attachmentId: it.attachmentId } : blobItem;
    }
    const cached = peekCachedReceiptSignedUrl(raw);
    const http = /^https?:\/\//i.test(raw);
    const url = (cached ?? (http ? raw : "")).trim();
    const pendingSignedUrl = !url && !!raw;
    const base: AttachmentPreviewFileItem = {
      url,
      fileName: name,
      fileType: inferAttachmentPreviewType(name, url || raw),
      pendingSignedUrl,
    };
    return it.attachmentId ? { ...base, attachmentId: it.attachmentId } : base;
  });
}
