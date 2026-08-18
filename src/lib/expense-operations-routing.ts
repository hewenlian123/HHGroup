import type { WorkerReceiptStatus } from "@/lib/worker-receipts-db";

export type ExpenseOperationsSearchParams = Record<string, string | string[] | undefined>;
type ExpenseOperationsSearchParamSource =
  | ExpenseOperationsSearchParams
  | Pick<URLSearchParams, "get">;

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

function hasSearchParamGetter(
  params: ExpenseOperationsSearchParamSource
): params is Pick<URLSearchParams, "get"> {
  return typeof (params as Pick<URLSearchParams, "get">).get === "function";
}

function firstWorkerReceiptFilterValue(
  params: ExpenseOperationsSearchParamSource,
  key: (typeof WORKER_RECEIPT_FILTER_KEYS)[number]
): string {
  if (hasSearchParamGetter(params)) return params.get(key)?.trim() ?? "";
  return firstQueryValue(params[key]);
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

export function workerReceiptInboxPath(params: ExpenseOperationsSearchParamSource = {}): string {
  const next = new URLSearchParams();
  for (const key of WORKER_RECEIPT_FILTER_KEYS) {
    const value = firstWorkerReceiptFilterValue(params, key);
    if (value) next.set(key, value);
  }
  const query = next.toString();
  return query ? `/financial/inbox/worker?${query}` : "/financial/inbox/worker";
}
