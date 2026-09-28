import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/app/labor/reimbursements/page.tsx"),
  "utf8"
);

describe("Worker Reimbursements static prerender boundary", () => {
  it("contains the query-param workspace beneath a page-level Suspense boundary", () => {
    expect(source).toMatch(
      /export default function WorkerReimbursementsPage\(\)\s*\{\s*return \(\s*<React\.Suspense[\s\S]*?<WorkerReimbursementsPageContent\s*\/>[\s\S]*?<\/React\.Suspense>\s*\);\s*\}/
    );
    expect(source).toContain("function WorkerReimbursementsPageContent()");
  });
});
