/** Prefix for financial inbox upload-draft dedupe (`expenses.reference_no`). Not used by worker or reimbursement flows. */
export const INBOX_UPLOAD_REF_PREFIX = "INBOX-UP-";

export function inboxUploadDedupeReference(contentSha256Hex: string): string {
  return `${INBOX_UPLOAD_REF_PREFIX}${contentSha256Hex}`;
}

export function isInboxUploadExpenseReference(referenceNo: string | undefined | null): boolean {
  return typeof referenceNo === "string" && referenceNo.startsWith(INBOX_UPLOAD_REF_PREFIX);
}
