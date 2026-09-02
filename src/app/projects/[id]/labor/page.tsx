import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSupabaseOwnerOrAdminServerAction } from "@/lib/auth-boundary";
import { PageLayout, PageHeader, Divider, SectionHeader } from "@/components/base";
import { getProjectById, getLaborEntriesWithJoins, getWorkers } from "@/lib/data";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import {
  createServerSupabaseClient,
  getServerSupabaseInternalNoStore,
} from "@/lib/supabase-server";
import {
  ProjectFinancialTable,
  ProjectFinancialTableCell,
  ProjectFinancialTableHead,
  ProjectFinancialTableHeader,
} from "../_components/project-financial-responsive-table";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = { params: Promise<{ id: string }> };

export default async function ProjectLaborPage({ params }: Props) {
  const guard = await requireSupabaseOwnerOrAdminServerAction();
  if (!guard.ok) notFound();
  const { id } = await params;

  let project: Awaited<ReturnType<typeof getProjectById>> | undefined;
  try {
    const projectSupabase = await createServerSupabaseClient();
    if (!projectSupabase) throw new Error("Authenticated project session is not configured.");
    project = await getProjectById(id, projectSupabase);
  } catch (e) {
    logServerPageDataError(`projects/${id}/labor`, e);
    return (
      <ServerDataLoadFallback
        message={serverDataLoadWarning(e, "project")}
        backHref="/projects"
        backLabel="Back to projects"
      />
    );
  }
  if (!project) notFound();

  let entries: Awaited<ReturnType<typeof getLaborEntriesWithJoins>> = [];
  let workers: Awaited<ReturnType<typeof getWorkers>> = [];
  let dataLoadWarning: string | null = null;
  const supabase = getServerSupabaseInternalNoStore();
  try {
    [entries, workers] = await Promise.all([
      getLaborEntriesWithJoins({ project_id: id }, supabase ?? undefined),
      getWorkers(),
    ]);
  } catch (e) {
    logServerPageDataError(`projects/${id}/labor entries`, e);
    dataLoadWarning = serverDataLoadWarning(e, "labor data");
  }

  const hourlyRateByWorkerId = new Map(workers.map((w) => [w.id, (w.halfDayRate ?? 0) / 4]));
  const entryAmount = (workerId: string, hours: number) =>
    (hourlyRateByWorkerId.get(workerId) ?? 0) * hours;
  const approvedLocked = entries.filter((e) => e.status === "Approved" || e.status === "Locked");
  const totalLaborCost = approvedLocked.reduce(
    (s, e) => s + (e.cost_amount ?? entryAmount(e.worker_id, e.hours)),
    0
  );

  const byWorker = approvedLocked.reduce(
    (acc, e) => {
      const k = e.worker_id;
      if (!acc[k]) acc[k] = { worker_name: e.worker_name ?? "—", days: 0, total: 0 };
      acc[k].days += 1;
      acc[k].total += e.cost_amount ?? entryAmount(e.worker_id, e.hours);
      return acc;
    },
    {} as Record<string, { worker_name: string; days: number; total: number }>
  );
  const workerRows = Object.entries(byWorker)
    .map(([worker_id, v]) => ({
      worker_id,
      worker_name: v.worker_name,
      days: v.days,
      total: v.total,
    }))
    .sort((a, b) => a.worker_name.localeCompare(b.worker_name));

  const byCostCode = approvedLocked.reduce(
    (acc, e) => {
      const code = e.cost_code?.trim() || "—";
      if (!acc[code]) acc[code] = 0;
      acc[code] += e.cost_amount ?? entryAmount(e.worker_id, e.hours);
      return acc;
    },
    {} as Record<string, number>
  );
  const costCodeRows = Object.entries(byCostCode)
    .map(([cost_code, total]) => ({
      cost_code,
      total,
    }))
    .sort((a, b) => a.cost_code.localeCompare(b.cost_code));

  return (
    <PageLayout
      header={
        <PageHeader
          title="Project Labor"
          description={`Labor cost by worker and cost code for ${project.name}.`}
          actions={
            <Link
              href={`/projects/${id}`}
              className="inline-flex min-h-[44px] items-center text-hh-body text-[var(--hh-text-secondary)] hover:text-[var(--hh-text-primary)]"
            >
              Project
            </Link>
          }
        />
      }
    >
      <SetBreadcrumbEntityTitle label={project.name} />
      {dataLoadWarning ? (
        <p
          className="border-b border-border/60 pb-3 text-hh-body text-[var(--hh-text-secondary)]"
          role="status"
        >
          {dataLoadWarning}
        </p>
      ) : null}
      {/* Header: Project name, Total Labor Cost */}
      <div className="flex items-baseline justify-between py-3 border-b border-border/60">
        <h2 className="text-hh-section-title font-semibold">{project.name}</h2>
        <span className="text-hh-section-title font-medium tabular-nums">
          Total Labor Cost: ${fmtUsd(totalLaborCost)}
        </span>
      </div>
      <Divider />

      {/* Section 1: By Worker */}
      <SectionHeader label="By Worker" />
      <div className="airtable-table-wrap airtable-table-wrap--ruled">
        <div className="airtable-table-scroll">
          <ProjectFinancialTable aria-label="Labor by worker">
            <ProjectFinancialTableHead>
              <tr>
                <ProjectFinancialTableHeader
                  id="labor-worker-name"
                  className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]"
                >
                  Worker
                </ProjectFinancialTableHeader>
                <ProjectFinancialTableHeader
                  id="labor-worker-days"
                  className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums"
                >
                  Days
                </ProjectFinancialTableHeader>
                <ProjectFinancialTableHeader
                  id="labor-worker-total-earned"
                  className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums"
                >
                  Total Earned
                </ProjectFinancialTableHeader>
              </tr>
            </ProjectFinancialTableHead>
            <tbody>
              {workerRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="h-11 min-h-[44px] px-3 py-0 text-center text-hh-metadata text-[var(--hh-text-secondary)]"
                  >
                    No labor entries.
                  </td>
                </tr>
              ) : (
                workerRows.map((r) => (
                  <tr key={r.worker_id} className={listTableRowStaticClassName}>
                    <ProjectFinancialTableCell
                      headerId="labor-worker-name"
                      label="Worker"
                      className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell font-medium"
                    >
                      {r.worker_name}
                    </ProjectFinancialTableCell>
                    <ProjectFinancialTableCell
                      headerId="labor-worker-days"
                      label="Days"
                      className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums"
                    >
                      {r.days}
                    </ProjectFinancialTableCell>
                    <ProjectFinancialTableCell
                      headerId="labor-worker-total-earned"
                      label="Total Earned"
                      className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums"
                    >
                      ${fmtUsd(r.total)}
                    </ProjectFinancialTableCell>
                  </tr>
                ))
              )}
            </tbody>
          </ProjectFinancialTable>
        </div>
      </div>
      <Divider />

      {/* Section 2: By Cost Code */}
      <SectionHeader label="By Cost Code" />
      <div className="airtable-table-wrap airtable-table-wrap--ruled">
        <div className="airtable-table-scroll">
          <ProjectFinancialTable aria-label="Labor by cost code">
            <ProjectFinancialTableHead>
              <tr>
                <ProjectFinancialTableHeader
                  id="labor-cost-code"
                  className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)]"
                >
                  Cost Code
                </ProjectFinancialTableHeader>
                <ProjectFinancialTableHeader
                  id="labor-cost-code-total"
                  className="h-8 px-3 text-right align-middle hh-fin text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] tabular-nums"
                >
                  Total
                </ProjectFinancialTableHeader>
              </tr>
            </ProjectFinancialTableHead>
            <tbody>
              {costCodeRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={2}
                    className="h-11 min-h-[44px] px-3 py-0 text-center text-hh-metadata text-[var(--hh-text-secondary)]"
                  >
                    No cost code breakdown.
                  </td>
                </tr>
              ) : (
                costCodeRows.map((r) => (
                  <tr key={r.cost_code} className={listTableRowStaticClassName}>
                    <ProjectFinancialTableCell
                      headerId="labor-cost-code"
                      label="Cost Code"
                      className="h-11 min-h-[44px] px-3 py-0 align-middle text-hh-table-cell font-medium"
                    >
                      {r.cost_code}
                    </ProjectFinancialTableCell>
                    <ProjectFinancialTableCell
                      headerId="labor-cost-code-total"
                      label="Total"
                      className="h-11 min-h-[44px] px-3 py-0 text-right align-middle hh-fin text-hh-table-cell tabular-nums"
                    >
                      ${fmtUsd(r.total)}
                    </ProjectFinancialTableCell>
                  </tr>
                ))
              )}
            </tbody>
          </ProjectFinancialTable>
        </div>
      </div>
    </PageLayout>
  );
}
