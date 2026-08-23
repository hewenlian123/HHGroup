import { describe, expect, it, vi } from "vitest";

import {
  markPaymentMilestonePaidWithClient,
  validatePaymentScheduleAllocation,
} from "@/lib/estimates-db";

describe("estimate Phase 1 payment schedule integrity", () => {
  it("allows a partial fixed-dollar schedule", () => {
    expect(
      validatePaymentScheduleAllocation({
        estimateTotal: 1000,
        scheduledAmounts: [250, 300],
        proposedAmount: 200,
      })
    ).toEqual({ scheduled: 750, remaining: 250 });
  });

  it("allows a fully scheduled estimate with zero remaining", () => {
    expect(
      validatePaymentScheduleAllocation({
        estimateTotal: 1000,
        scheduledAmounts: [250, 500],
        proposedAmount: 250,
      })
    ).toEqual({ scheduled: 1000, remaining: 0 });
  });

  it("blocks a payment schedule allocation above the estimate total", () => {
    expect(() =>
      validatePaymentScheduleAllocation({
        estimateTotal: 1000,
        scheduledAmounts: [600, 350],
        proposedAmount: 100,
      })
    ).toThrow("Payment schedule cannot exceed the $1,000.00 estimate total.");
  });

  it("does not mark an unlinked milestone paid", async () => {
    const update = vi.fn();
    const db = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "milestone-1", invoice_id: null },
                error: null,
              }),
            })),
          })),
        })),
        update,
      })),
    };

    const changed = await markPaymentMilestonePaidWithClient(
      db as never,
      "estimate-1",
      "milestone-1"
    );

    expect(changed).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});
