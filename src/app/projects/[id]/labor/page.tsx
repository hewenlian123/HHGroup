import Link from "next/link";
import { notFound } from "next/navigation";
import { PageLayout, PageHeader, Divider, SectionHeader } from "@/components/base";
import { getProjectById, getLaborEntriesWithJoins, getWorkers } from "@/lib/data";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = { params: Promise<{ id: string }> };

export default async function ProjectLaborPage({ params }: Props) {
  const { id } = await params;
  const [project, entries] = await Promise.all([
    getProjectById(id),
    getLaborEntriesWithJoins({ project_id: id }),
  ]);
  const workers = await getWorkers();

  if (!project) notFound();

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
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Worker
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Days
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Total Earned
              </th>
            </tr>
          </thead>
          <tbody>
            {workerRows.length === 0 ? (
              <tr className="border-b border-border/40">
                <td colSpan={3} className="py-6 px-3 text-center text-muted-foreground text-xs">
                  No labor entries.
                </td>
              </tr>
            ) : (
              workerRows.map((r) => (
                <tr key={r.worker_id} className="border-b border-border/40">
                  <td className="py-1.5 px-3">{r.worker_name}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">{r.days}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(r.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Divider />

      {/* Section 2: By Cost Code */}
      <SectionHeader label="By Cost Code" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Cost Code
              </th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {costCodeRows.length === 0 ? (
              <tr className="border-b border-border/40">
                <td colSpan={2} className="py-6 px-3 text-center text-muted-foreground text-xs">
                  No cost code breakdown.
                </td>
              </tr>
            ) : (
              costCodeRows.map((r) => (
                <tr key={r.cost_code} className="border-b border-border/40">
                  <td className="py-1.5 px-3">{r.cost_code}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(r.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PageLayout>
  );
}
