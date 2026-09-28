import { NextResponse } from "next/server";
import { requireSupabaseOwnerOrAdminRequestClient } from "@/lib/auth-boundary";
import { getFinanceOwnerDashboard } from "@/lib/finance-owner-dashboard";
import { getProjectFinancialSnapshot } from "@/lib/financial/project-financial-snapshot-db";
import {
  buildSystemFinancialReconciliationReport,
  type SystemFinancialReconciliationReadClient,
} from "@/lib/system-financial-reconciliation";
import {
  buildSystemIntegrityScanReport,
  type SystemIntegrityReadClient,
} from "@/lib/system-integrity-scan";
import { safeErrorMessage } from "@/lib/system-response-safety";
import { fetchWorkerBalances } from "@/lib/worker-balances-list";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
};

export async function GET(request: Request) {
  const guard = await requireSupabaseOwnerOrAdminRequestClient(request, { noStore: true });
  if (!guard.ok) return guard.response;
  const supabase = guard.client;

  try {
    const report = await buildSystemFinancialReconciliationReport(
      supabase as unknown as SystemFinancialReconciliationReadClient,
      {
        projectSnapshotLoader: (projectId) => getProjectFinancialSnapshot(projectId, supabase),
        ownerDashboardLoader: () => getFinanceOwnerDashboard(supabase),
        workerBalanceLoader: () => fetchWorkerBalances(supabase),
        integrityScanLoader: () =>
          buildSystemIntegrityScanReport(supabase as unknown as SystemIntegrityReadClient),
      }
    );
    return NextResponse.json(report, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    const message = safeErrorMessage(error, "Financial reconciliation failed.");
    console.error("[system-financial-reconciliation]", message);
    return NextResponse.json(
      {
        status: "error",
        generatedAt: new Date().toISOString(),
        summary: {
          totalIssues: 1,
          critical: 1,
          high: 0,
          medium: 0,
          low: 0,
          info: 0,
        },
        sections: [
          {
            id: "financial-reconciliation-read-safety",
            title: "Financial Reconciliation Read Safety",
            status: "error",
            issues: [
              {
                severity: "critical",
                category: "project_snapshot",
                table: "system_financial_reconciliation",
                id: "financial-reconciliation:exception",
                message,
                evidence: {},
                recommendedAction: "Inspect server logs and retry the read-only reconciliation.",
                autoFixAvailable: false,
              },
            ],
          },
        ],
      },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
