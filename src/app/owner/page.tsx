import Link from "next/link";
import {
  PageLayout,
  PageHeader,
  Divider,
  SectionHeader,
} from "@/components/base";
import {
  getProjects,
  getProjectForecastSummary,
  getSubcontractors,
  getSubcontractsSummaryAll,
  getPaymentsSummaryAll,
} from "@/lib/data";

export const dynamic = "force-dynamic";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function OwnerPage() {
  const projects = await getProjects();
  const projectSummaries = await Promise.all(
    projects.map(async (p) => {
      const s = await getProjectForecastSummary(p.id, { includeCostCodeVariances: true });
      return { project: p, ...s };
    })
  );

  const totalRevenue = projectSummaries.reduce((s, x) => s + x.revenue, 0);
  const totalActualCost = projectSummaries.reduce((s, x) => s + x.actualCost, 0);
  const totalForecastProfit = projectSummaries.reduce((s, x) => s + x.forecastProfit, 0);
  const forecastMarginPct = totalRevenue > 0 ? (totalForecastProfit / totalRevenue) * 100 : 0;

  const riskProjects = projectSummaries.filter((x) => x.forecastMarginPct < 10);

  const varianceByCostCode = new Map<string, number>();
  for (const { costCodeVariances } of projectSummaries) {
    if (!costCodeVariances) continue;
    for (const { costCode, variance } of costCodeVariances) {
      if (variance <= 0) continue;
      varianceByCostCode.set(costCode, (varianceByCostCode.get(costCode) ?? 0) + variance);
    }
  }
  const topOverBudgetCostCodes = Array.from(varianceByCostCode.entries())
    .map(([costCode, variance]) => ({ costCode, variance }))
    .sort((a, b) => b.variance - a.variance)
    .slice(0, 5);

  const [subcontractors, subcontractsSummary, paymentsSummary] = await Promise.all([
    getSubcontractors(),
    getSubcontractsSummaryAll().catch(() => []),
    getPaymentsSummaryAll().catch(() => []),
  ]);
  const paidBySubcontractId = new Map<string, number>();
  for (const p of paymentsSummary) {
    paidBySubcontractId.set(p.subcontract_id, (paidBySubcontractId.get(p.subcontract_id) ?? 0) + p.amount);
  }
  const contractBySubcontractorId = new Map<string, number>();
  const paidBySubcontractorId = new Map<string, number>();
  for (const s of subcontractsSummary) {
    contractBySubcontractorId.set(
      s.subcontractor_id,
      (contractBySubcontractorId.get(s.subcontractor_id) ?? 0) + s.contract_amount
    );
    const paid = paidBySubcontractId.get(s.id) ?? 0;
    paidBySubcontractorId.set(s.subcontractor_id, (paidBySubcontractorId.get(s.subcontractor_id) ?? 0) + paid);
  }
  const exposureBySubcontractor = subcontractors.map((sc) => {
    const contract = contractBySubcontractorId.get(sc.id) ?? 0;
    const paid = paidBySubcontractorId.get(sc.id) ?? 0;
    const exposure = contract - paid;
    return { id: sc.id, name: sc.name, exposure };
  });
  const largestExposure = exposureBySubcontractor
    .filter((x) => x.exposure > 0)
    .sort((a, b) => b.exposure - a.exposure)
    .slice(0, 10);

  return (
    <PageLayout
      header={
        <PageHeader
          title="Owner"
          description="Portfolio forecast, risk projects, and exposure."
          actions={
            <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
          }
        />
      }
    >
      <SectionHeader label="Totals" />
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 py-3 border-b border-border/60">
        <span className="text-sm text-muted-foreground">Total Revenue</span>
        <span className="text-lg font-medium tabular-nums">${fmtUsd(totalRevenue)}</span>
        <span className="text-sm text-muted-foreground">Total Actual Cost</span>
        <span className="text-lg font-medium tabular-nums">${fmtUsd(totalActualCost)}</span>
        <span className="text-sm text-muted-foreground">Total Forecast Profit</span>
        <span className={`text-lg font-medium tabular-nums ${totalForecastProfit >= 0 ? "text-foreground" : "text-destructive"}`}>
          ${fmtUsd(totalForecastProfit)}
        </span>
        <span className="text-sm text-muted-foreground">Forecast Margin %</span>
        <span className={`text-lg font-medium tabular-nums ${forecastMarginPct >= 0 ? "text-foreground" : "text-destructive"}`}>
          {forecastMarginPct.toFixed(1)}%
        </span>
      </div>
      <Divider />

      <SectionHeader label="All projects" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Project</th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Revenue</th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Actual Cost</th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Remaining</th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Forecast Cost</th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Forecast Profit</th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Margin %</th>
            </tr>
          </thead>
          <tbody>
            {projectSummaries.map((x) => (
              <tr key={x.project.id} className="border-b border-border/40">
                <td className="py-1.5 px-3">
                  <Link href={`/projects/${x.project.id}/profit`} className="hover:text-foreground hover:underline">
                    {x.project.name}
                  </Link>
                </td>
                <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(x.revenue)}</td>
                <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(x.actualCost)}</td>
                <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(x.remainingCommitment)}</td>
                <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(x.forecastFinalCost)}</td>
                <td className={`py-1.5 px-3 text-right tabular-nums ${x.forecastProfit >= 0 ? "" : "text-destructive"}`}>
                  ${fmtUsd(x.forecastProfit)}
                </td>
                <td className={`py-1.5 px-3 text-right tabular-nums ${x.forecastMarginPct >= 0 ? "" : "text-destructive"}`}>
                  {x.forecastMarginPct.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Divider />

      <SectionHeader label="Risk projects (Forecast Margin &lt; 10%)" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Project</th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Forecast Margin %</th>
            </tr>
          </thead>
          <tbody>
            {riskProjects.length === 0 ? (
              <tr className="border-b border-border/40">
                <td colSpan={2} className="py-6 px-3 text-center text-muted-foreground text-xs">
                  None.
                </td>
              </tr>
            ) : (
              riskProjects.map((x) => (
                <tr key={x.project.id} className="border-b border-border/40">
                  <td className="py-1.5 px-3">
                    <Link href={`/projects/${x.project.id}/profit`} className="hover:text-foreground hover:underline">
                      {x.project.name}
                    </Link>
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-destructive">{x.forecastMarginPct.toFixed(1)}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Divider />

      <SectionHeader label="Top over budget cost codes" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Cost Code</th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Variance</th>
            </tr>
          </thead>
          <tbody>
            {topOverBudgetCostCodes.length === 0 ? (
              <tr className="border-b border-border/40">
                <td colSpan={2} className="py-6 px-3 text-center text-muted-foreground text-xs">
                  None.
                </td>
              </tr>
            ) : (
              topOverBudgetCostCodes.map((r) => (
                <tr key={r.costCode} className="border-b border-border/40">
                  <td className="py-1.5 px-3">{r.costCode}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-destructive">${fmtUsd(r.variance)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Divider />

      <SectionHeader label="Largest subcontract exposure" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Subcontractor</th>
              <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Exposure</th>
            </tr>
          </thead>
          <tbody>
            {largestExposure.length === 0 ? (
              <tr className="border-b border-border/40">
                <td colSpan={2} className="py-6 px-3 text-center text-muted-foreground text-xs">
                  None.
                </td>
              </tr>
            ) : (
              largestExposure.map((r) => (
                <tr key={r.id} className="border-b border-border/40">
                  <td className="py-1.5 px-3">
                    <Link href={`/subcontractors/${r.id}`} className="hover:text-foreground hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(r.exposure)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PageLayout>
  );
}
