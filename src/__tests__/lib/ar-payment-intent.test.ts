import { expect, it } from "vitest";
import {
  getArPaymentIntent,
  beginArPaymentIntent,
  clearArPaymentIntent,
} from "@/lib/ar-payment-intent";
const memory = () => {
  const rows = new Map<string, string>();
  return {
    getItem: (key: string) => rows.get(key) ?? null,
    setItem: (key: string, value: string) => {
      rows.set(key, value);
    },
    removeItem: (key: string) => {
      rows.delete(key);
    },
  };
};
const draft = {
  invoice_id: "invoice",
  customer_name: "Customer",
  payment_date: "2026-09-06",
  amount: 3000,
  payment_method: "ACH",
};
it("reload and duplicate submit reuse the original unresolved payment identity", () => {
  const store = memory();
  const first = beginArPaymentIntent(store, "owner", draft);
  expect(getArPaymentIntent(store, "owner", "invoice")).toEqual(first);
  expect(beginArPaymentIntent(store, "owner", draft)).toEqual(first);
  expect(() => beginArPaymentIntent(store, "owner", { ...draft, amount: 7000 })).toThrow(
    /previous payment/i
  );
});
it("separates users and invoices and clears only the confirmed intent", () => {
  const store = memory();
  const first = beginArPaymentIntent(store, "owner", draft);
  expect(getArPaymentIntent(store, "other", "invoice")).toBeNull();
  expect(getArPaymentIntent(store, "owner", "other-invoice")).toBeNull();
  clearArPaymentIntent(store, "owner", "invoice", "wrong-key");
  expect(getArPaymentIntent(store, "owner", "invoice")).toEqual(first);
  clearArPaymentIntent(store, "owner", "invoice", first.idempotency_key);
  expect(getArPaymentIntent(store, "owner", "invoice")).toBeNull();
});
it("corrupt unresolved state fails closed rather than issuing another money request", () => {
  const store = memory();
  beginArPaymentIntent(store, "owner", draft);
  const original = store.getItem;
  store.getItem = (key) => (original(key) ? "{bad JSON" : null);
  expect(() => beginArPaymentIntent(store, "owner", draft)).toThrow();
});
