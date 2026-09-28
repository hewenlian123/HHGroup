import type { Expense } from "@/lib/data";
export type OperationState = {
  expense_id: string;
  revision: number;
  review_state: "pending" | "approved";
  posted_at: string | null;
};
export type ReviewIssue = {
  id: string;
  expense_id: string;
  kind: string;
  message: string;
  resolution: string | null;
  resolved_at: string | null;
};
export type OperationDetail = {
  expense: Expense;
  state: OperationState | null;
  sources: Array<{ source_kind: string; source_key: string }>;
  issues: ReviewIssue[];
  events: Array<{ id: string; action: string; created_at: string }>;
};
export const expenseOperationsChanged = "hh:expense-operations-changed";
export async function readExpenseOperation(
  id: string,
  signal?: AbortSignal
): Promise<OperationDetail> {
  const response = await fetch(`/api/expenses/${encodeURIComponent(id)}/operations`, {
    cache: "no-store",
    signal,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? "Review information unavailable.");
  return body;
}
export async function transitionExpenseOperation(
  id: string,
  state: OperationState | null,
  action: string,
  payload: Record<string, unknown> = {}
) {
  const response = await fetch(`/api/expenses/${encodeURIComponent(id)}/operations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: crypto.randomUUID(),
      revision: state?.revision ?? 0,
      action,
      payload,
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? "Operation could not be confirmed.");
  window.dispatchEvent(new Event(expenseOperationsChanged));
  return body.state as OperationState;
}
