export type WorkerReturnTab = "receipts" | "advances" | "payments" | "statements";
export type WorkforceReturnTab =
  | "overview"
  | "payroll"
  | "balances"
  | "payments"
  | "advances"
  | "reimbursements"
  | "statements";

export function workerDetailReturnPath(workerId: string, tab: WorkerReturnTab): string {
  return `/workers/${encodeURIComponent(workerId)}?tab=${tab}`;
}

export function encodeWorkerReturnPath(workerId: string, tab: WorkerReturnTab): string {
  return encodeURIComponent(workerDetailReturnPath(workerId, tab));
}

export function workforceReportsReturnPath(tab: WorkforceReturnTab): string {
  return `/reports/workforce?tab=${encodeURIComponent(tab)}`;
}

export function workerDetailPathWithReturnTo(workerId: string, returnTo: string): string {
  return `/workers/${encodeURIComponent(workerId)}?returnTo=${encodeURIComponent(returnTo)}`;
}

export function safeWorkerReturnPath(
  value: string | null | undefined,
  fallback = "/workers"
): string {
  const raw = String(value ?? "").trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  try {
    const parsed = new URL(raw, "http://hh.local");
    if (parsed.origin !== "http://hh.local") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
