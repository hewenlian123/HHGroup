"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import {
  PageLayout,
  PageHeader,
  Divider,
  SectionHeader,
  StatusBadge,
} from "@/components/base";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/toast/toast-provider";
import type { Project, ProjectFinancialSummary } from "@/lib/data";
import type { CanonicalProjectProfit } from "@/lib/profit-engine";
import { ProjectDocumentsTab } from "./project-documents-tab";
import { ProjectTasksTab } from "./project-tasks-tab";
import { ProjectCloseoutTab } from "./project-closeout-tab";
import { ProjectMaterialsTab } from "./project-materials-tab";
import { ProjectCommissionTab } from "./project-commission-tab";
import { ProjectPunchListTab } from "./project-punch-list-tab";
import { RecentExpenseLines } from "./recent-expense-lines";
import {
  archiveProjectAction,
  deleteProjectAction,
} from "../actions";

type TabKey =
  | "overview"
  | "tasks"
  | "schedule"
  | "financial"
  | "budget"
  | "expenses"
  | "labor"
  | "subcontracts"
  | "bills"
  | "documents"
  | "activity"
  | "change-orders"
  | "materials"
  | "closeout"
  | "commission"
  | "punch-list";

export interface ProjectDetailTabsClientProps {
  projectId: string;
  project: Project;
  financialSummary: ProjectFinancialSummary | null;
  billingSummary: {
    invoicedTotal: number;
    paidTotal: number;
    arBalance: number;
    lastPaymentDate: string | null;
  };
  canonicalProfit: CanonicalProjectProfit;
  initialTab: TabKey;
  tasks: import("@/lib/data").ProjectTaskWithWorker[];
  workers: import("@/lib/labor-db").Worker[];
  recentExpenseLines: import("./recent-expense-lines").RecentExpenseLineRow[];
  laborEntries: import("@/lib/daily-labor-db").LaborEntryWithJoins[];
  documents: import("@/lib/data").DocumentRow[];
  commissions: import("@/lib/data").ProjectCommission[];
  materialSelections: import("@/lib/data").ProjectMaterialSelectionWithMaterial[];
  materialCatalog: import("@/lib/data").MaterialCatalogRow[];
  punchItems: import("@/lib/punch-list-db").PunchListItemWithJoins[];
  subcontracts: import("@/lib/subcontracts-db").SubcontractWithSubcontractor[];
  bills: import("@/lib/ap-bills-db").ApBillWithProject[];
  activityLogs: import("@/lib/activity-logs-db").ActivityLog[];
  changeOrders: import("@/lib/change-orders-db").ChangeOrder[];
  budgetItems: import("@/lib/data").ProjectBudgetItem[];
  closeoutPunch: import("@/lib/data").CloseoutPunch | null;
  closeoutWarranty: import("@/lib/data").CloseoutWarranty | null;
  closeoutCompletion: import("@/lib/data").CloseoutCompletion | null;
}

const skeletonTable = (
  <div className="space-y-2 py-4">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="h-10 w-full animate-pulse rounded-sm bg-muted" />
    ))}
  </div>
);

