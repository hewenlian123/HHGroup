import { safeWorkerReturnPath } from "@/lib/worker-return-path";

/** Finance navigation carries a station's complete URL; business state stays in its existing store. */
export function financeReturnPath(value: string | null | undefined, fallback: string): string {
  return safeWorkerReturnPath(value, fallback);
}

export function financePathWithReturn(
  destination: string,
  returnTo: string | null | undefined,
  selectedRecord?: string
): string {
  const source = financeReturnPath(returnTo, "");
  if (!source) return destination;
  const url = new URL(destination, "http://hh.local");
  const origin = new URL(source, "http://hh.local");
  if (selectedRecord) origin.searchParams.set("selectedRecord", selectedRecord);
  url.searchParams.set(
    "returnTo",
    selectedRecord ? `${origin.pathname}${origin.search}${origin.hash}` : source
  );
  return `${url.pathname}${url.search}${url.hash}`;
}

export function financeReturnLabel(path: string): string {
  const pathname = new URL(financeReturnPath(path, "/financial"), "http://hh.local").pathname;
  const sources: [string, string][] = [
    ["/financial/payables/payments", "outgoing payments"],
    ["/financial/ar", "AR"],
    ["/financial/payables", "Payables"],
    ["/financial/invoices", "Invoices"],
    ["/bills", "Bills"],
    ["/financial/bank", "reconciliation"],
    ["/financial/deposits", "Deposits"],
    ["/financial/payments", "Payments"],
    ["/financial/inbox", "Inbox"],
    ["/financial/expenses", "Expenses"],
    ["/vendors", pathname === "/vendors" ? "Vendors" : "vendor"],
    ["/customers", "customer"],
    ["/financial/owner", "Owner"],
    ["/owner", "Owner"],
    ["/reports", "report"],
    ["/financial/reports", "report"],
    ["/projects", "project workspace"],
    ["/financial/accounts", "Accounts"],
  ];
  return `Back to ${sources.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] ?? "source"}`;
}

/** Preserve a workspace query across canonical/legacy route boundaries. */
export function financeWorkspacePath(
  pathname: string,
  query: Record<string, string | string[] | undefined>
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      params.append(key, item);
    }
  }
  return `${pathname}${params.size ? `?${params}` : ""}`;
}

/** Only URL-opened actions return to an external parent; local modals keep their workspace. */
export function financePaymentActionReturn(
  current: string,
  action: "invoiceId" | "editPayment"
): string {
  const url = new URL(financeReturnPath(current, "/financial/payments"), "http://hh.local");
  if (url.searchParams.has(action)) {
    const parent = financeReturnPath(url.searchParams.get("returnTo"), "");
    if (parent) return parent;
    url.searchParams.delete(action);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Change only the record selector; workspace filters and parent context remain intact. */
export function financeRecordPath(
  current: string,
  key: "billDetail" | "paymentDetail",
  id: string | null
): string {
  const url = new URL(financeReturnPath(current, "/financial"), "http://hh.local");
  if (id) url.searchParams.set(key, id);
  else url.searchParams.delete(key);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function financeBillEditReturn(id: string, returnTo: string | null): string {
  const source = financeReturnPath(returnTo, "");
  if (source && new URL(source, "http://hh.local").searchParams.get("billDetail") === id)
    return source;
  return financePathWithReturn(`/bills/${id}`, source);
}
