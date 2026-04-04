/**
 * Client-side defaults for expense payment_account_id: vendor memory, last used, card fallback.
 * Safe to import from client components only for localStorage writes; pick* is SSR-safe (returns "").
 */

import type { PaymentAccountRow } from "./payment-accounts-db";

export const EXPENSE_LAST_PAYMENT_ACCOUNT_KEY = "hh.expense-last-payment-account-id";
export const EXPENSE_VENDOR_PAYMENT_MAP_KEY = "hh.expense-vendor-payment-map";
const LEGACY_QUICK_EXPENSE_LAST_KEY = "hh.quick-expense-last-payment-account-id";

export function normalizeVendorPaymentKey(v: string): string {
  return (v || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function readVendorPaymentMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(EXPENSE_VENDOR_PAYMENT_MAP_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    return typeof o === "object" && o !== null && !Array.isArray(o)
      ? (o as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

function readLastPaymentAccountId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return (
      window.localStorage.getItem(EXPENSE_LAST_PAYMENT_ACCOUNT_KEY) ||
      window.localStorage.getItem(LEGACY_QUICK_EXPENSE_LAST_KEY)
    );
  } catch {
    return null;
  }
}

/**
 * 1) Vendor-specific id from local map (if valid)
 * 2) Last selected id (if valid)
 * 3) First account with type `card`
 * 4) First account in list
 */
export function pickDefaultPaymentAccountId(
  rows: PaymentAccountRow[],
  vendorName?: string | null
): string {
  if (rows.length === 0) return "";
  const vKey = normalizeVendorPaymentKey(vendorName ?? "");
  if (vKey) {
    const map = readVendorPaymentMap();
    const fromVendor = map[vKey];
    if (fromVendor && rows.some((r) => r.id === fromVendor)) return fromVendor;
  }
  const stored = readLastPaymentAccountId();
  if (stored && rows.some((r) => r.id === stored)) return stored;
  const card = rows.find((r) => r.type === "card");
  if (card) return card.id;
  return rows[0]?.id ?? "";
}

export function persistLastExpensePaymentAccountId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const t = id.trim();
    if (t) window.localStorage.setItem(EXPENSE_LAST_PAYMENT_ACCOUNT_KEY, t);
    else window.localStorage.removeItem(EXPENSE_LAST_PAYMENT_ACCOUNT_KEY);
  } catch {
    /* ignore */
  }
}

/** Remember which payment account the user prefers for this vendor (normalized key). */
export function rememberExpenseVendorPaymentAccount(
  vendorName: string,
  paymentAccountId: string
): void {
  if (typeof window === "undefined") return;
  const vKey = normalizeVendorPaymentKey(vendorName);
  const id = paymentAccountId.trim();
  if (!vKey || !id) return;
  try {
    const map = readVendorPaymentMap();
    map[vKey] = id;
    window.localStorage.setItem(EXPENSE_VENDOR_PAYMENT_MAP_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
