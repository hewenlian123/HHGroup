export type HhProjectOsAction = {
  id: string;
  label: string;
  description: string;
  href: string;
  keywords: readonly string[];
};

/**
 * Canonical generic receipt-intake action.
 *
 * Worker receipt reimbursement uploads intentionally use a separate labor route and label.
 */
export const UPLOAD_RECEIPT_ACTION = {
  id: "upload-receipt",
  label: "Upload Receipt",
  description: "Open the Expense Receipt Inbox for OCR and expense processing",
  href: "/financial/inbox",
  keywords: ["upload receipt", "expense receipt", "receipt inbox", "ocr", "expense intake"],
} as const satisfies HhProjectOsAction;
