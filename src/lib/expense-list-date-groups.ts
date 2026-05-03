import { getExpenseTotal, type Expense } from "@/lib/data";
import { getExpenseReceiptItems } from "@/lib/expense-receipt-items";

export type ExpenseDateGroup = {
  dateKey: string;
  dateLabel: string;
  rows: Expense[];
  itemCount: number;
  totalAmount: number;
  missingReceiptCount: number;
};

function dateKeyFromExpense(e: Expense): string {
  const d = (e.date ?? "").trim().slice(0, 10);
  return d || "unknown";
}

export function formatExpenseDateGroupLabel(dateKey: string): string {
  if (dateKey === "unknown") return "No date";
  const [y, m, da] = dateKey.split("-").map((x) => Number(x));
  if (!y || !m || !da) return dateKey;
  const dt = new Date(y, m - 1, da);
  if (Number.isNaN(dt.getTime())) return dateKey;
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Group expenses by calendar day (YYYY-MM-DD), newest day first.
 * Preserves incoming row order within each day.
 */
export function buildExpenseDateGroups(rows: Expense[]): ExpenseDateGroup[] {
  if (rows.length === 0) return [];
  const byDate = new Map<string, Expense[]>();
  const order: string[] = [];
  for (const row of rows) {
    const k = dateKeyFromExpense(row);
    if (!byDate.has(k)) {
      byDate.set(k, []);
      order.push(k);
    }
    byDate.get(k)!.push(row);
  }
  order.sort((a, b) => {
    if (a === "unknown") return 1;
    if (b === "unknown") return -1;
    return b.localeCompare(a);
  });
  return order.map((dateKey) => {
    const groupRows = byDate.get(dateKey)!;
    const itemCount = groupRows.length;
    const totalAmount = groupRows.reduce((s, r) => s + getExpenseTotal(r), 0);
    const missingReceiptCount = groupRows.filter(
      (r) => getExpenseReceiptItems(r).length === 0
    ).length;
    return {
      dateKey,
      dateLabel: formatExpenseDateGroupLabel(dateKey),
      rows: groupRows,
      itemCount,
      totalAmount,
      missingReceiptCount,
    };
  });
}

const LS_PREFIX = "hh-expense-date-groups-expanded:v1";

export function readDateGroupExpandedMap(pool: "inbox" | "expenses"): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(`${LS_PREFIX}:${pool}`);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object") return {};
    return p as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function writeDateGroupExpandedMap(
  pool: "inbox" | "expenses",
  patch: Record<string, boolean>
): void {
  if (typeof window === "undefined") return;
  try {
    const prev = readDateGroupExpandedMap(pool);
    window.localStorage.setItem(`${LS_PREFIX}:${pool}`, JSON.stringify({ ...prev, ...patch }));
  } catch {
    /* ignore */
  }
}
