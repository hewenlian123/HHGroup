import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth-boundary";
import { getProjectFinancialSnapshot } from "@/lib/financial/project-financial-snapshot-db";
import {
  buildDataQualityReport,
  type DataQualityModule,
  type ProjectSnapshotCheckResult,
  type UnknownRow,
} from "@/lib/system-data-quality";
import { getServerSupabaseInternalNoStore } from "@/lib/supabase-server";
import { safeErrorMessage } from "@/lib/system-response-safety";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
};

const ROW_LIMIT = 500;
const PROJECT_SNAPSHOT_LIMIT = 60;
const SNAPSHOT_CONCURRENCY = 4;

const TABLE_MODULES: Record<string, DataQualityModule> = {
  projects: "projects",
  expenses: "expenses",
  expense_lines: "expenses",
  invoices: "invoices",
  invoice_items: "invoices",
  invoice_payments: "invoices",
  estimates: "estimates",
  estimate_items: "estimates",
  labor_entries: "labor",
  worker_payments: "labor",
  worker_advances: "labor",
  worker_reimbursements: "reimbursements",
  company_profile: "company-profile",
};

type TableRows = {
  rows: UnknownRow[];
  error?: { table: string; module: DataQualityModule; message: string };
};

type SupabaseInternalClient = NonNullable<ReturnType<typeof getServerSupabaseInternalNoStore>>;

async function fetchRows(
  supabase: SupabaseInternalClient,
  table: keyof typeof TABLE_MODULES,
  limit = ROW_LIMIT
): Promise<TableRows> {
  const { data, error } = await supabase.from(table).select("*").limit(limit);
  if (error) {
    return {
      rows: [],
      error: {
        table,
        module: TABLE_MODULES[table],
        message: safeErrorMessage(error.message, `${table} could not be checked.`),
      },
    };
  }
  return { rows: ((data ?? []) as UnknownRow[]).slice(0, limit) };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function fetchProjectSnapshots(
  projects: UnknownRow[]
): Promise<ProjectSnapshotCheckResult[]> {
  const projectIds = projects
    .map((project) => (typeof project.id === "string" ? project.id : null))
    .filter((id): id is string => Boolean(id))
    .slice(0, PROJECT_SNAPSHOT_LIMIT);

  if (projectIds.length === 0) return [];

  return mapWithConcurrency<string, ProjectSnapshotCheckResult>(
    projectIds,
    SNAPSHOT_CONCURRENCY,
    async (projectId) => {
      try {
        const snapshot = await getProjectFinancialSnapshot(projectId);
        return { projectId, ok: true, snapshot };
      } catch (error) {
        return {
          projectId,
          ok: false,
          message: safeErrorMessage(error, "Project financial snapshot failed."),
        };
      }
    }
  );
}

export async function GET(request: Request) {
  const guard = await requireAuthenticatedUser(request);
  if (!guard.ok) return guard.response;

  const supabase = getServerSupabaseInternalNoStore();
  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        checkedAt: new Date().toISOString(),
        summary: {
          status: "critical",
          critical: 1,
          warning: 0,
          info: 0,
          totalIssues: 1,
          returnedIssues: 1,
          projectsChecked: 0,
          expensesChecked: 0,
          invoicesChecked: 0,
          estimatesChecked: 0,
          laborChecked: 0,
          reimbursementsChecked: 0,
          companyProfileChecked: 0,
        },
        modules: [],
        issues: [
          {
            severity: "critical",
            module: "projects",
            entityType: "supabase",
            issueCode: "supabase_not_configured",
            message: "Supabase server client is not configured.",
            recommendedAction: "Set server Supabase environment variables.",
          },
        ],
      },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }

  const [
    projects,
    expenses,
    expenseLines,
    invoices,
    invoiceItems,
    invoicePayments,
    estimates,
    estimateItems,
    laborEntries,
    workerPayments,
    workerAdvances,
    workerReimbursements,
    companyProfiles,
  ] = await Promise.all([
    fetchRows(supabase, "projects"),
    fetchRows(supabase, "expenses"),
    fetchRows(supabase, "expense_lines"),
    fetchRows(supabase, "invoices"),
    fetchRows(supabase, "invoice_items"),
    fetchRows(supabase, "invoice_payments"),
    fetchRows(supabase, "estimates"),
    fetchRows(supabase, "estimate_items"),
    fetchRows(supabase, "labor_entries"),
    fetchRows(supabase, "worker_payments"),
    fetchRows(supabase, "worker_advances"),
    fetchRows(supabase, "worker_reimbursements"),
    fetchRows(supabase, "company_profile", 20),
  ]);

  const projectSnapshots = await fetchProjectSnapshots(projects.rows);
  const tableResults = [
    projects,
    expenses,
    expenseLines,
    invoices,
    invoiceItems,
    invoicePayments,
    estimates,
    estimateItems,
    laborEntries,
    workerPayments,
    workerAdvances,
    workerReimbursements,
    companyProfiles,
  ];
  const tableErrors = tableResults
    .map((result) => result.error)
    .filter((error): error is NonNullable<TableRows["error"]> => error != null);

  const report = buildDataQualityReport({
    projects: projects.rows,
    projectSnapshots,
    expenses: expenses.rows,
    expenseLines: expenseLines.rows,
    invoices: invoices.rows,
    invoiceItems: invoiceItems.rows,
    invoicePayments: invoicePayments.rows,
    estimates: estimates.rows,
    estimateItems: estimateItems.rows,
    laborEntries: laborEntries.rows,
    workerPayments: workerPayments.rows,
    workerAdvances: workerAdvances.rows,
    workerReimbursements: workerReimbursements.rows,
    companyProfiles: companyProfiles.rows,
    tableErrors,
    checkedAt: new Date().toISOString(),
  });

  return NextResponse.json(report, { headers: NO_CACHE_HEADERS });
}
