import { getProjectDetailFinancial, getProjects, getProjectForecastRisk } from "@/lib/data";
import { ProjectsListClient, type ProjectsListRow } from "./projects-list-client";

export const dynamic = "force-dynamic";

function riskFromForecast(forecastMarginPct: number, anyCostCodeVarianceOver10Pct: boolean): "red" | "yellow" | "green" {
  if (anyCostCodeVarianceOver10Pct) return "red";
  if (forecastMarginPct < 5) return "red";
  if (forecastMarginPct < 15) return "yellow";
  return "green";
}

export default async function ProjectsPage() {
  const projects = await getProjects();
  const riskResults = await Promise.all(projects.map((p) => getProjectForecastRisk(p.id)));
  const rows: ProjectsListRow[] = await Promise.all(
    projects.map(async (p, i) => {
      const fin = await getProjectDetailFinancial(p.id);
      const spent = fin?.totalSpent ?? 0;
      const budget = fin?.totalBudget ?? p.budget;
      const progressPct = budget > 0 ? (spent / budget) * 100 : 0;
      const { forecastMarginPct, anyCostCodeVarianceOver10Pct } = riskResults[i] ?? { forecastMarginPct: 0, anyCostCodeVarianceOver10Pct: false };
      return {
        id: p.id,
        name: p.name,
        clientName: p.client ?? null,
        status: p.status,
        budget,
        spent,
        progressPct,
        startDate: p.startDate != null ? String(p.startDate).slice(0, 10) : null,
        endDate: p.endDate != null ? String(p.endDate).slice(0, 10) : null,
        risk: riskFromForecast(forecastMarginPct, anyCostCodeVarianceOver10Pct),
      };
    })
  );

  return (
    <div className="page-container py-6">
      <ProjectsListClient rows={rows} />
    </div>
  );
}
