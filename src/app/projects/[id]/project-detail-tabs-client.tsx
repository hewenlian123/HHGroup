"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import {
  PageLayout,
  PageHeader,
  Divider,
  SectionHeader,
  DataTable,
  StatusBadge,
  type DataTableColumn,
} from "@/components/base";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/data";
import type { ProjectDetailFinancial } from "@/lib/data";
import type { ProjectFinancialSummary } from "@/lib/data";
import type { CanonicalProjectProfit } from "@/lib/profit-engine";
import type { ProjectTransactionRow } from "@/lib/data";
import type { ProjectLaborBreakdownRow } from "@/lib/data";
import type { DocumentRow } from "@/lib/data";
import { ProjectDocumentsTab } from "./project-documents-tab";
import { deleteProjectAction, getProjectUsageAction, archiveProjectAction } from "../actions";
import { useToast } from "@/components/toast/toast-provider";
import type { ProjectUsageCounts } from "@/lib/data";

export type ChangeOrderRow = { id: string; number: string; status: string; total: number; date: string };

export type SubcontractSummaryRow = {
  id: string;
  subcontractor_name: string;
  contract_amount: number;
  approved: number;
  paid: number;
  retainage_held: number;
  balance_due: number;
};

export type ProjectLaborSummary = {
  totalHours: number;
  totalLaborCost: number;
  byStatus: { Draft: number; Submitted: number; Approved: number; Locked: number };
  byStatusHours: { Draft: number; Submitted: number; Approved: number; Locked: number };
  approvedLaborRows: { worker_id: string; worker_name: string; days: number; total_labor_cost: number }[];
};

export type SummaryRow = { id: string; metric: string; value: string };
export type RecentExpenseRow = {
  id: string;
  date: string;
  vendorName: string;
  category: string;
  memo: string | null;
  amount: number;
};
export type BudgetRow = { id: string; metric: string; budget: string; actual: string; variance: string };

type TabKey = "overview" | "financial" | "budget" | "expenses" | "documents" | "activity" | "change-orders" | "labor" | "subcontracts" | "bills";

export interface ProjectDetailTabsClientProps {
  projectId: string;
  project: Project;
  financial: ProjectDetailFinancial;
  financialSummary: ProjectFinancialSummary | null;
  tab: TabKey;
  summaryRows: SummaryRow[];
  recentExpenseRows: RecentExpenseRow[];
  transactions: ProjectTransactionRow[];
  budgetRows: BudgetRow[];
  expenseRows: RecentExpenseRow[];
  projectDocuments: DocumentRow[];
  billingSummary: { invoicedTotal: number; paidTotal: number; arBalance: number; lastPaymentDate: string | null };
  changeOrderRows: ChangeOrderRow[];
  laborBreakdownRows: ProjectLaborBreakdownRow[];
  laborSummary: ProjectLaborSummary;
  subcontractSummaryRows: SubcontractSummaryRow[];
  projectBills: import("@/lib/data").ApBillWithProject[];
  canonicalProfit: CanonicalProjectProfit;
}

