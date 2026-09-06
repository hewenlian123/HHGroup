import { safeWorkerReturnPath } from "@/lib/worker-return-path";
import { normalizeWorkforceReportsTab } from "@/app/reports/workforce/workforce-report-tabs";
export const laborSections = [
  { href: "/labor/overview", label: "Overview" },
  { href: "/workers", label: "Workers" },
  { href: "/labor/entries", label: "Time" },
  { href: "/labor/costs", label: "Costs" },
  { href: "/labor/worker-balances", label: "Payments" },
  { href: "/labor/payroll", label: "Payroll" },
] as const;
export const laborPaymentSections = [
  { href: "/labor/worker-balances", label: "Balances" },
  { href: "/labor/payments", label: "Payments" },
  { href: "/labor/advances", label: "Advances" },
  { href: "/labor/reimbursements", label: "Reimbursements" },
] as const;
export function isLaborWorkspace(path: string) {
  return (
    /^(\/labor(?:\/|$)|\/workers(?:\/|$)|\/reports\/workforce$)/.test(path) &&
    !/\/(print|preview)(\/|$)|\/receipt(?:\/|$)/.test(path) &&
    !path.startsWith("/labor/subcontractors")
  );
}
export function laborActiveSection(path: string, tab?: string | null) {
  if (path === "/reports/workforce") tab = normalizeWorkforceReportsTab(tab ?? undefined);
  if (path === "/labor/overview" || (path === "/reports/workforce" && (!tab || tab === "overview")))
    return "Overview";
  if (path.includes("payroll") || (path === "/reports/workforce" && tab === "payroll"))
    return "Payroll";
  if (path.includes("cost")) return "Costs";
  if (
    laborPaymentSections.some((item) => path.startsWith(item.href)) ||
    path.endsWith("/balance") ||
    path === "/reports/workforce" ||
    path.includes("worker-invoices")
  )
    return "Payments";
  if (path.startsWith("/workers") || path.startsWith("/labor/workers")) return "Workers";
  return "Time";
}
export function workerTabHref(path: string, search: string, tab: string) {
  const next = new URLSearchParams(search);
  next.set("tab", tab);
  return `${path}?${next}`;
}

export function laborPaymentHref(href: string, search: string) {
  let context = new URLSearchParams(search);
  const workerId = context.get("workerId");
  if (!workerId) return href;
  const section = laborPaymentSections.find((item) => item.href === href);
  if (!section) return href;
  const returnUrl = new URL(safeWorkerReturnPath(context.get("returnTo"), "/"), "http://hh.local");
  if (returnUrl.pathname === `/workers/${encodeURIComponent(workerId)}`) {
    context.delete("returnTo");
    const source = returnUrl.searchParams;
    for (const [key, value] of context) source.set(key, value);
    context = source;
  }
  context.delete("new");
  return workerTabHref(
    `/workers/${encodeURIComponent(workerId)}`,
    context.toString(),
    section.label === "Balances" ? "balance" : section.label.toLowerCase()
  );
}
