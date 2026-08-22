import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { RecentTransaction, ProjectRiskOverview } from "@/lib/data";
import type { ProjectContractReviewSummary } from "@/lib/financial/project-financial-review";
import type { OverdueInvoiceRow } from "@/lib/invoices-db";
import { DashboardCommandHud } from "./dashboard-command-hud";

type ApBillsSummary = {
  totalOutstanding: number;
  overdueCount: number;
  overdueAmount: number;
  dueThisWeekCount: number;
  dueThisWeekAmount: number;
  paidThisMonthAmount: number;
};

type SubcontractDetail = {
  id: string;
  subcontractor_id: string;
  project_id: string;
  subcontractor_name: string;
  project_name: string;
};

type OutstandingSubcontract = SubcontractDetail & { balance: number };

type ProjectHealthRow = {
  id: string;
  name: string;
  revenue: number;
  budget: number;
  actual: number;
  profit: number;
  marginPct: number;
  profitReady: boolean;
  contractReviewLabel: string | null;
};

type KpiItem = {
  key: string;
  label: string;
  value: string;
  icon?: LucideIcon;
};

type UpcomingTask = { id: string; title: string; meta: string; due: string };

export interface DashboardViewProps {
  stats: Awaited<ReturnType<typeof import("@/lib/data").getDashboardStats>>;
  transactions: RecentTransaction[];
  riskOverview: ProjectRiskOverview;
  projects: Awaited<ReturnType<typeof import("@/lib/data").getProjectsDashboard>>;
  subcontractsDetails: SubcontractDetail[];
  billsSummary: { subcontract_id: string; amount: number; status: string }[];
  paymentsSummary: { subcontract_id: string; amount: number }[];
  apBillsSummary: ApBillsSummary;
  laborCostThisWeek: number;
  expensesThisMonth: number;
  overdueInvoices: OverdueInvoiceRow[];
  riskByProjectId: Map<string, "HIGH" | "MEDIUM" | "LOW">;
  outstandingSubcontracts: OutstandingSubcontract[];
  projectHealthRows: ProjectHealthRow[];
  kpis: KpiItem[];
  upcomingTasks: UpcomingTask[];
  recentActivity: RecentTransaction[];
  budgetUsagePct: number;
  profitPositive: boolean;
  /** Set when primary dashboard queries failed (e.g. Supabase misconfiguration). */
  dataLoadWarning?: string | null;
  contractReview: ProjectContractReviewSummary;
}

export function DashboardView(props: DashboardViewProps): ReactNode {
  const {
    stats,
    apBillsSummary,
    laborCostThisWeek,
    expensesThisMonth,
    overdueInvoices,
    transactions,
    riskOverview,
    projectHealthRows,
    upcomingTasks,
    recentActivity,
    dataLoadWarning,
    contractReview,
  } = props;

  return (
    <>
      {dataLoadWarning ? (
        <p
          className="rounded-hh-standard border border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] px-3 py-2 text-hh-body text-[var(--hh-text-primary)]"
          role="status"
        >
          {dataLoadWarning}
        </p>
      ) : null}

      <DashboardCommandHud
        stats={stats}
        transactions={transactions}
        riskOverview={riskOverview}
        projectHealthRows={projectHealthRows}
        overdueInvoices={overdueInvoices}
        apOutstanding={apBillsSummary.totalOutstanding}
        laborCostThisWeek={laborCostThisWeek}
        expensesThisMonth={expensesThisMonth}
        upcomingTasks={upcomingTasks}
        recentActivity={recentActivity}
        contractReview={contractReview}
      />
    </>
  );
}
