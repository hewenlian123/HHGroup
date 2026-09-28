import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Estimate Detail server-initial client boundary", () => {
  it("keeps canonical calculations in a pure module outside the database client graph", () => {
    for (const path of [
      "src/app/estimates/_components/estimate-editor.tsx",
      "src/app/estimates/_components/estimate-line-item-model.ts",
      "src/app/estimates/_components/estimate-payment-schedule.tsx",
    ]) {
      const moduleSource = source(path);
      expect(moduleSource, path).not.toMatch(
        /import\s*\{[\s\S]*?(?:estimateLineTotal|groupEstimateItemsByCategoryId|paymentMilestoneAmount)[\s\S]*?\}\s*from\s*["']@\/lib\/data["']/
      );
    }
    expect(source("src/app/estimates/_components/estimate-editor.tsx")).toContain(
      'from "@/lib/estimate-domain"'
    );
  });
});
