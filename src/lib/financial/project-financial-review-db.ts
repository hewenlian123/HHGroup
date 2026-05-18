import "server-only";

import {
  getProjectContractReviewIssues,
  toNullableMoney,
  type ProjectFinancialReviewIssue,
  type ProjectFinancialReviewIssueCode,
} from "@/lib/financial/project-financial-review";
import { getProjectFinancialSnapshot } from "@/lib/financial/project-financial-snapshot-db";
import {
  getServerSupabaseInternalNoStore,
  SUPABASE_MISSING_SERVER_ENV_MESSAGE,
} from "@/lib/supabase-server";

type ProjectFinancialReviewProjectRow = {
  id: string;
  name: string | null;
  status: string | null;
  budget: number | string | null;
  contract_amount: number | string | null;
  updated_at: string | null;
};

export type ProjectFinancialReviewRow = {
  id: string;
  name: string;
  status: string | null;
  currentContractValue: number | null;
  budget: number | null;
  contractAmount: number | null;
  revisedContractValue: number | null;
  actualCost: number | null;
  confirmedProfitStatus: "shown" | "needs_review";
  issues: ProjectFinancialReviewIssue[];
  issueCodes: ProjectFinancialReviewIssueCode[];
  detailHref: string;
  updatedAt: string | null;
  snapshotWarningCodes: string[];
};

export type ProjectFinancialReviewPayload = {
  projects: ProjectFinancialReviewRow[];
  flaggedProjects: ProjectFinancialReviewRow[];
  summary: {
    totalProjects: number;
    flaggedProjects: number;
    missing: number;
    zero: number;
    placeholder: number;
    suspiciousHuge: number;
    mismatch: number;
  };
};

function countIssue(rows: ProjectFinancialReviewRow[], code: ProjectFinancialReviewIssueCode) {
  return rows.filter((row) => row.issueCodes.includes(code)).length;
}

async function buildProjectFinancialReviewRow(
  row: ProjectFinancialReviewProjectRow
): Promise<ProjectFinancialReviewRow> {
  const budget = toNullableMoney(row.budget);
  const contractAmount = toNullableMoney(row.contract_amount);
  const issues = getProjectContractReviewIssues({
    budget,
    contractAmount,
  });
  const snapshot = await getProjectFinancialSnapshot(row.id).catch(() => null);

  return {
    id: row.id,
    name: row.name?.trim() || "Unnamed project",
    status: row.status,
    currentContractValue: budget ?? contractAmount,
    budget,
    contractAmount,
    revisedContractValue: snapshot?.revisedContractValue ?? null,
    actualCost: snapshot?.actualCost ?? null,
    confirmedProfitStatus: issues.length > 0 ? "needs_review" : "shown",
    issues,
    issueCodes: issues.map((issue) => issue.code),
    detailHref: `/projects/${row.id}`,
    updatedAt: row.updated_at,
    snapshotWarningCodes: snapshot?.warnings.map((warning) => warning.code) ?? [],
  };
}

export async function getProjectFinancialReview(): Promise<ProjectFinancialReviewPayload> {
  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) throw new Error(SUPABASE_MISSING_SERVER_ENV_MESSAGE);

  const { data, error } = await supabase
    .from("projects")
    .select("id,name,status,budget,contract_amount,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message ?? "Failed to load project financial review.");

  const projects = await Promise.all(
    ((data ?? []) as ProjectFinancialReviewProjectRow[]).map(buildProjectFinancialReviewRow)
  );
  const flaggedProjects = projects.filter((project) => project.issues.length > 0);

  return {
    projects,
    flaggedProjects,
    summary: {
      totalProjects: projects.length,
      flaggedProjects: flaggedProjects.length,
      missing: countIssue(flaggedProjects, "contract_value_missing"),
      zero: countIssue(flaggedProjects, "contract_value_zero"),
      placeholder: countIssue(flaggedProjects, "contract_value_placeholder"),
      suspiciousHuge: countIssue(flaggedProjects, "contract_value_suspicious_huge"),
      mismatch: countIssue(flaggedProjects, "budget_contract_mismatch"),
    },
  };
}
