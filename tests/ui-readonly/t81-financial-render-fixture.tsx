import React from "react";
import { createRoot } from "react-dom/client";
import {
  EstimateBuilderCompactSummary,
  EstimateBuilderMobileSummary,
} from "../../src/app/estimates/_components/estimate-builder-summary";
import { estimateSources, estimateDomain, dashboardDomain } from "./t81-financial-source-fixture";
import { DashboardCommandHud } from "../../src/app/dashboard/dashboard-command-hud";
import InvoicePage from "../../src/app/financial/invoices/page";
import PayrollPage from "../../src/app/labor/payroll/page";
import { ProjectsListClient } from "../../src/app/projects/projects-list-client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { ToastProvider } from "../../src/components/toast/toast-provider";
declare const __SURFACE__: string;

// Render the real production components with computed domain records; never replace money text.
const host = document.createElement("div");
host.id = "t81-financial-components";
document.querySelector(".estimate-builder-new")?.setAttribute("hidden", "");
document.querySelector("main")!.append(host);
const estimate = (
  <div className="estimate-builder estimate-builder-new">
    {estimateSources.map((source) => (
      <section key={source.id} data-source-id={source.id}>
        <EstimateBuilderCompactSummary
          summary={estimateDomain(source)}
          paymentSummary={{
            milestoneCount: 2,
            scheduledTotal: source.id === "T81-estimate-baseline" ? 961.26 : 0,
          }}
        />
        <EstimateBuilderMobileSummary summary={estimateDomain(source)} />
      </section>
    ))}
  </div>
);
const rows = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "T81 Synthetic Project",
    clientName: "T81 Customer",
    status: "active",
    budget: 999999999.99,
    revenue: null,
    actualCost: null,
    expenseCost: null,
    laborCost: null,
    reimbursementCost: null,
    billedAmount: null,
    paidAmount: null,
    openAR: null,
    profit: null,
    marginPct: null,
    profitReadinessWarning: null,
    financialSource: "unavailable" as const,
    updatedAt: "2026-09-01",
    canManage: false,
  },
];
createRoot(host).render(
  <AppRouterContext.Provider
    value={{
      back() {},
      forward() {},
      refresh() {},
      push() {},
      replace() {},
      prefetch: async () => {},
    }}
  >
    <PathnameContext.Provider value={__SURFACE__}>
      <SearchParamsContext.Provider value={new URLSearchParams()}>
        <ToastProvider>
          {__SURFACE__ === "/financial/invoices" ? (
            <InvoicePage />
          ) : __SURFACE__ === "/labor/payroll" ? (
            <PayrollPage />
          ) : __SURFACE__ === "/projects" ? (
            <ProjectsListClient rows={rows} />
          ) : __SURFACE__ === "/dashboard" ? (
            <DashboardCommandHud
              stats={dashboardDomain()}
              transactions={[]}
              riskOverview={{
                summary: { highCount: 0, overBudgetCount: 0, laborOverCount: 0, lowRunwayCount: 0 },
                projects: [],
              }}
              projectHealthRows={[]}
              overdueInvoices={[]}
              apOutstanding={0}
              laborCostThisWeek={0}
              expensesThisMonth={0}
              upcomingTasks={[]}
              recentActivity={[]}
              contractReview={{
                totalProjects: 1,
                readyProjectIds: ["T81-dashboard"],
                needsReviewCount: 0,
                needsReviewProjectIds: [],
                needsReviewProjects: [],
                issueCounts: {} as React.ComponentProps<
                  typeof DashboardCommandHud
                >["contractReview"]["issueCounts"],
              }}
            />
          ) : (
            estimate
          )}
        </ToastProvider>
      </SearchParamsContext.Provider>
    </PathnameContext.Provider>
  </AppRouterContext.Provider>
);
