import type { SupabaseClient } from "@supabase/supabase-js";
import { compressImageFileForReceiptUpload } from "@/lib/image-compress-browser";
import type {
  CreatePaymentReceivedAttachmentPayload,
  PaymentAttachmentFileType,
} from "@/lib/payments-received-db";

const PAYMENT_ATTACHMENTS_BUCKET = "payment-attachments";

export type UploadedPaymentAttachment = CreatePaymentReceivedAttachmentPayload & {
  preview_url: string | null;
};

export function paymentAttachmentFileTypeForUpload(file: File): PaymentAttachmentFileType | null {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (file.type.startsWith("image/")) return "image";
  if (/\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name)) return "image";
  return null;
}

function safeStorageName(name: string, fallback: string): string {
  return (name || fallback).replace(/[^a-zA-Z0-9._-]/g, "_") || fallback;
}

function mimeForUpload(file: File, fileType: PaymentAttachmentFileType): string {
  const explicit = (file.type ?? "").trim();
  if (explicit) return explicit;
  return fileType === "pdf" ? "application/pdf" : "image/jpeg";
}

export async function uploadPaymentAttachmentToStorage(
  supabase: SupabaseClient,
  file: File,
  invoiceId: string,
  keySuffix: string
): Promise<UploadedPaymentAttachment> {
  const fileType = paymentAttachmentFileTypeForUpload(file);
  if (!fileType) throw new Error(`${file.name || "This file"} is not an image or PDF.`);

  const uploadFile = fileType === "image" ? await compressImageFileForReceiptUpload(file) : file;
  const safeInvoiceId = safeStorageName(invoiceId, "unlinked");
  const safeName = safeStorageName(
    uploadFile.name || file.name,
    fileType === "pdf" ? "payment-attachment.pdf" : "payment-attachment.jpg"
  );
  const filePath = `payments-received/${safeInvoiceId}/${Date.now()}-${keySuffix}-${safeName}`;
  const mimeType = mimeForUpload(uploadFile, fileType);

  const { error } = await supabase.storage
    .from(PAYMENT_ATTACHMENTS_BUCKET)
    .upload(filePath, uploadFile, {
      contentType: mimeType,
      upsert: false,
    });
  if (error) throw new Error(error.message ?? "Upload failed.");

  const { data } = await supabase.storage
    .from(PAYMENT_ATTACHMENTS_BUCKET)
    .createSignedUrl(filePath, 60 * 60 * 6);

  return {
    file_url: filePath,
    file_name:
      (file.name ?? "").trim() ||
      (fileType === "pdf" ? "Payment attachment.pdf" : "Payment photo.jpg"),
    mime_type: mimeType,
    size_bytes: uploadFile.size,
    file_type: fileType,
    preview_url: data?.signedUrl ?? null,
  };
}

export async function removeUploadedPaymentAttachment(
  supabase: SupabaseClient,
  fileUrl: string
): Promise<void> {
  const path = fileUrl.trim();
  if (!path || /^(https?:|blob:|data:)/i.test(path)) return;
  await supabase.storage.from(PAYMENT_ATTACHMENTS_BUCKET).remove([path]);
}
