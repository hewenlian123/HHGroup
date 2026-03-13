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
import type { ProjectFinancialSummary } from "@/lib/data";
import type { CanonicalProjectProfit } from "@/lib/profit-engine";
import type { ProjectTransactionRow } from "@/lib/data";
import type { ProjectLaborBreakdownRow } from "@/lib/data";
import type { DocumentRow } from "@/lib/data";
import { ProjectDocumentsTab } from "./project-documents-tab";
import { ProjectTasksTab } from "./project-tasks-tab";
import { ProjectCloseoutTab } from "./project-closeout-tab";
import { ProjectMaterialsTab } from "./project-materials-tab";
import { ProjectCommissionTab } from "./project-commission-tab";
import { ProjectPunchListTab } from "./project-punch-list-tab";
import { deleteProjectAction, getProjectUsageAction, archiveProjectAction } from "../actions";
import { useToast } from "@/components/toast/toast-provider";
import type { ProjectUsageCounts } from "@/lib/data";
import { Skeleton } from "@/components/ui/skeleton";

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

type TabKey = "overview" | "tasks" | "schedule" | "financial" | "budget" | "expenses" | "labor" | "subcontracts" | "bills" | "documents" | "activity" | "change-orders" | "materials" | "closeout" | "commission" | "punch-list";

type ExpenseLineJoin = Awaited<ReturnType<typeof import("@/lib/data").getProjectExpenseLines>>[number];
type SourceForProject = Awaited<ReturnType<typeof import("@/lib/data").getSourceForProject>>;
type ChangeOrder = Awaited<ReturnType<typeof import("@/lib/data").getChangeOrdersByProject>>[number];
type LaborEntryJoin = Awaited<ReturnType<typeof import("@/lib/data").getLaborEntriesWithJoins>>[number];
type Subcontract = Awaited<ReturnType<typeof import("@/lib/data").getSubcontractsByProject>>[number];
type SubcontractBill = Awaited<ReturnType<typeof import("@/lib/data").getBillsBySubcontractIds>>[number];
type SubcontractPayment = Awaited<ReturnType<typeof import("@/lib/data").getPaymentsBySubcontractIds>>[number];

export interface ProjectDetailTabsClientProps {
  projectId: string;
  project: Project;
  financialSummary: ProjectFinancialSummary | null;
  billingSummary: { invoicedTotal: number; paidTotal: number; arBalance: number; lastPaymentDate: string | null };
  canonicalProfit: CanonicalProjectProfit;
  initialTab: TabKey;
}