export function ProjectDetailTabsClient({
  projectId,
  project,
  financialSummary,
  billingSummary,
  canonicalProfit,
  initialTab,
  tasks,
  workers,
  recentExpenseLines,
  laborEntries,
  documents,
  commissions,
  materialSelections,
  materialCatalog,
  punchItems,
  subcontracts,
  bills,
  activityLogs,
  changeOrders,
  budgetItems,
  closeoutPunch,
  closeoutWarranty,
  closeoutCompletion,
}: ProjectDetailTabsClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = React.useState<TabKey>(initialTab);

  const subtitle = [
    `Budget $${(financialSummary?.budget ?? project.budget ?? 0).toLocaleString()}`,
    `Spent $${(financialSummary?.spent ?? canonicalProfit.actualCost).toLocaleString()}`,
    `Profit ${canonicalProfit.profit >= 0 ? "" : "−"}$${Math.abs(
      canonicalProfit.profit,
    ).toLocaleString()}`,
    `Margin ${(canonicalProfit.margin * 100).toFixed(1)}%`,
  ].join(" · ");

  return (
    <PageLayout
      header={
        <PageHeader
          title={
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Link
                  href="/projects"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Projects
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[24px] font-semibold tracking-tight text-foreground">
                  {project.name}
                </h1>
                <StatusBadge
                  label={
                    project.status.charAt(0).toUpperCase() +
                    project.status.slice(1)
                  }
                  variant={
                    project.status === "active"
                      ? "success"
                      : project.status === "pending"
                      ? "warning"
                      : "muted"
                  }
                />
                <span className="text-[13px] text-muted-foreground">
                  {subtitle}
                </span>
              </div>
            </div>
          }
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-sm"
                  aria-label="Project actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[180px]">
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    router.push(`/projects/${projectId}/edit`);
                  }}
                >
                  Edit project
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={async (e) => {
                    e.preventDefault();
                    const res = await archiveProjectAction(projectId);
                    if (res?.error) {
                      toast({
                        title: "Archive failed",
                        description: res.error,
                        variant: "error",
                      });
                    } else {
                      toast({ title: "Project archived" });
                      router.refresh();
                    }
                  }}
                >
                  Archive project
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={async (e) => {
                    e.preventDefault();
                    if (
                      !window.confirm(
                        `Delete project "${project.name}"? This cannot be undone.`,
                      )
                    )
                      return;
                    const res = await deleteProjectAction(projectId);
                    if (res?.blocked) {
                      toast({
                        title: "Cannot delete project",
                        description:
                          "This project has related records. Please archive instead or remove related data.",
                        variant: "error",
                      });
                    } else if (res?.error) {
                      toast({
                        title: "Delete failed",
                        description: res.error,
                        variant: "error",
                      });
                    }
                    // On success, deleteProjectAction will redirect server-side.
                  }}
                >
                  Delete project…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      }
    >
      <div className="bg-[#F9FAFB] -mx-4 -mb-4 px-4 pb-6 sm:-mx-6 sm:px-6">
        <div className="bg-white rounded-sm px-4 py-3 sm:px-5 sm:py-4 space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="w-full">
        <div className="flex items-center justify-between gap-2 border-b border-border/60">
          <TabsList className="h-9 flex-1 justify-start rounded-none border-0 bg-transparent p-0 gap-0 min-h-0 overflow-x-auto whitespace-nowrap">
            {(
              [
                { key: "overview" as const, label: "Overview" },
                { key: "tasks" as const, label: "Tasks" },
                { key: "schedule" as const, label: "Schedule" },
                { key: "financial" as const, label: "Financial" },
                { key: "documents" as const, label: "Documents" },
              ] as const
            ).map((t) => (
              <TabsTrigger
                key={t.key}
                value={t.key}
                className="rounded-none border-b-2 border-transparent px-3 py-2 text-xs sm:text-sm text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                {t.label}
              </TabsTrigger>
            ))}
            {/* Hidden triggers for secondary tabs so keyboard navigation still works */}
            {(
              [
                { key: "budget" as const, label: "Budget" },
                { key: "expenses" as const, label: "Expenses" },
                { key: "labor" as const, label: "Labor" },
                { key: "subcontracts" as const, label: "Subcontracts" },
                { key: "bills" as const, label: "Bills" },
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
                className="hidden"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-muted-foreground"
              >
                More ▾
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              {(
                [
                  { key: "budget" as const, label: "Budget" },
                  { key: "expenses" as const, label: "Expenses" },
                  { key: "labor" as const, label: "Labor" },
                  { key: "subcontracts" as const, label: "Subcontracts" },
                  { key: "bills" as const, label: "Bills" },
                  { key: "activity" as const, label: "Activity" },
                  { key: "change-orders" as const, label: "Change Orders" },
                  { key: "materials" as const, label: "Material Selections" },
                  { key: "closeout" as const, label: "Closeout" },
                  { key: "commission" as const, label: "Commission" },
                  { key: "punch-list" as const, label: "Punch List" },
                ] as const
              ).map((item) => (
                <DropdownMenuItem
                  key={item.key}
                  onSelect={(e) => {
                    e.preventDefault();
                    setTab(item.key);
                  }}
                >
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <TabsContent value="overview" className="mt-4 space-y-4">
          {/* Metrics strip */}
          {financialSummary && (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
              <div className="flex flex-col justify-between rounded-[8px] border border-[#F0F0F0] bg-[#FAFAFA] px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.08em]">
                  Budget
                </span>
                <span className="mt-1 text-[18px] leading-tight font-medium tabular-nums">
                  ${financialSummary.budget.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex flex-col justify-between rounded-[8px] border border-[#F0F0F0] bg-[#FAFAFA] px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.08em]">
                  Spent
                </span>
                <span className="mt-1 text-[18px] leading-tight font-medium tabular-nums">
                  ${financialSummary.spent.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex flex-col justify-between rounded-[8px] border border-[#F0F0F0] bg-[#FAFAFA] px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.08em]">
                  Revenue
                </span>
                <span className="mt-1 text-[18px] leading-tight font-medium tabular-nums">
                  ${financialSummary.revenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex flex-col justify-between rounded-[8px] border border-[#F0F0F0] bg-[#FAFAFA] px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.08em]">
                  Collected
                </span>
                <span className="mt-1 text-[18px] leading-tight font-medium tabular-nums">
                  ${financialSummary.collected.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex flex-col justify-between rounded-[8px] border border-[#F0F0F0] bg-[#FAFAFA] px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.08em]">
                  Outstanding
                </span>
                <span className="mt-1 text-[18px] leading-tight font-medium tabular-nums">
                  ${financialSummary.outstanding.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex flex-col justify-between rounded-[8px] border border-[#F0F0F0] bg-[#FAFAFA] px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.08em]">
                  Profit
                </span>
                <span className="mt-1 text-[18px] leading-tight font-medium tabular-nums">
                  {canonicalProfit.profit >= 0 ? "" : "−"}$
                  {Math.abs(canonicalProfit.profit).toLocaleString("en-US", {
                    maximumFractionDigits: 0,
                  })}
                </span>
              </div>
            </div>
          )}

          {/* Project summary */}
          <div className="rounded-sm border border-border/60 bg-background px-3 py-3">
            <SectionHeader
              label="Project summary"
              className="text-[11px] tracking-[0.08em] text-[#9CA3AF] font-medium"
            />
            <Divider />
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="text-[#9CA3AF]">Client</span>
                <span className="truncate text-right text-[#111827]">
                  {(project as { client_name?: string }).client_name ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="text-[#9CA3AF]">Contract value</span>
                <span className="tabular-nums text-right text-[#111827]">
                  ${canonicalProfit.revenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="text-[#9CA3AF]">Budget</span>
                <span className="tabular-nums text-right text-[#111827]">
                  $
                  {(financialSummary?.budget ?? project.budget ?? 0).toLocaleString("en-US", {
                    maximumFractionDigits: 0,
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="text-[#9CA3AF]">Spent</span>
                <span className="tabular-nums text-right text-[#111827]">
                  $
                  {(financialSummary?.spent ?? canonicalProfit.actualCost).toLocaleString(
                    "en-US",
                    { maximumFractionDigits: 0 },
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="text-[#9CA3AF]">Profit</span>
                <span className="tabular-nums text-right text-[#111827]">
                  {canonicalProfit.profit >= 0 ? "" : "−"}$
                  {Math.abs(canonicalProfit.profit).toLocaleString("en-US", {
                    maximumFractionDigits: 0,
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="text-[#9CA3AF]">Margin</span>
                <span className="tabular-nums text-right text-[#111827]">
                  {(canonicalProfit.margin * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-sm border border-border/60 bg-background px-3 py-3">
              <SectionHeader
                label="Recent expense lines"
                className="text-[11px] tracking-[0.08em] text-[#9CA3AF] font-medium"
              />
              <Divider />
              <div className="mt-2">
                <RecentExpenseLines rows={recentExpenseLines} />
              </div>
              {recentExpenseLines.length > 0 && (
                <div className="mt-2 border-t border-border/60 pt-2">
                  <Link
                    href={`/projects/${projectId}?tab=expenses`}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    View all in Expenses tab →
                  </Link>
                </div>
              )}
            </div>
            <div className="rounded-sm border border-border/60 bg-background px-3 py-3">
              <SectionHeader
                label="Activity feed"
                className="text-[11px] tracking-[0.08em] text-[#9CA3AF] font-medium"
              />
              <Divider />
              {activityLogs.length === 0 ? (
                <p className="py-4 text-xs text-muted-foreground">No recent activity.</p>
              ) : (
                <ul className="space-y-2 py-2">
                  {activityLogs.slice(0, 5).map((log) => (
                    <li key={log.id} className="text-xs text-foreground">
                      <span className="text-muted-foreground">{log.created_at?.slice(0, 16).replace("T", " ")}</span>
                      {" — "}
                      {log.description ?? log.type}
                    </li>
                  ))}
                </ul>
              )}
              {activityLogs.length > 0 && (
                <div className="mt-2 border-t border-border/60 pt-2">
                  <Link
                    href={`/projects/${projectId}?tab=activity`}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    View all in Activity tab →
                  </Link>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <ProjectTasksTab
            projectId={projectId}
            tasks={tasks}
            workers={workers}
            onTaskCreated={() => router.refresh()}
            onTaskUpdated={() => router.refresh()}
          />
        </TabsContent>

        <TabsContent value="schedule" className="mt-4">
          <SectionHeader
            label="Schedule"
            className="text-[11px] tracking-[0.08em] text-[#9CA3AF] font-medium"
          />
          <Divider />
          {skeletonTable}
        </TabsContent>

        <TabsContent value="financial" className="mt-4">
          <SectionHeader
            label="Financial"
            className="text-[11px] tracking-[0.08em] text-[#9CA3AF] font-medium"
          />
          <Divider />
          {skeletonTable}
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <ProjectDocumentsTab projectId={projectId} documents={documents} />
        </TabsContent>

        <TabsContent value="expenses" className="mt-4">
          <SectionHeader label="Expenses" className="text-[11px] tracking-[0.08em] text-muted-foreground font-medium" />
          <Divider />
          <div className="mt-2">
            <RecentExpenseLines rows={recentExpenseLines} />
          </div>
          <div className="mt-3">
            <Link href={`/financial/expenses?project_id=${encodeURIComponent(projectId)}`} className="text-xs font-medium text-muted-foreground hover:text-foreground">
              View all expenses →
            </Link>
          </div>
        </TabsContent>
        <TabsContent value="budget" className="mt-4">
          <SectionHeader label="Budget" className="text-[11px] tracking-[0.08em] text-muted-foreground font-medium" />
          <Divider />
          {budgetItems.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No budget items for this project.</p>
          ) : (
            <div className="border border-border/60 rounded-sm overflow-hidden mt-2">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/10">
                    <th className="text-left py-2 px-3 font-medium">Cost code</th>
                    <th className="text-right py-2 px-3 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {budgetItems.map((b) => (
                    <tr key={b.id} className="border-b border-border/30">
                      <td className="py-2 px-3">{b.costCode ?? "—"}</td>
                      <td className="py-2 px-3 text-right tabular-nums">${Number(b.total || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <SectionHeader label="Activity" className="text-[11px] tracking-[0.08em] text-muted-foreground font-medium" />
          <Divider />
          {activityLogs.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No activity for this project.</p>
          ) : (
            <ul className="space-y-2 py-2">
              {activityLogs.map((log) => (
                <li key={log.id} className="text-sm border-b border-border/30 pb-2">
                  <span className="text-muted-foreground">{log.created_at?.slice(0, 19).replace("T", " ")}</span>
                  {" — "}
                  {log.description ?? log.type}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="change-orders" className="mt-4">
          <SectionHeader label="Change Orders" className="text-[11px] tracking-[0.08em] text-muted-foreground font-medium" />
          <Divider />
          {changeOrders.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No change orders for this project.</p>
          ) : (
            <div className="border border-border/60 rounded-sm overflow-hidden mt-2">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/10">
                    <th className="text-left py-2 px-3 font-medium">Number</th>
                    <th className="text-left py-2 px-3 font-medium">Status</th>
                    <th className="text-right py-2 px-3 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {changeOrders.map((co) => (
                    <tr key={co.id} className="border-b border-border/30">
                      <td className="py-2 px-3">{co.number ?? "—"}</td>
                      <td className="py-2 px-3">{co.status ?? "—"}</td>
                      <td className="py-2 px-3 text-right tabular-nums">${Number(co.total ?? co.amount ?? 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
        <TabsContent value="materials" className="mt-4">
          <ProjectMaterialsTab
            projectId={projectId}
            projectName={project.name}
            clientName={(project as { client_name?: string }).client_name}
            selections={materialSelections}
            catalog={materialCatalog}
            onRefresh={() => router.refresh()}
          />
        </TabsContent>
        <TabsContent value="closeout" className="mt-4">
          <ProjectCloseoutTab
            projectId={projectId}
            projectName={project.name}
            billingSummary={billingSummary}
            contractValue={canonicalProfit.revenue}
            punch={closeoutPunch}
            warranty={closeoutWarranty}
            completion={closeoutCompletion}
            onRefresh={() => router.refresh()}
          />
        </TabsContent>
        <TabsContent value="commission" className="mt-4">
          <ProjectCommissionTab
            projectId={projectId}
            commissions={commissions}
            onRefresh={() => router.refresh()}
          />
        </TabsContent>
        <TabsContent value="punch-list" className="mt-4">
          <ProjectPunchListTab projectId={projectId} punchItems={punchItems} />
        </TabsContent>
        <TabsContent value="subcontracts" className="mt-4">
          <SectionHeader label="Subcontracts" className="text-[11px] tracking-[0.08em] text-muted-foreground font-medium" />
          <Divider />
          {subcontracts.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No subcontracts for this project.</p>
          ) : (
            <div className="border border-border/60 rounded-sm overflow-hidden mt-2">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/10">
                    <th className="text-left py-2 px-3 font-medium">Subcontractor</th>
                    <th className="text-right py-2 px-3 font-medium">Contract amount</th>
                  </tr>
                </thead>
                <tbody>
                  {subcontracts.map((s) => (
                    <tr key={s.id} className="border-b border-border/30">
                      <td className="py-2 px-3">{s.subcontractor_name ?? "—"}</td>
                      <td className="py-2 px-3 text-right tabular-nums">${Number(s.contract_amount ?? 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
        <TabsContent value="bills" className="mt-4">
          <SectionHeader label="Bills (AP)" className="text-[11px] tracking-[0.08em] text-muted-foreground font-medium" />
          <Divider />
          {bills.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No bills for this project.</p>
          ) : (
            <div className="border border-border/60 rounded-sm overflow-hidden mt-2">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/10">
                    <th className="text-left py-2 px-3 font-medium">Vendor</th>
                    <th className="text-left py-2 px-3 font-medium">Bill no</th>
                    <th className="text-right py-2 px-3 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((b) => (
                    <tr key={b.id} className="border-b border-border/30">
                      <td className="py-2 px-3">{b.vendor_name ?? "—"}</td>
                      <td className="py-2 px-3">{b.bill_no ?? "—"}</td>
                      <td className="py-2 px-3 text-right tabular-nums">${Number(b.amount ?? 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
        <TabsContent value="labor" className="mt-4">
          <SectionHeader label="Labor" className="text-[11px] tracking-[0.08em] text-muted-foreground font-medium" />
          <Divider />
          {laborEntries.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No labor entries for this project.</p>
          ) : (
            <>
              <div className="border border-border/60 rounded-sm overflow-hidden mt-2">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/10">
                      <th className="text-left py-2 px-3 font-medium">Worker</th>
                      <th className="text-left py-2 px-3 font-medium">Date</th>
                      <th className="text-right py-2 px-3 font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {laborEntries.slice(0, 20).map((e) => (
                      <tr key={e.id} className="border-b border-border/30">
                        <td className="py-2 px-3">{e.worker_name ?? "—"}</td>
                        <td className="py-2 px-3">{e.work_date?.slice(0, 10)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">${Number(e.cost_amount ?? 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3">
                <Link href={`/projects/${projectId}/labor`} className="text-xs font-medium text-muted-foreground hover:text-foreground">
                  View full labor log →
                </Link>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
        </div>
      </div>
    </PageLayout>
  );
}

