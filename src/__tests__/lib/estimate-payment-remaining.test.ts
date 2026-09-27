import { expect, it } from "vitest";
import {
  paymentAmountFromPercent,
  paymentRemainingAmount,
} from "@/app/estimates/_components/estimate-payment-percent";
it("fills only the explicit remaining balance, including the edited milestone", () => {
  const total = 85369.77;
  const payments = [20, 30, 25, 20, 5].map((p) => paymentAmountFromPercent(p, total));
  const scheduled = payments.reduce((a, b) => a + b, 0);
  expect(paymentRemainingAmount(total, scheduled)).toBe(0.01);
  expect(paymentRemainingAmount(total, scheduled, payments[4])).toBe(4268.5);
  expect(paymentRemainingAmount(100, 110)).toBe(0);
  expect(paymentRemainingAmount(NaN, 10)).toBe(0);
});
