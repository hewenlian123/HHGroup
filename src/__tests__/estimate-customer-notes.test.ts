import { describe, expect, it } from "vitest";
import { preserveRetiredEstimateNotes, normalizeEstimateNoteBlocks } from "@/lib/estimate-notes";

describe("Estimate customer notes", () => {
  it("preserves customer card content and order without reviving retired Terms", () => {
    const first = { id: "a", type: "exclusions", title: "Exclusions", body: "<ul><li>Permits</li></ul>" };
    const second = { id: "b", type: "custom", title: "Access", body: "Owner provides access." };
    expect(normalizeEstimateNoteBlocks([first, { id: "old", type: "payment_terms", title: "Terms", body: "Net 30" }, second])).toEqual([first, second]);
  });
});

it("retains retired storage records unchanged while customer cards are edited", () => {
  const retired = { id: "legacy", type: "payment_terms", title: "Terms", body: "Original terms" };
  const customer = { id: "customer", type: "custom" as const, title: "Access", body: "Updated" };
  expect(preserveRetiredEstimateNotes([retired], [customer])).toEqual([customer, retired]);
});
