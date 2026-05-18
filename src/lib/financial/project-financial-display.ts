import type {
  ProjectFinancialSnapshot,
  ProjectFinancialSnapshotDiagnostics,
  ProjectFinancialWarning,
} from "@/lib/financial/project-financial-snapshot";

function snapshotWarningCodes(
  warnings: ProjectFinancialWarning[],
  diagnostics: ProjectFinancialSnapshotDiagnostics | null | undefined
): Set<string> {
  return new Set([
    ...warnings.map((warning) => warning.code),
    ...(diagnostics?.missingSchemaWarnings ?? []),
    ...(diagnostics?.apDiagnosticsWarnings ?? []),
  ]);
}

function hasCriticalSnapshotSchemaWarning(codes: Set<string>): boolean {
  const criticalPrefixes = [
    "expense_lines",
    "expense_lines_by_project",
    "expenses",
    "labor_entries",
    "worker_reimbursements",
    "subcontract_bills",
    "project_change_orders",
    "project_change_order_items",
  ];
  return criticalPrefixes.some((prefix) =>
    [...codes].some(
      (code) =>
        code.startsWith(prefix) &&
        (code.includes("unavailable") || code.includes("schema_detail") || code.includes("missing"))
    )
  );
}

export function getProjectFinancialSnapshotProfitReadinessWarning(
  snapshot: ProjectFinancialSnapshot,
  warnings: ProjectFinancialWarning[] = snapshot.warnings,
  diagnostics: ProjectFinancialSnapshotDiagnostics | null | undefined = snapshot.diagnostics
): string | null {
  const codes = snapshotWarningCodes(warnings, diagnostics);
  if (snapshot.revisedContractValue <= 0 || snapshot.contractValue <= 0) {
    return "Contract value needs review before profit can be shown.";
  }
  if (snapshot.contractValue === 1) {
    return "Contract value needs review before profit can be shown.";
  }
  if (snapshot.contractValue >= 50_000_000) {
    return "Contract value needs review before profit can be shown.";
  }
  if (codes.has("project_contract_amount_mismatch")) {
    return "Contract value needs review before profit can be shown.";
  }
  if (hasCriticalSnapshotSchemaWarning(codes)) {
    return "Project cost inputs need review before profit can be shown.";
  }
  return null;
}
