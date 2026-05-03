import type { ExpenseAttachment } from "@/lib/expenses-db";

/** Allowed storage kinds for expense-attachments bucket uploads (modal / detail flows). */
export function storageFileTypeForExpenseUpload(file: File): "image" | "pdf" | null {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return "pdf";
  }
  if (file.type.startsWith("image/")) return "image";
  if (/\.(jpe?g|png|gif|webp)$/i.test(file.name)) return "image";
  return null;
}

/** Payload for `addExpenseAttachment` after a successful `expense-attachments` bucket upload. */
export function buildExpenseAttachmentForUpload(
  file: File,
  storagePath: string
): ExpenseAttachment {
  const ft = storageFileTypeForExpenseUpload(file);
  const mime = (file.type ?? "").trim() || (ft === "pdf" ? "application/pdf" : "image/jpeg");
  return {
    id: crypto.randomUUID(),
    fileName: (file.name ?? "").trim() || (ft === "pdf" ? "document.pdf" : "image.jpg"),
    mimeType: mime,
    size: file.size,
    url: storagePath,
    createdAt: new Date().toISOString().slice(0, 10),
  };
}
