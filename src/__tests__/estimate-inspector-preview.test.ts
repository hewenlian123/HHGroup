import { expect, it } from "vitest";
import { lineTotal } from "@/lib/estimate-domain";
import { estimateInspectorTotal } from "@/app/estimates/_components/estimate-line-item-model";

it("previews only the selected line delta without changing fixed tax/discount or double counting saved/new totals", () => {
  const original = lineTotal({ qty: 2, unitCost: 100 });
  const subtotal = lineTotal({ qty: 3, unitCost: 100 });
  const pricing = {
    id: "selected",
    subtotal,
    impact: subtotal - original,
    adjustment: subtotal - original,
  };
  // Fixture: $200 selected line + $50 sibling + $12 fixed tax - $5 fixed discount.
  expect(estimateInspectorTotal(257, pricing)).toBe(357);
  // Revalidated persisted total, or already-live new Estimate: delta is already included.
  expect(estimateInspectorTotal(357, { ...pricing, adjustment: 0 })).toBe(357);
  expect(estimateInspectorTotal(257, { ...pricing, adjustment: -100 })).toBe(157);
  expect(estimateInspectorTotal(257, null)).toBe(257);
  expect(estimateInspectorTotal(null, pricing)).toBeNull();
  expect(estimateInspectorTotal(undefined, pricing)).toBeNull();
});
