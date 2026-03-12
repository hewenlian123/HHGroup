import { notFound } from "next/navigation";
import {
  getProjectById,
  getProjectBillingSummary,
} from "@/lib/data";
import { getCanonicalProjectProfit } from "@/lib/profit-engine";
import {
  ProjectDetailTabsClient,
} from "./project-detail-tabs-client";

type TabKey = "overview" | "financial" | "budget" | "expenses" | "documents" | "activity" | "change-orders" | "labor" | "subcontracts" | "bills";

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const tabParam = (sp.tab ?? "overview").toString().toLowerCase();
  const tab: TabKey =
    tabParam === "financial" || tabParam === "budget" || tabParam === "expenses" || tabParam === "documents" || tabParam === "activity" || tabParam === "change-orders" || tabParam === "labor" || tabParam === "subcontracts" || tabParam === "bills"
      ? tabParam
      : "overview";

  const project = await getProjectById(id);
  if (!project) notFound();

  const [canonical, billingSummary] = await Promise.all([
    getCanonicalProjectProfit(id),
    getProjectBillingSummary(id),
  ]);

  // Summary uses canonical profit: revenue = budget + approved CO, actual cost = labor + expense + approved subcontract bills.
  const actualRevenue = canonical.revenue;
  const actualCost = canonical.actualCost;
  const actualProfit = canonical.profit;
  const actualMarginPct = canonical.margin * 100;

  const financialSummary = {
    budget: project.budget ?? 0,
    revenue: actualRevenue,
    spent: actualCost,
    profit: actualProfit,
    marginPct: actualMarginPct,
    collected: billingSummary.paidTotal,
    outstanding: Math.max(0, billingSummary.invoicedTotal - billingSummary.paidTotal),
    cashflow: billingSummary.paidTotal - actualCost,
  };

  return (
    <ProjectDetailTabsClient
        projectId={id}
        project={project}
        financialSummary={financialSummary}
        billingSummary={billingSummary}
        canonicalProfit={canonical}
        initialTab={tab}
      />
  );
}
