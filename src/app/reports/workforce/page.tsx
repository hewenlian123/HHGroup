import WorkerAdvancesPage from "@/app/labor/advances/page";
import WorkerPaymentsPage from "@/app/labor/payments/page";
import WorkerReimbursementsPage from "@/app/labor/reimbursements/page";
import WorkerBalancesPage from "@/app/labor/worker-balances/page";
import type { WorkerInvoicesPageCopy } from "@/app/labor/worker-invoices/worker-invoices-client";
import { WorkerInvoicesClientIsland } from "@/app/labor/worker-invoices/worker-invoices-client-island";
import WorkerSummaryPage from "@/app/workers/summary/page";
import { normalizeWorkforceReportsTab } from "./workforce-report-tabs";
import { PayrollWorkspaceClient } from "./workforce-reports-client";

export const dynamic = "force-dynamic";

const WORKFORCE_STATEMENTS_COPY: WorkerInvoicesPageCopy = {
  title: "Worker Statements",
  subtitle: "Track worker statements, billed labor, payment status, and related projects.",
  searchPlaceholder: "Search workers, projects, statements...",
  searchAriaLabel: "Search statements",
  newButtonLabel: "New Statement",
  newFabAriaLabel: "New statement",
  totalLabel: "Total statements",
  openLabel: "Open statements",
  paidLabel: "Paid statements",
  emptyTitle: "No statements yet",
  emptyDescription:
    "Create a statement to track billed labor, payment status, and linked projects.",
  emptyButtonLabel: "Create first statement",
  editTitle: "Edit Statement",
  newTitle: "New Worker Statement",
  fileLabel: "Statement file (URL)",
  filePlaceholder: "Link to statement file",
  fileActionLabel: "View statement file",
  idColumnLabel: "Statement #",
  actionsAriaPrefix: "Actions for statement",
};

export default async function WorkforceReportsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const activeTab = normalizeWorkforceReportsTab(searchParams?.tab);
  switch (activeTab) {
    case "payroll":
      return <PayrollWorkspaceClient />;
    case "balances":
      return <WorkerBalancesPage />;
    case "payments":
      return <WorkerPaymentsPage />;
    case "advances":
      return WorkerAdvancesPage();
    case "reimbursements":
      return <WorkerReimbursementsPage />;
    case "statements":
      return <WorkerInvoicesClientIsland copy={WORKFORCE_STATEMENTS_COPY} />;
    default:
      return <WorkerSummaryPage />;
  }
}
