import { createBrowserClient } from "@/lib/supabase";

type BrowserSupabase = NonNullable<ReturnType<typeof createBrowserClient>>;

/** Quick Expense UI / retry — optional metadata (not persisted to DB). */
export type ReceiptSlotUploadUi = "preparing" | "uploading" | "uploaded" | "failed";

export type ExpenseReceiptUploadSlot = {
  previewUrl: string;
  attachmentPath: string | null;
  receiptsPublicUrl: string | null;
  storedFileName?: string;
  storedMimeType?: string;
  storedSize?: number;
  uploadError?: string;
  revoke?: () => void;
  pendingFile?: File;
  clientId?: string;
  localPreviewUrl?: string;
  displayName?: string;
  isPdf?: boolean;
  uploadUiStatus?: ReceiptSlotUploadUi;
  /** Same file used for retry when upload failed */
  sourceFile?: File;
  /** OCR-prepared derivative. Never used for stored receipt preview. */
  ocrFile?: File;
};

/** Authenticated application upload. The browser never receives Storage write credentials. */
export async function uploadReceiptToStorage(
  _supabase: BrowserSupabase,
  file: File,
  _keySuffix: string
): Promise<ExpenseReceiptUploadSlot> {
  void _supabase;
  void _keySuffix;
  const fileToUpload = file;
  const storedFileName = fileToUpload.name || "receipt";
  const storedMimeType = fileToUpload.type || "application/octet-stream";
  const storedSize = fileToUpload.size || 0;

  try {
    const fd = new FormData();
    fd.set("file", fileToUpload);
    const res = await fetch("/api/quick-expense/upload-attachment", {
      method: "POST",
      body: fd,
    });
    let payload: {
      ok?: boolean;
      path?: string;
      signed_url?: string | null;
      message?: string;
    } = {};
    try {
      payload = (await res.json()) as typeof payload;
    } catch {
      /* non-JSON */
    }
    if (res.ok && payload.ok && payload.path) {
      const fallbackBlob = !payload.signed_url ? URL.createObjectURL(fileToUpload) : null;
      return {
        previewUrl: payload.signed_url || fallbackBlob || "",
        attachmentPath: payload.path,
        receiptsPublicUrl: null,
        storedFileName,
        storedMimeType,
        storedSize,
        revoke: fallbackBlob ? () => URL.revokeObjectURL(fallbackBlob) : undefined,
      };
    }
  } catch {
    // Return a local preview below; never fall back to browser Storage access.
  }

  const blob = URL.createObjectURL(fileToUpload);
  return {
    previewUrl: blob,
    attachmentPath: null,
    receiptsPublicUrl: null,
    storedFileName,
    storedMimeType,
    storedSize,
    revoke: () => URL.revokeObjectURL(blob),
    pendingFile: fileToUpload,
    uploadError: "Receipt upload failed. Sign in again or retry.",
  };
}
