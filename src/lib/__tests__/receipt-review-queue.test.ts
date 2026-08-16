import { describe, expect, it } from "vitest";

import { adjacentReceiptId } from "@/lib/receipt-review-queue";

describe("receipt review queue navigation", () => {
  const ids = ["receipt-a", "receipt-b", "receipt-c"];

  it("returns stable adjacent records in the current queue order", () => {
    expect(adjacentReceiptId(ids, "receipt-b", "previous")).toBe("receipt-a");
    expect(adjacentReceiptId(ids, "receipt-b", "next")).toBe("receipt-c");
  });

  it("does not wrap at queue edges", () => {
    expect(adjacentReceiptId(ids, "receipt-a", "previous")).toBeNull();
    expect(adjacentReceiptId(ids, "receipt-c", "next")).toBeNull();
  });

  it("returns null when the selected record is outside the filtered queue", () => {
    expect(adjacentReceiptId(ids, "receipt-missing", "next")).toBeNull();
  });
});
