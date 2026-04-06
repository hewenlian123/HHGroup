import Link from "next/link";
import { notFound } from "next/navigation";
import { PageLayout, PageHeader, Divider, SectionHeader } from "@/components/base";
import { getProjectById, getLaborEntriesWithJoins, getWorkers } from "@/lib/data";
import { ServerDataLoadFallback } from "@/components/server-data-load-fallback";
import { logServerPageDataError, serverDataLoadWarning } from "@/lib/server-load-warning";
import { SetBreadcrumbEntityTitle } from "@/components/layout/set-breadcrumb-entity-title";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = { params: Promise<{ id: string }> };

export default async function ProjectLaborPage({ params }: Props) {
  const { id } = await params;

  let project: Awaited<ReturnType<typeof getProjectById>> | undefined;
  try {
    project = await getProjectById(id);
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
  try {
    [entries, workers] = await Promise.all([
      getLaborEntriesWithJoins({ project_id: id }),
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
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Project
            </Link>
          }
        />
      }
    >
      <SetBreadcrumbEntityTitle label={project.name} />
      {dataLoadWarning ? (
        <p className="border-b border-border/60 pb-3 text-sm text-muted-foreground" role="status">
          {dataLoadWarning}
        </p>
      ) : null}
      {/* Header: Project name, Total Labor Cost */}
      <div className="flex items-baseline justify-between py-3 border-b border-border/60">
        <h2 className="text-lg font-semibold">{project.name}</h2>
        <span className="text-xl font-medium tabular-nums">
          Total Labor Cost: ${fmtUsd(totalLaborCost)}
        </span>
      </div>
      <Divider />

      {/* Section 1: By Worker */}
      <SectionHeader label="By Worker" />
      <div className="airtable-table-wrap airtable-table-wrap--ruled">
        <div className="airtable-table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Worker
                </th>
                <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                  Days
                </th>
                <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                  Total Earned
                </th>
              </tr>
            </thead>
            <tbody>
              {workerRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="h-11 min-h-[44px] px-3 py-0 text-center text-xs text-muted-foreground"
                  >
                    No labor entries.
                  </td>
                </tr>
              ) : (
                workerRows.map((r) => (
                  <tr key={r.worker_id} className={listTableRowStaticClassName}>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] font-medium">
                      {r.worker_name}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle font-mono text-[13px] tabular-nums">
                      {r.days}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle font-mono text-[13px] tabular-nums">
                      ${fmtUsd(r.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <Divider />

      {/* Section 2: By Cost Code */}
      <SectionHeader label="By Cost Code" />
      <div className="airtable-table-wrap airtable-table-wrap--ruled">
        <div className="airtable-table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="h-8 px-3 text-left align-middle text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                  Cost Code
                </th>
                <th className="h-8 px-3 text-right align-middle font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {costCodeRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={2}
                    className="h-11 min-h-[44px] px-3 py-0 text-center text-xs text-muted-foreground"
                  >
                    No cost code breakdown.
                  </td>
                </tr>
              ) : (
                costCodeRows.map((r) => (
                  <tr key={r.cost_code} className={listTableRowStaticClassName}>
                    <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] font-medium">
                      {r.cost_code}
                    </td>
                    <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle font-mono text-[13px] tabular-nums">
                      ${fmtUsd(r.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageLayout>
  );
}