export function ProjectDetailTabsClient({
  projectId,
  project,
  financial,
  financialSummary,
  tab,
  summaryRows,
  recentExpenseRows,
  transactions,
  budgetRows,
  expenseRows,
  projectDocuments,
  billingSummary,
  changeOrderRows,
  laborBreakdownRows,
  laborSummary,
  subcontractSummaryRows,
  projectBills,
  canonicalProfit,
}: ProjectDetailTabsClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  void laborBreakdownRows;

  const fmtUsd = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const setTab = React.useCallback(
    (value: string) => {
      router.push(`/projects/${projectId}?tab=${value}`, { scroll: false });
    },
    [projectId, router]
  );

  const [deleteBlockedOpen, setDeleteBlockedOpen] = React.useState(false);
  const [deleteBlockedCounts, setDeleteBlockedCounts] = React.useState<ProjectUsageCounts | null>(null);
  const [deleteInProgress, setDeleteInProgress] = React.useState(false);

  const labelCounts: { key: keyof ProjectUsageCounts; label: string }[] = [
    { key: "labor_entries", label: "Labor entries" },
    { key: "expenses", label: "Expenses" },
    { key: "bills", label: "Bills" },
    { key: "invoices", label: "Invoices" },
    { key: "subcontracts", label: "Subcontracts" },
    { key: "project_change_orders", label: "Change orders" },
  ];

  const firstTabForCounts = React.useMemo((): TabKey | null => {
    if (!deleteBlockedCounts) return null;
    if ((deleteBlockedCounts.labor_entries ?? 0) > 0) return "labor";
    if ((deleteBlockedCounts.expenses ?? 0) > 0) return "expenses";
    if ((deleteBlockedCounts.bills ?? 0) > 0) return "bills";
    if ((deleteBlockedCounts.invoices ?? 0) > 0) return "financial";
    if ((deleteBlockedCounts.subcontracts ?? 0) > 0) return "subcontracts";
    if ((deleteBlockedCounts.project_change_orders ?? 0) > 0) return "change-orders";
    return null;
  }, [deleteBlockedCounts]);

  const changeOrderColumns: DataTableColumn<ChangeOrderRow>[] = [
    { key: "number", header: "Number", cell: (r) => r.number },
    { key: "status", header: "Status", cell: (r) => <StatusBadge label={r.status} variant={r.status === "Approved" ? "success" : r.status === "Submitted" ? "warning" : "muted"} /> },
    { key: "total", header: "Total", numeric: true, cell: (r) => `$${r.total.toLocaleString()}` },
    { key: "date", header: "Date", cell: (r) => <span className="date-text">{r.date}</span> },
  ];

  const summaryColumns: DataTableColumn<SummaryRow>[] = [
    { key: "metric", header: "Metric", cell: (r) => r.metric },
    { key: "value", header: "Value", numeric: true, cell: (r) => r.value },
  ];

  const expenseColumns: DataTableColumn<RecentExpenseRow>[] = [
    { key: "date", header: "Date", cell: (r) => <span className="date-text">{r.date}</span> },
    { key: "vendorName", header: "Vendor", cell: (r) => r.vendorName },
    { key: "category", header: "Category", cell: (r) => r.category },
    { key: "memo", header: "Memo", cell: (r) => r.memo ?? "—" },
    {
      key: "amount",
      header: "Amount",
      numeric: true,
      cell: (r) => (
        <span className={cn("num", r.amount > 0 && "text-red-600/90 dark:text-red-400/90")}>
          −${Math.abs(r.amount).toLocaleString()}
        </span>
      ),
    },
  ];

  const budgetColumns: DataTableColumn<BudgetRow>[] = [
    { key: "metric", header: "Metric", cell: (r) => r.metric },
    { key: "budget", header: "Budget", numeric: true, cell: (r) => r.budget },
    { key: "actual", header: "Actual", numeric: true, cell: (r) => r.actual },
    { key: "variance", header: "Variance", numeric: true, cell: (r) => r.variance },
  ];

  const activityColumns: DataTableColumn<ProjectTransactionRow>[] = [
    { key: "date", header: "Date", cell: (r) => <span className="date-text">{r.date}</span> },
    { key: "type", header: "Type", cell: (r) => <span className="capitalize">{r.type}</span> },
    { key: "name", header: "Name", cell: (r) => r.name },
    {
      key: "amount",
      header: "Amount",
      numeric: true,
      cell: (r) => (
        <span className={cn("num", r.amount < 0 && "text-red-600/90 dark:text-red-400/90")}>
          {r.amount >= 0 ? "" : "−"}${Math.abs(r.amount).toLocaleString()}
        </span>
      ),
    },
    { key: "note", header: "Note", cell: (r) => r.note || "—" },
  ];

  const subtitle = [
    `Budget $${financial.totalBudget.toLocaleString()}`,
    `Spent $${financial.totalSpent.toLocaleString()}`,
    `Profit ${financial.profit >= 0 ? "" : "−"}$${Math.abs(financial.profit).toLocaleString()}`,
    `Margin ${financial.marginPct.toFixed(1)}%`,
  ].join(" · ");

  return (
    <PageLayout
      header={
        <PageHeader
          title={
            <div className="flex items-center gap-3">
              <Link
                href="/projects"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
              <span className="text-xl font-semibold tracking-tight text-foreground">
                {project.name}
              </span>
              <StatusBadge
                label={project.status.charAt(0).toUpperCase() + project.status.slice(1)}
                variant={project.status === "active" ? "success" : project.status === "pending" ? "warning" : "muted"}
              />
            </div>
          }
          description={subtitle}
        >
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="shrink-0">
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              disabled={deleteInProgress}
              onClick={async () => {
                const usage = await getProjectUsageAction(projectId);
                if (usage.blocked && usage.counts) {
                  setDeleteBlockedCounts(usage.counts);
                  setDeleteBlockedOpen(true);
                  return;
                }
                if (!window.confirm(`Delete project "${project.name}"? This cannot be undone.`)) return;
                setDeleteInProgress(true);
                try {
                  const result = await deleteProjectAction(projectId);
                  if (result?.error && !result?.blocked) {
                    const msg = String(result.error || "").trim();
                    const friendly =
                      /subcontract|contract|cannot|can'?t|关联|合同|不能/i.test(msg) ? msg : "Delete failed. Please try again.";
                    toast({ title: "Error", description: friendly, variant: "error" });
                  } else if (!result?.blocked) {
                    router.refresh();
                  }
                } finally {
                  setDeleteInProgress(false);
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </PageHeader>
      }
    >
      {financialSummary ? (
        <>
          <SectionHeader label="Financial overview" className="mb-1" />
          <Divider />
          <div className="grid grid-cols-3 gap-x-8 gap-y-3 py-4">
            <div className="flex justify-between items-baseline border-b border-border/40 pb-1">
              <span className="text-sm text-muted-foreground">Budget</span>
              <span className="tabular-nums text-right font-medium">${fmtUsd(financialSummary.budget)}</span>
            </div>
            <div className="flex justify-between items-baseline border-b border-border/40 pb-1">
              <span className="text-sm text-muted-foreground">Spent</span>
              <span className="tabular-nums text-right font-medium">${fmtUsd(financialSummary.spent)}</span>
            </div>
            <div className="flex justify-between items-baseline border-b border-border/40 pb-1">
              <span className="text-sm text-muted-foreground">Revenue</span>
              <span className="tabular-nums text-right font-medium">${fmtUsd(financialSummary.revenue)}</span>
            </div>
            <div className="flex justify-between items-baseline border-b border-border/40 pb-1">
              <span className="text-sm text-muted-foreground">Collected</span>
              <span className="tabular-nums text-right font-medium">${fmtUsd(financialSummary.collected)}</span>
            </div>
            <div className="flex justify-between items-baseline border-b border-border/40 pb-1">
              <span className="text-sm text-muted-foreground">Outstanding</span>
              <span className="tabular-nums text-right font-medium">${fmtUsd(financialSummary.outstanding)}</span>
            </div>
            <div className="flex justify-between items-baseline border-b border-border/40 pb-1">
              <span className="text-sm text-muted-foreground">Profit</span>
              <span
                className={cn(
                  "tabular-nums text-right font-medium",
                  financialSummary.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                )}
              >
                {financialSummary.profit >= 0 ? "" : "−"}${fmtUsd(Math.abs(financialSummary.profit))}
              </span>
            </div>
            <div className="col-span-3 flex justify-between items-baseline border-b border-border/40 pb-1">
              <span className="text-sm text-muted-foreground">Cashflow</span>
              <span
                className={cn(
                  "tabular-nums text-right font-medium",
                  financialSummary.cashflow >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                )}
              >
                {financialSummary.cashflow >= 0 ? "" : "−"}${fmtUsd(Math.abs(financialSummary.cashflow))}
              </span>
            </div>
          </div>
          <Divider className="mb-0" />
        </>
      ) : null}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="h-9 w-full justify-start rounded-none border-0 border-b border-border/60 bg-transparent p-0 gap-0">
          {(
            [
              { key: "overview" as const, label: "Overview" },
              { key: "financial" as const, label: "Financial" },
              { key: "budget" as const, label: "Budget" },
              { key: "expenses" as const, label: "Expenses" },
              { key: "documents" as const, label: "Documents" },
              { key: "activity" as const, label: "Activity" },
              { key: "change-orders" as const, label: "Change Orders" },
              { key: "labor" as const, label: "Labor" },
              { key: "subcontracts" as const, label: "Subcontracts" },
              { key: "bills" as const, label: "Bills" },
            ] as const
          ).map((t) => (
            <TabsTrigger
              key={t.key}
              value={t.key}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <SectionHeader label="Summary" />
          <Divider />
          <DataTable<SummaryRow>
            columns={summaryColumns}
            data={summaryRows}
            getRowId={(r) => r.id}
          />
          {subcontractSummaryRows.length > 0 ? (
            <>
              <SectionHeader
                label="Subcontract summary"
                action={
                  <button
                    type="button"
                    onClick={() => setTab("subcontracts")}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    View all
                  </button>
                }
              />
              <Divider />
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 py-3 text-sm">
                <span className="text-muted-foreground">{subcontractSummaryRows.length} subcontract(s)</span>
                <span className="tabular-nums">
                  Contract total ${fmtUsd(subcontractSummaryRows.reduce((s, r) => s + r.contract_amount, 0))}
                </span>
                <span className="text-muted-foreground">Approved</span>
                <span className="tabular-nums">${fmtUsd(subcontractSummaryRows.reduce((s, r) => s + r.approved, 0))}</span>
                <span className="text-muted-foreground">Paid</span>
                <span className="tabular-nums">${fmtUsd(subcontractSummaryRows.reduce((s, r) => s + r.paid, 0))}</span>
                <span className="text-muted-foreground">Retainage held</span>
                <span className="tabular-nums">${fmtUsd(subcontractSummaryRows.reduce((s, r) => s + r.retainage_held, 0))}</span>
                <span className="text-muted-foreground">Balance due</span>
                <span className="tabular-nums font-medium">
                  ${fmtUsd(subcontractSummaryRows.reduce((s, r) => s + r.balance_due, 0))}
                </span>
              </div>
              <Divider className="mb-0" />
            </>
          ) : null}
          <SectionHeader label="Recent expense lines" className="mt-6" />
          <Divider />
          <DataTable<RecentExpenseRow>
            columns={expenseColumns}
            data={recentExpenseRows}
            getRowId={(r) => r.id}
          />
          <SectionHeader label="Activity" className="mt-6" />
          <Divider />
          <DataTable<ProjectTransactionRow>
            columns={activityColumns}
            data={transactions}
            getRowId={(r) => r.id}
          />
        </TabsContent>

        <TabsContent value="financial" className="mt-4">
          <SectionHeader label="Financial summary" />
          <Divider />

          {/* Revenue */}
          <div className="py-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Revenue</h3>
            <div className="space-y-1.5">
              <div className="flex justify-between items-baseline border-b border-border/40 py-1.5">
                <span className="text-sm text-muted-foreground">Contract Budget</span>
                <span className="tabular-nums font-medium">${fmtUsd(canonicalProfit.budget)}</span>
              </div>
              <div className="flex justify-between items-baseline border-b border-border/40 py-1.5">
                <span className="text-sm text-muted-foreground">Approved Change Orders</span>
                <span className="tabular-nums font-medium">${fmtUsd(canonicalProfit.approvedChangeOrders)}</span>
              </div>
              <div className="flex justify-between items-baseline border-b border-border/60 py-1.5">
                <span className="text-sm font-medium text-foreground">Total Revenue</span>
                <span className="tabular-nums font-medium">${fmtUsd(canonicalProfit.revenue)}</span>
              </div>
            </div>
          </div>

          {/* Cost */}
          <div className="py-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Cost</h3>
            <div className="space-y-1.5">
              <div className="flex justify-between items-baseline border-b border-border/40 py-1.5">
                <span className="text-sm text-muted-foreground">Labor Cost (Approved/Locked)</span>
                <span className="tabular-nums">${fmtUsd(canonicalProfit.laborCost)}</span>
              </div>
              <div className="flex justify-between items-baseline border-b border-border/40 py-1.5">
                <span className="text-sm text-muted-foreground">Expenses</span>
                <span className="tabular-nums">${fmtUsd(canonicalProfit.expenseCost)}</span>
              </div>
              <div className="flex justify-between items-baseline border-b border-border/40 py-1.5">
                <span className="text-sm text-muted-foreground">Subcontract Cost</span>
                <span className="tabular-nums">${fmtUsd(canonicalProfit.subcontractCost)}</span>
              </div>
              <div className="flex justify-between items-baseline border-b border-border/60 py-1.5">
                <span className="text-sm font-medium text-foreground">Total Cost</span>
                <span className="tabular-nums font-medium">${fmtUsd(canonicalProfit.actualCost)}</span>
              </div>
            </div>
          </div>

          {/* Profit */}
          <div className="py-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Profit</h3>
            <div className="space-y-1.5">
              <div className="flex justify-between items-baseline border-b border-border/40 py-1.5">
                <span className="text-sm text-muted-foreground">Profit = Revenue − Total Cost</span>
                <span
                  className={cn(
                    "tabular-nums font-medium",
                    canonicalProfit.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                  )}
                >
                  {canonicalProfit.profit >= 0 ? "" : "−"}${fmtUsd(Math.abs(canonicalProfit.profit))}
                </span>
              </div>
              <div className="flex justify-between items-baseline border-b border-border/60 py-1.5">
                <span className="text-sm text-muted-foreground">Margin = Profit ÷ Revenue</span>
                <span className="tabular-nums font-medium">{(canonicalProfit.margin * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>

          <Divider />

          {/* Chart 1: Revenue vs Cost */}
          <div className="py-4">
            <SectionHeader label="Revenue vs Cost" />
            <div className="mt-3 space-y-3">
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Revenue</span>
                  <span className="tabular-nums">${fmtUsd(canonicalProfit.revenue)}</span>
                </div>
                <div className="h-6 rounded-sm bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-sm bg-emerald-600/80 dark:bg-emerald-500/80 min-w-[2px]"
                    style={{
                      width: canonicalProfit.revenue > 0 || canonicalProfit.actualCost > 0
                        ? `${Math.min(100, (canonicalProfit.revenue / Math.max(canonicalProfit.revenue, canonicalProfit.actualCost, 1)) * 100)}%`
                        : "0%",
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Cost</span>
                  <span className="tabular-nums">${fmtUsd(canonicalProfit.actualCost)}</span>
                </div>
                <div className="h-6 rounded-sm bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-sm bg-amber-600/80 dark:bg-amber-500/80 min-w-[2px]"
                    style={{
                      width: canonicalProfit.revenue > 0 || canonicalProfit.actualCost > 0
                        ? `${Math.min(100, (canonicalProfit.actualCost / Math.max(canonicalProfit.revenue, canonicalProfit.actualCost, 1)) * 100)}%`
                        : "0%",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Chart 2: Cost Breakdown */}
          <div className="py-4">
            <SectionHeader label="Cost breakdown" />
            <div className="mt-3">
              <div className="h-6 rounded-sm bg-muted overflow-hidden flex">
                {canonicalProfit.actualCost > 0 ? (
                  <>
                    {canonicalProfit.laborCost > 0 && (
                      <div
                        className="h-full bg-blue-600/80 dark:bg-blue-500/80 first:rounded-l-sm last:rounded-r-sm"
                        style={{ width: `${(canonicalProfit.laborCost / canonicalProfit.actualCost) * 100}%`, minWidth: canonicalProfit.laborCost > 0 ? "4px" : 0 }}
                        title={`Labor: $${fmtUsd(canonicalProfit.laborCost)}`}
                      />
                    )}
                    {canonicalProfit.expenseCost > 0 && (
                      <div
                        className="h-full bg-violet-600/80 dark:bg-violet-500/80 first:rounded-l-sm last:rounded-r-sm"
                        style={{ width: `${(canonicalProfit.expenseCost / canonicalProfit.actualCost) * 100}%`, minWidth: canonicalProfit.expenseCost > 0 ? "4px" : 0 }}
                        title={`Expenses: $${fmtUsd(canonicalProfit.expenseCost)}`}
                      />
                    )}
                    {canonicalProfit.subcontractCost > 0 && (
                      <div
                        className="h-full bg-amber-600/80 dark:bg-amber-500/80 first:rounded-l-sm last:rounded-r-sm"
                        style={{ width: `${(canonicalProfit.subcontractCost / canonicalProfit.actualCost) * 100}%`, minWidth: canonicalProfit.subcontractCost > 0 ? "4px" : 0 }}
                        title={`Subcontracts: $${fmtUsd(canonicalProfit.subcontractCost)}`}
                      />
                    )}
                  </>
                ) : (
                  <div className="w-full flex items-center justify-center text-xs text-muted-foreground">No cost</div>
                )}
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-600/80" /> Labor ${fmtUsd(canonicalProfit.laborCost)}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-violet-600/80" /> Expenses ${fmtUsd(canonicalProfit.expenseCost)}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-600/80" /> Subcontracts ${fmtUsd(canonicalProfit.subcontractCost)}
                </span>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="budget" className="mt-4">
          <SectionHeader label="Budget vs actual" />
          <Divider />
          <DataTable<BudgetRow>
            columns={budgetColumns}
            data={budgetRows}
            getRowId={(r) => r.id}
          />
          <SectionHeader label="Billing summary" className="mt-6" />
          <Divider />
          <DataTable<SummaryRow>
            columns={summaryColumns}
            data={[
              { id: "inv", metric: "Invoiced", value: `$${billingSummary.invoicedTotal.toLocaleString()}` },
              { id: "paid", metric: "Paid", value: `$${billingSummary.paidTotal.toLocaleString()}` },
              { id: "ar", metric: "AR balance", value: `$${billingSummary.arBalance.toLocaleString()}` },
              { id: "last", metric: "Last payment", value: billingSummary.lastPaymentDate ?? "—" },
            ]}
            getRowId={(r) => r.id}
          />
        </TabsContent>

        <TabsContent value="expenses" className="mt-4">
          <SectionHeader label="Expense lines" />
          <Divider />
          <DataTable<RecentExpenseRow>
            columns={expenseColumns}
            data={expenseRows}
            getRowId={(r) => r.id}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <ProjectDocumentsTab
            projectId={projectId}
            documents={projectDocuments}
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <SectionHeader label="Transactions" />
          <Divider />
          <DataTable<ProjectTransactionRow>
            columns={activityColumns}
            data={transactions}
            getRowId={(r) => r.id}
          />
        </TabsContent>

        <TabsContent value="change-orders" className="mt-4">
          <SectionHeader
            label="Change orders"
            action={
              <Link href={`/projects/${projectId}/change-orders/new`} className="text-xs text-muted-foreground hover:text-foreground">
                New
              </Link>
            }
          />
          <Divider />
          {changeOrderRows.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No change orders yet.</p>
          ) : (
            <DataTable<ChangeOrderRow>
              columns={changeOrderColumns}
              data={changeOrderRows}
              getRowId={(r) => r.id}
              onRowClick={(r) => router.push(`/projects/${projectId}/change-orders/${r.id}`)}
            />
          )}
        </TabsContent>

        <TabsContent value="labor" className="mt-4">
          <SectionHeader label="Labor summary" />
          <Divider />
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 py-3 text-sm">
            <span className="text-muted-foreground">Total hours</span>
            <span className="tabular-nums font-medium">{laborSummary.totalHours.toFixed(1)}</span>
            <span className="text-muted-foreground">Total labor cost</span>
            <span className="tabular-nums font-medium">${fmtUsd(laborSummary.totalLaborCost)}</span>
            <span className="text-muted-foreground">Draft hours</span>
            <span className="tabular-nums">{laborSummary.byStatusHours.Draft.toFixed(1)}</span>
            <span className="text-muted-foreground">Submitted hours</span>
            <span className="tabular-nums">{laborSummary.byStatusHours.Submitted.toFixed(1)}</span>
            <span className="text-muted-foreground">Approved hours</span>
            <span className="tabular-nums">{laborSummary.byStatusHours.Approved.toFixed(1)}</span>
            <span className="text-muted-foreground">Locked hours</span>
            <span className="tabular-nums">{laborSummary.byStatusHours.Locked.toFixed(1)}</span>
            <span className="text-muted-foreground">Draft</span>
            <span className="tabular-nums">{laborSummary.byStatus.Draft}</span>
            <span className="text-muted-foreground">Submitted</span>
            <span className="tabular-nums">{laborSummary.byStatus.Submitted}</span>
            <span className="text-muted-foreground">Approved</span>
            <span className="tabular-nums">{laborSummary.byStatus.Approved}</span>
            <span className="text-muted-foreground">Locked</span>
            <span className="tabular-nums">{laborSummary.byStatus.Locked}</span>
          </div>
          <SectionHeader label="Approved labor by worker" className="mt-4" />
          <Divider />
          {laborSummary.approvedLaborRows.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No approved labor entries for this project.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Worker</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Days</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Labor Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {laborSummary.approvedLaborRows.map((r) => (
                    <tr key={r.worker_id} className="border-b border-border/40">
                      <td className="py-1.5 px-3">{r.worker_name}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{r.days}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums font-medium">${fmtUsd(r.total_labor_cost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border/60 font-medium">
                    <td className="py-2 px-3">Total</td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {laborSummary.approvedLaborRows.reduce((s, r) => s + r.days, 0)}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      ${fmtUsd(laborSummary.approvedLaborRows.reduce((s, r) => s + r.total_labor_cost, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="subcontracts" className="mt-4">
          <SectionHeader
            label="Subcontract summary"
            action={
              <Link href={`/projects/${projectId}/subcontracts`} className="text-xs text-muted-foreground hover:text-foreground">
                Manage subcontracts
              </Link>
            }
          />
          <Divider />
          {subcontractSummaryRows.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No subcontracts for this project.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Subcontractor</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Contract</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Approved</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Paid</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Retainage held</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Balance due</th>
                    <th className="w-20" />
                  </tr>
                </thead>
                <tbody>
                  {subcontractSummaryRows.map((r) => (
                    <tr key={r.id} className="border-b border-border/40">
                      <td className="py-1.5 px-3 font-medium">{r.subcontractor_name}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(r.contract_amount)}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(r.approved)}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(r.paid)}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(r.retainage_held)}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(r.balance_due)}</td>
                      <td className="py-1.5 px-3">
                        <Link
                          href={`/projects/${projectId}/subcontracts/${r.id}/bills`}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Bills
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="bills" className="mt-4">
          <SectionHeader
            label="Bills (AP)"
            action={
              <Link href={`/bills?project_id=${projectId}`} className="text-xs text-muted-foreground hover:text-foreground">
                View all
              </Link>
            }
          />
          <Divider />
          {projectBills.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No bills linked to this project. <Link href="/bills/new" className="hover:text-foreground">Create a bill</Link> and link it to this project.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Bill no.</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Vendor</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Amount</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Balance</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="w-20 px-1" />
                  </tr>
                </thead>
                <tbody>
                  {projectBills.map((b) => (
                    <tr key={b.id} className="border-b border-border/40">
                      <td className="py-1.5 px-3 font-medium">{b.bill_no ?? "—"}</td>
                      <td className="py-1.5 px-3">{b.vendor_name}</td>
                      <td className="py-1.5 px-3 text-muted-foreground">{b.bill_type}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">${b.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums font-medium">${b.balance_amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                      <td className="py-1.5 px-3"><StatusBadge label={b.status} variant={b.status === "Paid" ? "success" : b.status === "Partially Paid" || b.status === "Pending" ? "warning" : "muted"} /></td>
                      <td className="py-1.5 px-1">
                        <Link href={`/bills/${b.id}`} className="text-xs text-muted-foreground hover:text-foreground">Open</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={deleteBlockedOpen} onOpenChange={setDeleteBlockedOpen}>
        <DialogContent className="max-w-sm border-border/60 p-5 rounded-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Cannot delete project</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              This project cannot be deleted because it is used in other records.
            </DialogDescription>
          </DialogHeader>
          {deleteBlockedCounts && (
            <ul className="text-sm text-foreground list-disc list-inside space-y-1">
              {labelCounts.map(({ key, label }) => {
                const n = deleteBlockedCounts[key] ?? 0;
                if (n <= 0) return null;
                return (
                  <li key={key}>
                    {label} ({n})
                  </li>
                );
              })}
            </ul>
          )}
          <DialogFooter className="gap-2 pt-3 border-t border-border/60">
            <Button variant="ghost" size="sm" onClick={() => setDeleteBlockedOpen(false)}>
              Cancel
            </Button>
            {firstTabForCounts != null && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTab(firstTabForCounts);
                  setDeleteBlockedOpen(false);
                }}
              >
                View records
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                const result = await archiveProjectAction(projectId);
                if (result?.error) {
                  toast({ title: "Error", description: result.error, variant: "error" });
                } else {
                  setDeleteBlockedOpen(false);
                  router.refresh();
                }
              }}
            >
              Archive project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