export function ProjectDetailTabsClient({
  projectId,
  project,
  financialSummary,
  billingSummary,
  canonicalProfit,
  initialTab,
}: ProjectDetailTabsClientProps) {
  const router = useRouter();
  const { toast } = useToast();

  const fmtUsd = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const [tab, setTab] = React.useState<TabKey>(initialTab);

  type TabCache = Partial<{
    overview: { transactions: ProjectTransactionRow[]; expenseLines: ExpenseLineJoin[] };
    tasks: { tasks: import("@/lib/data").ProjectTaskWithWorker[]; workers: import("@/lib/data").Worker[] };
    schedule: { schedule: import("@/lib/data").ProjectScheduleItem[] };
    financial: { canonical: CanonicalProjectProfit; billingSummary: ProjectDetailTabsClientProps["billingSummary"] };
    budget: { canonical: CanonicalProjectProfit; billingSummary: ProjectDetailTabsClientProps["billingSummary"]; sourceFromEstimate: SourceForProject };
    expenses: { expenseLines: ExpenseLineJoin[] };
    documents: { documents: DocumentRow[] };
    activity: { transactions: ProjectTransactionRow[]; activityLogs: import("@/lib/data").ActivityLog[] };
    "change-orders": { changeOrders: ChangeOrder[] };
    labor: { laborBreakdownRows: ProjectLaborBreakdownRow[]; laborEntries: LaborEntryJoin[] };
    subcontracts: { subcontracts: Subcontract[]; bills: SubcontractBill[]; payments: SubcontractPayment[] };
    bills: { projectBills: import("@/lib/data").ApBillWithProject[] };
    materials: {
      selections: import("@/lib/data").ProjectMaterialSelectionWithMaterial[];
      catalog: import("@/lib/data").MaterialCatalogRow[];
    };
    closeout: {
      punch: import("@/lib/data").CloseoutPunch | null;
      warranty: import("@/lib/data").CloseoutWarranty | null;
      completion: import("@/lib/data").CloseoutCompletion | null;
    };
    commission: { commissions: import("@/lib/data").ProjectCommission[] };
    "punch-list": { punchItems: import("@/lib/data").PunchListItemWithJoins[]; workers: import("@/lib/data").Worker[] };
  }>;

  const [cache, setCache] = React.useState<TabCache>({});
  const cacheRef = React.useRef<TabCache>({});
  React.useEffect(() => {
    cacheRef.current = cache;
  }, [cache]);
  const [loadingTab, setLoadingTab] = React.useState<TabKey | null>(null);
  const [tabError, setTabError] = React.useState<string | null>(null);

  const fetchTab = React.useCallback(
    async (key: TabKey) => {
      // Base props already include what's needed for this tab.
      if (key === "financial") return;

      if (cacheRef.current[key]) return;
      setLoadingTab(key);
      setTabError(null);
      try {
        const res = await fetch(`/api/projects/${projectId}/tab?key=${encodeURIComponent(key)}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as unknown;
        const payload = data as { ok?: boolean; message?: string } & TabCache[keyof TabCache];
        if (!res.ok || !payload?.ok) throw new Error(payload?.message || "Failed to load tab data.");
        setCache((prev) => ({ ...prev, [key]: payload as TabCache[typeof key] }));
      } catch (e) {
        setTabError(e instanceof Error ? e.message : "Failed to load tab data.");
      } finally {
        setLoadingTab((cur) => (cur === key ? null : cur));
      }
    },
    [projectId]
  );

  React.useEffect(() => {
    // Lazy-load only the active tab, and cache results.
    void fetchTab(tab);
  }, [tab, fetchTab]);

  const [deleteBlockedOpen, setDeleteBlockedOpen] = React.useState(false);
  const [deleteBlockedCounts, setDeleteBlockedCounts] = React.useState<ProjectUsageCounts | null>(null);
  const [deleteInProgress, setDeleteInProgress] = React.useState(false);

  const deleteModalCountLabels: { key: keyof ProjectUsageCounts; label: string }[] = [
    { key: "expenses", label: "Expenses" },
    { key: "labor_entries", label: "Labor Entries" },
    { key: "worker_receipts", label: "Worker Receipts" },
    { key: "invoices", label: "Invoices" },
    { key: "site_photos", label: "Site Photos" },
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
    `Budget $${(financialSummary?.budget ?? project.budget ?? 0).toLocaleString()}`,
    `Spent $${(financialSummary?.spent ?? canonicalProfit.actualCost).toLocaleString()}`,
    `Profit ${canonicalProfit.profit >= 0 ? "" : "−"}$${Math.abs(canonicalProfit.profit).toLocaleString()}`,
    `Margin ${(canonicalProfit.margin * 100).toFixed(1)}%`,
  ].join(" · ");

  const overview = cache.overview;
  const overviewTransactions = overview?.transactions ?? [];
  const overviewExpenseLines = overview?.expenseLines ?? [];
  const recentExpenseRows: RecentExpenseRow[] = overviewExpenseLines
    .slice(0, 8)
    .map(({ date, vendorName, line }) => ({
      id: line.id,
      date,
      vendorName,
      category: line.category ?? "Other",
      memo: line.memo ?? null,
      amount: line.amount ?? 0,
    }));
  const expenseRows: RecentExpenseRow[] = (cache.expenses?.expenseLines ?? overviewExpenseLines).map(({ date, vendorName, line }) => ({
    id: line.id,
    date,
    vendorName,
    category: line.category ?? "Other",
    memo: line.memo ?? null,
    amount: line.amount ?? 0,
  }));

  const summaryRows: SummaryRow[] = [
    { id: "budget", metric: "Total budget", value: `$${(project.budget ?? 0).toLocaleString()}` },
    { id: "revenue", metric: "Total revenue", value: `$${canonicalProfit.revenue.toLocaleString()}` },
    { id: "spent", metric: "Total spent", value: `$${canonicalProfit.actualCost.toLocaleString()}` },
    { id: "profit", metric: "Profit", value: `${canonicalProfit.profit >= 0 ? "" : "−"}$${Math.abs(canonicalProfit.profit).toLocaleString()}` },
    { id: "margin", metric: "Margin %", value: `${(canonicalProfit.margin * 100).toFixed(1)}%` },
    { id: "invoiced", metric: "Invoiced", value: `$${billingSummary.invoicedTotal.toLocaleString()}` },
    { id: "collected", metric: "Collected", value: `$${billingSummary.paidTotal.toLocaleString()}` },
    { id: "ar", metric: "AR", value: `$${billingSummary.arBalance.toLocaleString()}` },
  ];

  const skeletonTable = (
    <div className="space-y-2 py-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );

  return (
    <PageLayout
      header={
        <PageHeader
          title={
            <div className="flex items-center gap-3">
              <Link
                href="/projects"
                className="flex items-center gap-1.5 text-sm text-[#6B7280] hover:text-[#111111]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
              <span className="text-2xl font-semibold tracking-tight text-[#111111]">
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
            <Button variant="ghost" size="sm" className="shrink-0 h-9">
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-[#6B7280] hover:text-red-600 h-9"
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
          <SectionHeader label="Financial overview" className="mb-2" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5 mb-4">
            <div className="kpi-metric">
              <span className="kpi-metric-label">Budget</span>
              <span className="kpi-metric-value mt-0.5 block">${fmtUsd(financialSummary.budget)}</span>
            </div>
            <div className="kpi-metric">
              <span className="kpi-metric-label">Spent</span>
              <span className="kpi-metric-value mt-0.5 block">${fmtUsd(financialSummary.spent)}</span>
            </div>
            <div className="kpi-metric">
              <span className="kpi-metric-label">Revenue</span>
              <span className="kpi-metric-value mt-0.5 block">${fmtUsd(financialSummary.revenue)}</span>
            </div>
            <div className="kpi-metric">
              <span className="kpi-metric-label">Collected</span>
              <span className="kpi-metric-value mt-0.5 block">${fmtUsd(financialSummary.collected)}</span>
            </div>
            <div className="kpi-metric">
              <span className="kpi-metric-label">Outstanding</span>
              <span className="kpi-metric-value mt-0.5 block">${fmtUsd(financialSummary.outstanding)}</span>
            </div>
            <div className="kpi-metric">
              <span className="kpi-metric-label">Profit</span>
              <span className={cn("kpi-metric-value mt-0.5 block", financialSummary.profit >= 0 ? "text-green-600" : "text-red-600")}>
                {financialSummary.profit >= 0 ? "" : "−"}${fmtUsd(Math.abs(financialSummary.profit))}
              </span>
            </div>
            <div className="kpi-metric lg:col-span-2">
              <span className="kpi-metric-label">Cashflow</span>
              <span className={cn("kpi-metric-value mt-0.5 block", financialSummary.cashflow >= 0 ? "text-green-600" : "text-red-600")}>
                {financialSummary.cashflow >= 0 ? "" : "−"}${fmtUsd(Math.abs(financialSummary.cashflow))}
              </span>
            </div>
          </div>
        </>
      ) : null}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="w-full">
        <TabsList className="h-9 w-full justify-start rounded-none border-0 border-b border-[#E5E7EB] bg-transparent p-0 gap-0 min-h-0">
          {(
            [
              { key: "overview" as const, label: "Overview" },
              { key: "tasks" as const, label: "Tasks" },
              { key: "schedule" as const, label: "Schedule" },
              { key: "financial" as const, label: "Financial" },
              { key: "budget" as const, label: "Budget" },
              { key: "expenses" as const, label: "Expenses" },
              { key: "labor" as const, label: "Labor" },
              { key: "subcontracts" as const, label: "Subcontracts" },
              { key: "bills" as const, label: "Bills" },
              { key: "documents" as const, label: "Documents" },
              { key: "activity" as const, label: "Activity" },
              { key: "change-orders" as const, label: "Change Orders" },
              { key: "materials" as const, label: "Material Selections" },
              { key: "closeout" as const, label: "Closeout" },
              { key: "commission" as const, label: "Commission" },
              { key: "punch-list" as const, label: "Punch List" },
            ] as const
          ).map((t) => (
            <TabsTrigger
              key={t.key}
              value={t.key}
              className="rounded-none border-b-2 border-transparent px-3 py-2 text-sm text-[#6B7280] data-[state=active]:border-[#111111] data-[state=active]:text-[#111111] data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-3">
          <SectionHeader label="Summary" />
          <Divider />
          <DataTable<SummaryRow> columns={summaryColumns} data={summaryRows} getRowId={(r) => r.id} />

          <SectionHeader label="Recent expense lines" className="mt-6" />
          <Divider />
          {loadingTab === "overview" && !cache.overview ? skeletonTable : (
            <DataTable<RecentExpenseRow> columns={expenseColumns} data={recentExpenseRows} getRowId={(r) => r.id} />
          )}
          <SectionHeader label="Activity" className="mt-6" />
          <Divider />
          {loadingTab === "overview" && !cache.overview ? skeletonTable : (
            <DataTable<ProjectTransactionRow> columns={activityColumns} data={overviewTransactions} getRowId={(r) => r.id} />
          )}
        </TabsContent>

        <TabsContent value="tasks" className="mt-3">
          {loadingTab === "tasks" && !cache.tasks ? skeletonTable : (
            <ProjectTasksTab
              projectId={projectId}
              tasks={cache.tasks?.tasks ?? []}
              workers={cache.tasks?.workers ?? []}
              onTaskCreated={() => {
                setCache((prev) => ({ ...prev, tasks: undefined }));
                fetchTab("tasks");
              }}
              onTaskUpdated={() => {
                setCache((prev) => ({ ...prev, tasks: undefined }));
                fetchTab("tasks");
              }}
            />
          )}
        </TabsContent>

        <TabsContent value="schedule" className="mt-3">
          <SectionHeader label="Schedule" />
          <Divider />
          {loadingTab === "schedule" && !cache.schedule ? skeletonTable : (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              {(cache.schedule?.schedule ?? []).length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">No schedule items yet.</div>
              ) : (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left py-2.5 px-3 text-xs font-medium uppercase tracking-wide text-gray-500">Task</th>
                      <th className="text-left py-2.5 px-3 text-xs font-medium uppercase tracking-wide text-gray-500">Start date</th>
                      <th className="text-left py-2.5 px-3 text-xs font-medium uppercase tracking-wide text-gray-500">End date</th>
                      <th className="text-left py-2.5 px-3 text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(cache.schedule?.schedule ?? []).map((s) => (
                      <tr key={s.id} className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50/80 transition-colors">
                        <td className="py-2 px-3 font-medium text-gray-900">{s.title || "—"}</td>
                        <td className="py-2 px-3 text-gray-600">{s.start_date ? new Date(s.start_date).toLocaleDateString() : "—"}</td>
                        <td className="py-2 px-3 text-gray-600">{s.end_date ? new Date(s.end_date).toLocaleDateString() : "—"}</td>
                        <td className="py-2 px-3 text-gray-600">{s.status ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="financial" className="mt-3">
          <SectionHeader label="Financial summary" />
          <Divider />
          {loadingTab === "financial" && !cache.financial ? skeletonTable : null}
          {tabError && tab === "financial" ? (
            <p className="py-4 text-sm text-red-600">{tabError}</p>
          ) : null}

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

        <TabsContent value="budget" className="mt-3">
          <SectionHeader label="Budget vs actual" />
          <Divider />
          {loadingTab === "budget" && !cache.budget ? skeletonTable : null}
          {cache.budget ? (
            (() => {
              const sourceFromEstimate = cache.budget?.sourceFromEstimate;
              const budgetRevenue = sourceFromEstimate?.snapshotRevenue ?? project.budget;
              const breakdown = sourceFromEstimate?.snapshotBudgetBreakdown;
              const budgetCost =
                sourceFromEstimate?.snapshotBudgetCost ??
                (breakdown ? breakdown.materials + breakdown.labor + breakdown.vendor + breakdown.other : project.budget);
              const budgetProfit = budgetRevenue - budgetCost;
              const budgetMarginPct = budgetRevenue > 0 ? (budgetProfit / budgetRevenue) * 100 : 0;
              const revenueVar = canonicalProfit.revenue - budgetRevenue;
              const costVar = canonicalProfit.actualCost - budgetCost;
              const profitVar = canonicalProfit.profit - budgetProfit;
              const marginVar = canonicalProfit.margin * 100 - budgetMarginPct;
              const fmt = (n: number) => `$${n.toLocaleString()}`;
              const fmtPct = (n: number) => `${n.toFixed(1)}%`;
              const varStr = (v: number, isPct = false) =>
                `${v >= 0 ? "+" : "−"}${isPct ? Math.abs(v).toFixed(1) + "%" : fmt(Math.abs(v))}`;
              const budgetRows: BudgetRow[] = [
                { id: "revenue", metric: "Revenue", budget: fmt(budgetRevenue), actual: fmt(canonicalProfit.revenue), variance: varStr(revenueVar) },
                { id: "cost", metric: "Cost", budget: fmt(budgetCost), actual: fmt(canonicalProfit.actualCost), variance: varStr(costVar) },
                {
                  id: "profit",
                  metric: "Profit",
                  budget: `${budgetProfit < 0 ? "−" : ""}${fmt(Math.abs(budgetProfit))}`,
                  actual: `${canonicalProfit.profit < 0 ? "−" : ""}${fmt(Math.abs(canonicalProfit.profit))}`,
                  variance: varStr(profitVar),
                },
                { id: "margin", metric: "Margin %", budget: fmtPct(budgetMarginPct), actual: fmtPct(canonicalProfit.margin * 100), variance: varStr(marginVar, true) },
              ];
              return (
                <DataTable<BudgetRow> columns={budgetColumns} data={budgetRows} getRowId={(r) => r.id} />
              );
            })()
          ) : null}
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

        <TabsContent value="expenses" className="mt-3">
          <SectionHeader label="Expense lines" />
          <Divider />
          {loadingTab === "expenses" && !cache.expenses ? skeletonTable : (
            <DataTable<RecentExpenseRow> columns={expenseColumns} data={expenseRows} getRowId={(r) => r.id} />
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-3">
          {loadingTab === "documents" && !cache.documents ? skeletonTable : (
            <ProjectDocumentsTab projectId={projectId} documents={cache.documents?.documents ?? []} />
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-3">
          <SectionHeader label="Activity log" />
          <Divider />
          {loadingTab === "activity" && !cache.activity ? skeletonTable : (
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                {(cache.activity?.activityLogs ?? []).length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-500">No activity yet.</div>
                ) : (
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="text-left py-2.5 px-3 text-xs font-medium uppercase tracking-wide text-gray-500">Date</th>
                        <th className="text-left py-2.5 px-3 text-xs font-medium uppercase tracking-wide text-gray-500">Type</th>
                        <th className="text-left py-2.5 px-3 text-xs font-medium uppercase tracking-wide text-gray-500">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(cache.activity?.activityLogs ?? []).map((a) => (
                        <tr key={a.id} className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50/80 transition-colors">
                          <td className="py-2 px-3 text-gray-600">
                            {new Date(a.created_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                          </td>
                          <td className="py-2 px-3 font-medium text-gray-900 capitalize">{a.type.replace(/_/g, " ")}</td>
                          <td className="py-2 px-3 text-gray-600">{a.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <SectionHeader label="Transactions" className="mt-6" />
              <Divider />
              <DataTable<ProjectTransactionRow> columns={activityColumns} data={cache.activity?.transactions ?? []} getRowId={(r) => r.id} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="materials" className="mt-3">
          {loadingTab === "materials" && !cache.materials ? skeletonTable : (
            <ProjectMaterialsTab
              projectId={projectId}
              projectName={project.name}
              clientName={(project as { client_name?: string }).client_name}
              selections={cache.materials?.selections ?? []}
              catalog={cache.materials?.catalog ?? []}
              onRefresh={() => {
                setCache((prev) => ({ ...prev, materials: undefined }));
                fetchTab("materials");
              }}
            />
          )}
        </TabsContent>

        <TabsContent value="closeout" className="mt-3">
          {loadingTab === "closeout" && !cache.closeout ? skeletonTable : (
            <ProjectCloseoutTab
              projectId={projectId}
              projectName={project.name}
              billingSummary={billingSummary}
              contractValue={canonicalProfit.revenue}
              punch={cache.closeout?.punch ?? null}
              warranty={cache.closeout?.warranty ?? null}
              completion={cache.closeout?.completion ?? null}
              onRefresh={() => {
                setCache((prev) => ({ ...prev, closeout: undefined }));
                fetchTab("closeout");
              }}
            />
          )}
        </TabsContent>

        <TabsContent value="commission" className="mt-3">
          {loadingTab === "commission" && !cache.commission ? skeletonTable : (
            <ProjectCommissionTab
              projectId={projectId}
              commissions={cache.commission?.commissions ?? []}
              onRefresh={() => {
                setCache((prev) => ({ ...prev, commission: undefined }));
                fetchTab("commission");
              }}
            />
          )}
        </TabsContent>

        <TabsContent value="punch-list" className="mt-3">
          {loadingTab === "punch-list" && !cache["punch-list"] ? skeletonTable : (
            <ProjectPunchListTab
              projectId={projectId}
              punchItems={cache["punch-list"]?.punchItems ?? []}
            />
          )}
        </TabsContent>

        <TabsContent value="change-orders" className="mt-3">
          <SectionHeader
            label="Change orders"
            action={
              <Link href={`/projects/${projectId}/change-orders/new`} className="text-xs text-muted-foreground hover:text-foreground">
                New
              </Link>
            }
          />
          <Divider />
          {loadingTab === "change-orders" && !cache["change-orders"] ? skeletonTable : null}
          {(cache["change-orders"]?.changeOrders ?? []).length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No change orders yet.</p>
          ) : (
            <DataTable<ChangeOrderRow>
              columns={changeOrderColumns}
              data={(cache["change-orders"]?.changeOrders ?? []).map((co) => ({ id: co.id, number: co.number, status: co.status, total: co.total, date: co.date }))}
              getRowId={(r) => r.id}
              onRowClick={(r) => router.push(`/projects/${projectId}/change-orders/${r.id}`)}
            />
          )}
        </TabsContent>

        <TabsContent value="labor" className="mt-3">
          {loadingTab === "labor" && !cache.labor ? skeletonTable : null}
          {(() => {
            const laborEntries = cache.labor?.laborEntries ?? [];
            const byStatus: Record<"Draft" | "Submitted" | "Approved" | "Locked", number> = {
              Draft: 0,
              Submitted: 0,
              Approved: 0,
              Locked: 0,
            };
            const byStatusHours = { Draft: 0, Submitted: 0, Approved: 0, Locked: 0 };
            let totalHours = 0;
            let totalLaborCost = 0;
            const approvedByWorker = new Map<string, { worker_name: string; days: number; totalLaborCost: number }>();
            for (const e of laborEntries) {
              totalHours += e.hours ?? 0;
              const st = e.status as "Draft" | "Submitted" | "Approved" | "Locked";
              if (st in byStatus) byStatus[st] += 1;
              const hrs = e.hours ?? 0;
              if (st === "Draft") byStatusHours.Draft += hrs;
              else if (st === "Submitted") byStatusHours.Submitted += hrs;
              else if (st === "Approved") byStatusHours.Approved += hrs;
              else if (st === "Locked") byStatusHours.Locked += hrs;
              if (st === "Approved" || st === "Locked") {
                totalLaborCost += e.cost_amount ?? 0;
                const cur = approvedByWorker.get(e.worker_id);
                const name = e.worker_name ?? "—";
                if (cur) {
                  cur.days += 1;
                  cur.totalLaborCost += e.cost_amount ?? 0;
                } else {
                  approvedByWorker.set(e.worker_id, { worker_name: name, days: 1, totalLaborCost: e.cost_amount ?? 0 });
                }
              }
            }
            const laborSummary: ProjectLaborSummary = {
              totalHours,
              totalLaborCost,
              byStatus: { ...byStatus },
              byStatusHours: { ...byStatusHours },
              approvedLaborRows: Array.from(approvedByWorker.entries()).map(([worker_id, v]) => ({
                worker_id,
                worker_name: v.worker_name,
                days: v.days,
                total_labor_cost: v.totalLaborCost,
              })),
            };
            return (
              <>
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
          <SectionHeader label="Approved labor by worker" className="mt-3" />
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
              </>
            );
          })()}
        </TabsContent>

        <TabsContent value="subcontracts" className="mt-3">
          <SectionHeader
            label="Subcontract summary"
            action={
              <Link href={`/projects/${projectId}/subcontracts`} className="text-xs text-muted-foreground hover:text-foreground">
                Manage subcontracts
              </Link>
            }
          />
          <Divider />
          {loadingTab === "subcontracts" && !cache.subcontracts ? skeletonTable : null}
          {(() => {
            const subcontracts = cache.subcontracts?.subcontracts ?? [];
            const bills = cache.subcontracts?.bills ?? [];
            const payments = cache.subcontracts?.payments ?? [];
            const approvedBySubcontractId = new Map<string, number>();
            for (const b of bills) {
              if (b.status !== "Approved" && b.status !== "Paid") continue;
              approvedBySubcontractId.set(b.subcontract_id, (approvedBySubcontractId.get(b.subcontract_id) ?? 0) + b.amount);
            }
            const paidBySubcontractId = new Map<string, number>();
            for (const p of payments) {
              paidBySubcontractId.set(p.subcontract_id, (paidBySubcontractId.get(p.subcontract_id) ?? 0) + p.amount);
            }
            const subcontractSummaryRows: SubcontractSummaryRow[] = subcontracts.map((s) => {
              const approved = approvedBySubcontractId.get(s.id) ?? 0;
              const paid = paidBySubcontractId.get(s.id) ?? 0;
              const balanceDue = approved - paid;
              return {
                id: s.id,
                subcontractor_name: s.subcontractor_name,
                contract_amount: s.contract_amount,
                approved,
                paid,
                retainage_held: 0,
                balance_due: balanceDue,
              };
            });

            if (subcontractSummaryRows.length === 0) {
              return <p className="py-6 text-sm text-muted-foreground">No subcontracts for this project.</p>;
            }
            return (
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
                          <Link href={`/projects/${projectId}/subcontracts/${r.id}/bills`} className="text-xs text-muted-foreground hover:text-foreground">
                            Bills
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="bills" className="mt-3">
          <SectionHeader
            label="Bills (AP)"
            action={
              <Link href={`/bills?project_id=${projectId}`} className="text-xs text-muted-foreground hover:text-foreground">
                View all
              </Link>
            }
          />
          <Divider />
          {loadingTab === "bills" && !cache.bills ? skeletonTable : null}
          {(cache.bills?.projectBills ?? []).length === 0 ? (
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
                  {(cache.bills?.projectBills ?? []).map((b) => (
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
              This project has related records.
            </DialogDescription>
          </DialogHeader>
          {deleteBlockedCounts && (
            <ul className="text-sm text-foreground list-disc list-inside space-y-1">
              {deleteModalCountLabels.map(({ key, label }) => {
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
          <DialogFooter className="gap-2 pt-3 border-t border-border/60 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => setDeleteBlockedOpen(false)}>
              Cancel
            </Button>
            {(deleteBlockedCounts?.expenses ?? 0) > 0 && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/financial/expenses?project_id=${projectId}`} onClick={() => setDeleteBlockedOpen(false)}>
                  View Expenses
                </Link>
              </Button>
            )}
            {(deleteBlockedCounts?.labor_entries ?? 0) > 0 && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/labor?project_id=${projectId}`} onClick={() => setDeleteBlockedOpen(false)}>
                  View Labor
                </Link>
              </Button>
            )}
            {(deleteBlockedCounts?.worker_receipts ?? 0) > 0 && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/labor/receipts?project_id=${projectId}`} onClick={() => setDeleteBlockedOpen(false)}>
                  View Receipts
                </Link>
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
