import { describe, expect, it } from "vitest";
import { estimateLineItemText } from "@/lib/sanitize-line-item-html";

describe("Estimate Item Name document mapping", () => {
  it("preserves the complete description independently and retains legacy snapshots", () => {
    const desc = "Original first line\n<p>Full detailed description</p>";
    expect(estimateLineItemText({ itemName: "Concrete slab", desc })).toEqual({
      title: "Concrete slab",
      body: desc,
    });
    expect(estimateLineItemText({ itemName: "", desc })).toEqual({ title: "", body: desc });
    expect(estimateLineItemText({ desc })).toEqual({
      title: "Original first line",
      body: "<p>Full detailed description</p>",
    });
  });
});
