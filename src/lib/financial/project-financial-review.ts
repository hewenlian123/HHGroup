export const CONTRACT_VALUE_SUSPICIOUS_HUGE_THRESHOLD = 10_000_000;

export type ProjectFinancialReviewIssueCode =
  | "contract_value_missing"
  | "contract_value_zero"
  | "contract_value_placeholder"
  | "contract_value_suspicious_huge"
  | "budget_contract_mismatch";

export type ProjectFinancialReviewIssue = {
  code: ProjectFinancialReviewIssueCode;
  label: string;
  description: string;
};

export type ProjectFinancialReviewInput = {
  budget?: number | string | null;
  contractAmount?: number | string | null;
  suspiciousHugeThreshold?: number;
};

export type ProjectContractReviewInput = ProjectFinancialReviewInput & {
  id: string;
  name?: string | null;
};

export type ProjectContractReviewSummaryRow = {
  id: string;
  name: string;
  issues: ProjectFinancialReviewIssue[];
  issueCodes: ProjectFinancialReviewIssueCode[];
};

export type ProjectContractReviewSummary = {
  totalProjects: number;
  readyProjectIds: string[];
  needsReviewCount: number;
  needsReviewProjectIds: string[];
  needsReviewProjects: ProjectContractReviewSummaryRow[];
  issueCounts: Record<ProjectFinancialReviewIssueCode, number>;
};

export function toNullableMoney(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "string" ? Number(value.trim()) : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function moneyEquals(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.01;
}

export function getProjectContractReviewIssues(
  input: ProjectFinancialReviewInput
): ProjectFinancialReviewIssue[] {
  const threshold = input.suspiciousHugeThreshold ?? CONTRACT_VALUE_SUSPICIOUS_HUGE_THRESHOLD;
  const budget = toNullableMoney(input.budget);
  const contractAmount = toNullableMoney(input.contractAmount);
  const contractValue = budget ?? contractAmount;
  const issues: ProjectFinancialReviewIssue[] = [];

  if (contractValue == null) {
    issues.push({
      code: "contract_value_missing",
      label: "Missing",
      description: "No budget or contract value is available for profit display.",
    });
    return issues;
  }

  if (contractValue === 0) {
    issues.push({
      code: "contract_value_zero",
      label: "$0 contract",
      description: "Contract value is zero, so confirmed profit should stay hidden.",
    });
  }

  if (contractValue === 1) {
    issues.push({
      code: "contract_value_placeholder",
      label: "$1 placeholder",
      description: "Contract value looks like a placeholder and needs manual cleanup.",
    });
  }

  if (contractValue > threshold) {
    issues.push({
      code: "contract_value_suspicious_huge",
      label: "Suspicious huge",
      description: `Contract value is above $${threshold.toLocaleString("en-US")} and needs review.`,
    });
  }

  if (
    budget != null &&
    contractAmount != null &&
    budget > 0 &&
    contractAmount > 0 &&
    !moneyEquals(budget, contractAmount)
  ) {
    issues.push({
      code: "budget_contract_mismatch",
      label: "Budget mismatch",
      description: "Budget and contract amount differ; confirm which value should drive profit.",
    });
  }

  return issues;
}

export function getProjectContractReviewSummary(
  projects: ProjectContractReviewInput[]
): ProjectContractReviewSummary {
  const issueCounts: Record<ProjectFinancialReviewIssueCode, number> = {
    contract_value_missing: 0,
    contract_value_zero: 0,
    contract_value_placeholder: 0,
    contract_value_suspicious_huge: 0,
    budget_contract_mismatch: 0,
  };
  const readyProjectIds: string[] = [];
  const needsReviewProjects: ProjectContractReviewSummaryRow[] = [];

  for (const project of projects) {
    const issues = getProjectContractReviewIssues(project);
    if (issues.length === 0) {
      readyProjectIds.push(project.id);
      continue;
    }

    for (const issue of issues) issueCounts[issue.code] += 1;
    needsReviewProjects.push({
      id: project.id,
      name: project.name?.trim() || "Unnamed project",
      issues,
      issueCodes: issues.map((issue) => issue.code),
    });
  }

  return {
    totalProjects: projects.length,
    readyProjectIds,
    needsReviewCount: needsReviewProjects.length,
    needsReviewProjectIds: needsReviewProjects.map((project) => project.id),
    needsReviewProjects,
    issueCounts,
  };
}
