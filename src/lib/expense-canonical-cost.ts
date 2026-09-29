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
 * - Inbox upload rows (`inbox_capture` or a `reference_no` starting with INBOX-UP-) count only after a terminal status (e.g. approved).
 * - All other rows keep legacy behavior (count regardless of needs_review, unless draft).
 */
export function expenseCountsTowardCanonicalProjectCost(row: {
  status?: string | null;
  reference_no?: string | null;
  /** New inbox captures stay out of profit until approval even after OCR replaces reference_no. */
  inbox_capture?: boolean | null;
}): boolean {
  const st = String(row.status ?? "")
    .trim()
    .toLowerCase();
  if (st === "draft") return false;
  const ref = String(row.reference_no ?? "").trim();
  if (row.inbox_capture === true || ref.startsWith(INBOX_UPLOAD_REF_PREFIX)) {
    return TERMINAL_COST_STATUSES.has(st);
  }
  return true;
}

export function isInboxCaptureColumnMissing(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : String((error as { message?: string } | null)?.message ?? "");
  return /inbox_capture/i.test(message);
}

export function withoutInboxCaptureColumn(columns: string): string {
  return columns
    .replace(/,?\s*inbox_capture\b/g, "")
    .replace(/,\s*,/g, ",")
    .replace(/^\s*,\s*|\s*,\s*$/g, "")
    .trim();
}

export type ExpenseCostIdentityRow = {
  id?: string;
  project_id?: string | null;
  status?: string | null;
  reference_no?: string | null;
  inbox_capture?: boolean | null;
};

type ExpenseIdentityRead = {
  data: ExpenseCostIdentityRow[] | null;
  error: { message?: string } | null;
};

/** Read cost identity, retrying without inbox_capture when that column is not migrated yet. */
export async function readExpenseIdentity(
  run: (columns: string) => PromiseLike<{ data: unknown; error: { message?: string } | null }>,
  columns: string
): Promise<ExpenseIdentityRead> {
  const first = await run(columns);
  const chosen =
    first.error && isInboxCaptureColumnMissing(first.error)
      ? await run(withoutInboxCaptureColumn(columns))
      : first;
  return {
    data: Array.isArray(chosen.data) ? (chosen.data as ExpenseCostIdentityRow[]) : null,
    error: chosen.error,
  };
}
