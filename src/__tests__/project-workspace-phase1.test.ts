import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROJECT_WORKSPACE_TABS, normalizeWorkspaceTab } from "@/lib/navigation/project-workspace";

describe("Project workspace routes and context", () => {
  it.each(PROJECT_WORKSPACE_TABS)("keeps $key independently addressable", ({ key }) => {
    expect(normalizeWorkspaceTab(key)).toBe(key);
  });

  it.each([
    ["cost", "financial"],
    ["budget", "financial"],
    ["expenses", "financial"],
    ["labor", "financial"],
    ["subcontracts", "financial"],
    ["bills", "financial"],
    ["commission", "financial"],
    ["financials", "financial"],
    ["work", "overview"],
    ["activity", "overview"],
    ["docs", "documents"],
    ["punch", "overview"],
    ["PHOTOS", "overview"],
    ["tasks", "overview"],
    ["schedule", "overview"],
    ["materials", "overview"],
    ["unknown", "overview"],
    ["", "overview"],
    ["constructor", "overview"],
    ["__proto__", "overview"],
  ])("preserves legacy %s links as %s", (alias, tab) => {
    expect(normalizeWorkspaceTab(alias)).toBe(tab);
  });

  it("loads Change Orders from the verified project client instead of an empty placeholder", () => {
    const source = readFileSync("src/app/projects/[id]/page.tsx", "utf8");
    expect(source).toMatch(
      /case "change-orders":\s*if \(canViewFinancials\) \{\s*changeOrders = await getChangeOrdersByProject\(id, projectSupabase\);\s*\}/
    );
  });

  it("keeps the requested section order and a bounded mobile navigation", () => {
    expect(PROJECT_WORKSPACE_TABS.map((tab) => tab.label)).toEqual([
      "Overview",
      "Change Orders",
      "Documents",
      "Financials",
      "People",
      "Closeout",
    ]);
    expect(PROJECT_WORKSPACE_TABS.filter((tab) => tab.mobile).map((tab) => tab.key)).toEqual([
      "overview",
      "change-orders",
      "documents",
      "financial",
    ]);
  });
});
