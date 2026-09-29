import { uploadReceiptToStorage } from "@/lib/expense-receipt-upload-browser";
import { compressImageFileForReceiptUpload } from "@/lib/image-compress-browser";
import { hawaiiTodayYmd } from "@/lib/hawaii-calendar-date";
import { inboxUploadDedupeReference } from "@/lib/inbox-upload-constants";
import { createBrowserClient } from "@/lib/supabase";

type BrowserSupabase = NonNullable<ReturnType<typeof createBrowserClient>>;

async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type InboxDraftUploadResult =
  | { ok: true; expenseId: string; duplicate: false; referenceNo: string }
  | { ok: true; expenseId: string; duplicate: true; referenceNo: string }
  | { ok: false; message: string };

type InboxDraftAttachmentPayload = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
};

type QuickExpenseApiResponse = {
  ok?: boolean;
  message?: string;
  expense?: { id?: unknown };
};

async function createInboxDraftExpenseViaServer(payload: {
  date: string;
  vendorName: string;
  totalAmount: number;
  receiptUrl: string;
  category: string;
  sourceType: "receipt_upload";
  initialStatus: "draft";
  referenceNo: string;
  idempotencyKey: string;
  attachments: InboxDraftAttachmentPayload[];
}): Promise<{ id: string }> {
  const res = await fetch("/api/financial/expenses/quick-expense", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let body: QuickExpenseApiResponse = {};
  try {
    body = (await res.json()) as QuickExpenseApiResponse;
  } catch {
    body = {};
  }
  const id = body.expense?.id;
  if (!res.ok || !body.ok || typeof id !== "string") {
    throw new Error(body.message || "Could not create draft expense.");
  }
  return { id };
}

/**
 * Upload receipt to storage and create a `draft` expense.
 * File fingerprint dedupe uses `reference_no` and `file_sha256`.
 * OCR is queued on the server (`ocr_status`) and does not depend on this tab staying open.
 */
export async function createInboxDraftFromReceiptFile(
  supabase: BrowserSupabase,
  file: File
): Promise<InboxDraftUploadResult> {
  let prepared: File = file;
  if (file.type.startsWith("image/") && !file.type.includes("svg")) {
    try {
      prepared = await compressImageFileForReceiptUpload(file);
    } catch {
      prepared = file;
    }
  }

  const hash = await sha256Hex(prepared);
  const ref = inboxUploadDedupeReference(hash);

  const { data: existing, error: existErr } = await supabase
    .from("expenses")
    .select("id")
    .eq("reference_no", ref)
    .maybeSingle();
  if (existErr) throw new Error(existErr.message || "Receipt lookup unavailable.");
  let matched = existing;
  if (!matched) {
    const byFingerprint = await supabase
      .from("expenses")
      .select("id")
      .eq("file_sha256", hash)
      .maybeSingle();
    if (
      byFingerprint.error &&
      !/file_sha256|schema cache|does not exist/i.test(byFingerprint.error.message)
    ) {
      throw new Error(byFingerprint.error.message || "Receipt lookup unavailable.");
    }
    if (!byFingerprint.error) matched = byFingerprint.data;
  }
  if (matched && typeof (matched as { id?: string }).id === "string") {
    const attached = await supabase
      .from("attachments")
      .select("id")
      .eq("entity_type", "expense")
      .eq("entity_id", matched.id)
      .limit(1);
    if (attached.error || !Array.isArray(attached.data))
      throw new Error(attached.error?.message || "Receipt attachment lookup unavailable.");
    if (attached.data.length > 0)
      return {
        ok: true,
        expenseId: String(matched.id),
        duplicate: true,
        referenceNo: ref,
      };
    // Expense creation may have committed before metadata failed. Resume the same receipt.
  }

  const slot = await uploadReceiptToStorage(supabase, file, ref);
  const receiptUrl = slot.attachmentPath?.trim() || null;
  if (!receiptUrl || slot.uploadError) {
    return {
      ok: false,
      message: slot.uploadError ?? "Could not upload receipt file.",
    };
  }

  const today = hawaiiTodayYmd();
  const attachmentUrl = slot.attachmentPath?.trim() || receiptUrl;
  const created = await createInboxDraftExpenseViaServer({
    date: today,
    vendorName: "Unknown",
    totalAmount: 0.01,
    receiptUrl: "",
    category: "Other",
    sourceType: "receipt_upload",
    initialStatus: "draft",
    referenceNo: ref,
    idempotencyKey: ref,
    attachments: attachmentUrl
      ? [
          {
            id: `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`,
            fileName: slot.storedFileName || file.name || "receipt",
            mimeType: slot.storedMimeType || file.type || "application/octet-stream",
            size: slot.storedSize || file.size || 0,
            url: attachmentUrl,
            createdAt: new Date().toISOString(),
          },
        ]
      : [],
  });

  return { ok: true, expenseId: created.id, duplicate: false, referenceNo: ref };
}
