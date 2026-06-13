import { TabsContent } from "@/components/ui/tabs";
import WorkerAdvancesPage from "@/app/labor/advances/page";
import PayrollSummaryPage from "@/app/labor/payroll/page";
import WorkerPaymentsPage from "@/app/labor/payments/page";
import WorkerReimbursementsPage from "@/app/labor/reimbursements/page";
import WorkerBalancesPage from "@/app/labor/worker-balances/page";
import {
  WorkerInvoicesClient,
  type WorkerInvoicesPageCopy,
} from "@/app/labor/worker-invoices/worker-invoices-client";
import WorkerSummaryPage from "@/app/workers/summary/page";
import { normalizeWorkforceReportsTab } from "./workforce-report-tabs";
import { WorkforceReportsClient } from "./workforce-reports-client";

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
  const advances = await WorkerAdvancesPage();

  return (
    <WorkforceReportsClient activeTab={activeTab}>
      <TabsContent value="overview">
        <WorkerSummaryPage />
      </TabsContent>
      <TabsContent value="payroll">
        <PayrollSummaryPage />
      </TabsContent>
      <TabsContent value="balances">
        <WorkerBalancesPage />
      </TabsContent>
      <TabsContent value="payments">
        <WorkerPaymentsPage />
      </TabsContent>
      <TabsContent value="advances">{advances}</TabsContent>
      <TabsContent value="reimbursements">
        <WorkerReimbursementsPage />
      </TabsContent>
      <TabsContent value="statements">
        <WorkerInvoicesClient copy={WORKFORCE_STATEMENTS_COPY} />
      </TabsContent>
    </WorkforceReportsClient>
  );
}
