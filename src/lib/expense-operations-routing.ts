import type { WorkerReceiptStatus } from "@/lib/worker-receipts-db";

export type ExpenseOperationsSearchParams = Record<string, string | string[] | undefined>;

const WORKER_RECEIPT_FILTER_KEYS = [
  "project_id",
  "workerId",
  "status",
  "date_from",
  "date_to",
] as const;

function firstQueryValue(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.trim() ?? "";
}

export function normalizeWorkerReceiptStatusFilter(
  value: string | string[] | undefined
): WorkerReceiptStatus | "" {
  const normalized = firstQueryValue(value).toLowerCase();
  if (normalized === "pending") return "Pending";
  if (normalized === "approved") return "Approved";
  if (normalized === "rejected") return "Rejected";
  if (normalized === "paid") return "Paid";
  return "";
}

export function workerReceiptInboxPath(params: ExpenseOperationsSearchParams = {}): string {
  const next = new URLSearchParams();
  for (const key of WORKER_RECEIPT_FILTER_KEYS) {
    const value = firstQueryValue(params[key]);
    if (value) next.set(key, value);
  }
  const query = next.toString();
  return query ? `/financial/inbox/worker?${query}` : "/financial/inbox/worker";
}
