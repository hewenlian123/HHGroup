import { redirect } from "next/navigation";

/**
 * Public worker entry: /receipt → /upload-receipt
 * Workers use https://hhprojectgroup.com/receipt; no dashboard exposure.
 */
export default function ReceiptEntryPage() {
  redirect("/upload-receipt");
}
