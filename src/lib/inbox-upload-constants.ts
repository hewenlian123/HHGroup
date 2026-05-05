/** Prefix for financial inbox upload-draft dedupe (`expenses.reference_no`). Not used by worker or reimbursement flows. */
export const INBOX_UPLOAD_REF_PREFIX = "INBOX-UP-";

/** Whole-token match for technical dedupe strings (64-char hex after prefix). */
const INBOX_UPLOAD_REF_TOKEN = new RegExp(
  `\\b${INBOX_UPLOAD_REF_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[a-fA-F0-9]+\\b`,
  "g"
);

export function inboxUploadDedupeReference(contentSha256Hex: string): string {
  return `${INBOX_UPLOAD_REF_PREFIX}${contentSha256Hex}`;
}

export function isInboxUploadExpenseReference(referenceNo: string | undefined | null): boolean {
  return typeof referenceNo === "string" && referenceNo.startsWith(INBOX_UPLOAD_REF_PREFIX);
}

/**
 * Remove inbox upload dedupe tokens from free text (e.g. notes). Collapses extra whitespace.
 * Does not change upload/inbox creation — use when persisting or rendering user-facing copy.
 */
export function stripInboxUploadNoiseFromText(input: string): string {
  return input.replace(INBOX_UPLOAD_REF_TOKEN, " ").replace(/\s+/g, " ").trim();
}
