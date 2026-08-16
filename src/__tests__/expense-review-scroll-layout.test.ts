import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("Receipt Inbox review scroll-layout contract", () => {
  it("constrains the open desktop workspace before delegating vertical scroll to Review", () => {
    const css = source("src/app/financial/expenses/expenses-ui-theme.css");
    const reviewPanel = source("src/app/financial/expenses/expense-inbox-preview-modal.tsx");

    expect(css).toMatch(
      /\.expense-operations-workspace\[data-expense-detail-open="true"\]\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0,\s*1fr\);[\s\S]*?overflow:\s*hidden;/
    );
    expect(reviewPanel).toContain("data-expense-detail-body");
    expect(reviewPanel).toContain('"min-h-0 flex-1 overflow-y-auto px-4 py-4"');
    expect(reviewPanel).toContain(
      'className="expense-review-panel flex min-h-0 min-w-0 flex-col overflow-hidden"'
    );
  });
});
