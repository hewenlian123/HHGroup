import type { InvoiceWithDerived } from "@/lib/invoices-db";

/**
 * Display helpers for the project overview.
 * Amounts are the snapshot and invoice fields the page already loads.
 * This module does not derive a new money total.
 */

export type OverviewCostLine = {
  label: string;
  actual: number;
  /** Stored labor budget when it is the same category. Otherwise null. */
  budget: number | null;
};

export type OverviewCostInput = {
  laborCost: number;
  expenseCost: number;
  subcontractCost: number;
  reimbursementCost: number;
  commissionCost: number;
  apCost: number;
  changeOrderCost: number;
  actualCost: number;
};

const CANONICAL_LINES: Array<{
  label: string;
  key: keyof OverviewCostInput;
}> = [
  { label: "Labor", key: "laborCost" },
  { label: "Expenses", key: "expenseCost" },
  { label: "Subcontracts", key: "subcontractCost" },
  { label: "Reimbursements", key: "reimbursementCost" },
  { label: "Commission", key: "commissionCost" },
];

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Snapshot cost categories, in overview order. Actuals are the snapshot fields unchanged. */
export function overviewCostLines(
  snapshot: OverviewCostInput,
  laborBudget?: number | null
): OverviewCostLine[] {
  const lines: OverviewCostLine[] = CANONICAL_LINES.map((line) => ({
    label: line.label,
    actual: snapshot[line.key],
    budget: line.key === "laborCost" ? (finite(laborBudget) ?? null) : null,
  }));
  if (finite(snapshot.apCost) != null && snapshot.apCost !== 0) {
    lines.push({ label: "AP", actual: snapshot.apCost, budget: null });
  }
  if (finite(snapshot.changeOrderCost) != null && snapshot.changeOrderCost !== 0) {
    lines.push({
      label: "Change order cost",
      actual: snapshot.changeOrderCost,
      budget: null,
    });
  }
  return lines;
}

export function overviewCostLinesCoverActual(
  lines: OverviewCostLine[],
  actualCost: number
): boolean {
  if (!Number.isFinite(actualCost)) return false;
  const sum = lines.reduce(
    (total, line) => total + (Number.isFinite(line.actual) ? line.actual : 0),
    0
  );
  return Math.round(sum * 100) === Math.round(actualCost * 100);
}

/** KPI and summary money. Two decimals. Negatives use U+2212. */
export function formatOverviewMoney(
  value: number | null | undefined,
  options?: { sign?: "auto" | "always" }
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  if (value < 0) return `−${formatted}`;
  if (options?.sign === "always" && value > 0) return `+${formatted}`;
  return formatted;
}

export function formatOverviewPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

/** Whole-number progress only. Margins stay on formatOverviewPercent. */
export function formatOverviewProgress(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${Math.round(value)}%`;
}

export function mostUrgentOverdueInvoice(
  invoices: InvoiceWithDerived[]
): InvoiceWithDerived | null {
  let urgent: InvoiceWithDerived | null = null;
  for (const invoice of invoices) {
    if (invoice.computedStatus !== "Overdue" || !(invoice.balanceDue > 0)) continue;
    if (!urgent || invoice.daysOverdue > urgent.daysOverdue) urgent = invoice;
  }
  return urgent;
}
