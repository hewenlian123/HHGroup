import { describe, expect, it } from "vitest";
import {
  CONTRACT_VALUE_SUSPICIOUS_HUGE_THRESHOLD,
  getProjectContractReviewIssues,
} from "@/lib/financial/project-financial-review";

describe("getProjectContractReviewIssues", () => {
  it("flags missing, zero, and $1 placeholder values", () => {
    expect(getProjectContractReviewIssues({ budget: null }).map((issue) => issue.code)).toEqual([
      "contract_value_missing",
    ]);
    expect(getProjectContractReviewIssues({ budget: 0 }).map((issue) => issue.code)).toContain(
      "contract_value_zero"
    );
    expect(getProjectContractReviewIssues({ budget: 1 }).map((issue) => issue.code)).toContain(
      "contract_value_placeholder"
    );
  });

  it("flags suspiciously huge values using the review threshold", () => {
    const issues = getProjectContractReviewIssues({
      budget: CONTRACT_VALUE_SUSPICIOUS_HUGE_THRESHOLD + 1,
    });

    expect(issues.map((issue) => issue.code)).toContain("contract_value_suspicious_huge");
  });

  it("flags budget and contract amount mismatches only when both are meaningful", () => {
    expect(
      getProjectContractReviewIssues({ budget: 500_000, contractAmount: 450_000 }).map(
        (issue) => issue.code
      )
    ).toContain("budget_contract_mismatch");

    expect(
      getProjectContractReviewIssues({ budget: 500_000, contractAmount: 500_000 }).map(
        (issue) => issue.code
      )
    ).not.toContain("budget_contract_mismatch");

    expect(
      getProjectContractReviewIssues({ budget: 1, contractAmount: null }).map((issue) => issue.code)
    ).not.toContain("budget_contract_mismatch");
  });
});
