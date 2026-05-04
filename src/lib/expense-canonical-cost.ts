import { INBOX_UPLOAD_REF_PREFIX } from "@/lib/inbox-upload-constants";

/** Status values where an inbox-upload row may affect canonical project cost (non-draft pipeline). */
const TERMINAL_COST_STATUSES = new Set([
  "reviewed",
  "approved",
  "paid",
  "reimbursed",
  "reimbursable",
  "done",
  "completed",
]);

/**
 * Whether an expense's lines should be summed into canonical project cost / profit.
 * - Always excludes `draft`.
 * - Rows created by the inbox upload flow (`reference_no` starts with INBOX-UP-) count only after a terminal status (e.g. approved).
 * - All other rows keep legacy behavior (count regardless of needs_review, unless draft).
 */
export function expenseCountsTowardCanonicalProjectCost(row: {
  status?: string | null;
  reference_no?: string | null;
}): boolean {
  const st = String(row.status ?? "")
    .trim()
    .toLowerCase();
  if (st === "draft") return false;
  const ref = String(row.reference_no ?? "").trim();
  if (ref.startsWith(INBOX_UPLOAD_REF_PREFIX)) {
    return TERMINAL_COST_STATUSES.has(st);
  }
  return true;
}
