import { createBrowserClient } from "@/lib/supabase";

type BrowserSupabase = NonNullable<ReturnType<typeof createBrowserClient>>;

/** Copy file to public `receipts` bucket so expenses.receipt_url can render on edit/list without signed URLs. */
async function mirrorFileToReceiptsPublicUrl(
  supabase: BrowserSupabase,
  file: File,
  keySuffix: string
): Promise<string | null> {
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_") || "receipt.jpg";
  const rPath = `receipts/${Date.now()}-${keySuffix}-${safeName}`;
  const { error } = await supabase.storage.from("receipts").upload(rPath, file, {
    contentType: file.type || "application/octet-stream",
    upsert: true,
  });
  if (error) return null;
  const { data } = supabase.storage.from("receipts").getPublicUrl(rPath);
  return data.publicUrl ?? null;
}

export type ExpenseReceiptUploadSlot = {
  previewUrl: string;
  attachmentPath: string | null;
  receiptsPublicUrl: string | null;
  uploadError?: string;
  revoke?: () => void;
  pendingFile?: File;
};

/** Browser upload for expense receipts (server route first, then expense-attachments, then receipts bucket). */
export async function uploadReceiptToStorage(
  supabase: BrowserSupabase,
  file: File,
  keySuffix: string
): Promise<ExpenseReceiptUploadSlot> {
  let serverUploadMessage: string | null = null;
  try {
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch("/api/quick-expense/upload-attachment", {
      method: "POST",
      body: fd,
    });
    let payload: {
      ok?: boolean;
      path?: string;
      signed_url?: string | null;
      public_url?: string | null;
      message?: string;
    } = {};
    try {
      payload = (await res.json()) as typeof payload;
    } catch {
      /* non-JSON */
    }
    if (res.ok && payload.ok && payload.path) {
      const fallbackBlob =
        !payload.signed_url && !payload.public_url ? URL.createObjectURL(file) : null;
      let publicUrl = payload.public_url ?? null;
      if (!publicUrl) {
        publicUrl = await mirrorFileToReceiptsPublicUrl(supabase, file, keySuffix);
      }
      return {
        previewUrl: payload.signed_url || payload.public_url || fallbackBlob || "",
        attachmentPath: payload.path,
        receiptsPublicUrl: publicUrl,
        revoke: fallbackBlob ? () => URL.revokeObjectURL(fallbackBlob) : undefined,
      };
    }
    const m = typeof payload.message === "string" ? payload.message.trim() : "";
    if (m) serverUploadMessage = m;
  } catch {
    /* fall through */
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_") || "receipt.jpg";
  const expPath = `quick-expense/${Date.now()}-${keySuffix}-${safeName}`;
  const { error: expErr } = await supabase.storage
    .from("expense-attachments")
    .upload(expPath, file, {
      contentType: file.type || "image/jpeg",
      upsert: true,
    });
  if (!expErr) {
    const receiptsPublicUrl = await mirrorFileToReceiptsPublicUrl(supabase, file, keySuffix);
    const { data: signed } = await supabase.storage
      .from("expense-attachments")
      .createSignedUrl(expPath, 60 * 60 * 6);
    if (signed?.signedUrl) {
      return {
        previewUrl: signed.signedUrl,
        attachmentPath: expPath,
        receiptsPublicUrl,
      };
    }
    const blob = URL.createObjectURL(file);
    return {
      previewUrl: blob,
      attachmentPath: expPath,
      receiptsPublicUrl,
      revoke: () => URL.revokeObjectURL(blob),
    };
  }
  const rPath = `receipts/${Date.now()}-${keySuffix}-${safeName}`;
  const { error: recErr } = await supabase.storage.from("receipts").upload(rPath, file, {
    contentType: file.type || "image/jpeg",
    upsert: true,
  });
  if (!recErr) {
    const { data: pub } = supabase.storage.from("receipts").getPublicUrl(rPath);
    const u = pub.publicUrl;
    return { previewUrl: u, attachmentPath: null, receiptsPublicUrl: u };
  }
  const blob = URL.createObjectURL(file);
  const detail = serverUploadMessage ? ` Server: ${serverUploadMessage}` : "";
  return {
    previewUrl: blob,
    attachmentPath: null,
    receiptsPublicUrl: null,
    revoke: () => URL.revokeObjectURL(blob),
    pendingFile: file,
    uploadError: `Upload to Supabase Storage failed (bucket/policy/session).${detail}`,
  };
}
