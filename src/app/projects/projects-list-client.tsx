"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2 } from "lucide-react";
import { PageLayout, PageHeader, ActionBar } from "@/components/base";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { deleteProjectAction, getProjectUsageAction, archiveProjectAction } from "./actions";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/components/toast/toast-provider";
import type { ProjectUsageCounts } from "@/lib/data";

export type ProjectsListRow = {
  id: string;
  name: string;
  clientName: string | null;
  status: string;
  budget: number;
  spent: number;
  progressPct: number;
  startDate: string | null;
  endDate: string | null;
  risk: "red" | "yellow" | "green";
};

function statusVariant(
  status: string
): "default" | "success" | "warning" | "muted" {
  const s = status.toLowerCase();
  if (s === "active") return "success";
  if (s === "pending") return "warning";
  if (s === "completed") return "muted";
  return "default";
}

function statusLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === "active") return "Active";
  if (s === "pending") return "Pending";
  if (s === "completed") return "Closed";
  return status;
}

/** Compact status badge: Active green, Closed gray. 11px, 2px 6px, rounded 6px. */
const ProjectStatusBadge = React.memo(function ProjectStatusBadge({ status }: { status: string }) {
  const label = statusLabel(status);
  const isActive = status.toLowerCase() === "active";
  return (
    <span
      className={cn(
        "inline-flex text-[11px] font-medium py-0.5 px-1.5 rounded-md",
        isActive ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-[#f3f4f6] text-[#6b7280]"
      )}
    >
      {label}
    </span>
  );
});

/** Memoized mobile card row. */
const ProjectMobileCard = React.memo(function ProjectMobileCard({
  row,
  onNavigate,
}: {
  row: ProjectsListRow;
  onNavigate: (id: string) => void;
}) {
  const progress = Math.max(0, Math.min(100, row.progressPct));
  const barTone = progress >= 95 ? "bg-emerald-500" : progress >= 70 ? "bg-amber-500" : "bg-emerald-400";
  return (
    <li className="border-b border-[#eee] last:border-b-0">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onNavigate(row.id)}
        onKeyDown={(e) => e.key === "Enter" && onNavigate(row.id)}
        className="py-3 px-3 hover:bg-[#fafafa] transition-colors text-left"
      >
        <div className="font-medium text-foreground">{row.name}</div>
        <div className="text-sm text-muted-foreground mt-0.5">Client: {row.clientName ?? "—"}</div>
        <div className="text-sm text-muted-foreground tabular-nums mt-0.5">
          Budget: ${row.budget.toLocaleString("en-US", { maximumFractionDigits: 0 })} · Spent: ${Math.round(row.spent).toLocaleString("en-US")}
        </div>
        <div className="flex items-center justify-between gap-2 mt-2">
          <ProjectStatusBadge status={row.status} />
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded bg-[#eee]" style={{ borderRadius: 4 }}>
              <div className={cn("h-full rounded", barTone)} style={{ width: `${progress}%`, borderRadius: 4 }} />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">{progress.toFixed(0)}%</span>
          </div>
        </div>
      </div>
    </li>
  );
});

/** Memoized table row with delete. */
const ProjectTableRow = React.memo(function ProjectTableRow({
  row,
  onNavigate,
  onDelete,
  deletingId,
}: {
  row: ProjectsListRow;
  onNavigate: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  deletingId: string | null;
}) {
  const progress = Math.max(0, Math.min(100, row.progressPct));
  const barTone = progress >= 95 ? "bg-emerald-500" : progress >= 70 ? "bg-amber-500" : "bg-emerald-400";
  const handleDelete = React.useCallback((ev: React.MouseEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    onDelete(row.id, row.name);
  }, [row.id, row.name, onDelete]);
  return (
    <tr
      onClick={() => onNavigate(row.id)}
      className="border-b border-[#eee] last:border-b-0 hover:bg-[#fafafa] cursor-pointer transition-colors"
    >
      <td className="py-2.5 px-3">
        <span className="font-medium text-foreground">{row.name}</span>
      </td>
      <td className="py-2.5 px-3 text-muted-foreground">{row.clientName ?? "—"}</td>
      <td className="py-2.5 px-3">
        <ProjectStatusBadge status={row.status} />
      </td>
      <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">
        ${row.budget.toLocaleString("en-US", { maximumFractionDigits: 0 })}
      </td>
      <td className="py-2.5 px-3 text-right tabular-nums font-medium">
        ${Math.round(row.spent).toLocaleString("en-US")}
      </td>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded bg-[#eee]" style={{ borderRadius: 4 }}>
            <div className={cn("h-full rounded", barTone)} style={{ width: `${progress}%`, borderRadius: 4 }} />
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">{progress.toFixed(0)}%</span>
        </div>
      </td>
      <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
          aria-label={`Delete ${row.name}`}
          disabled={deletingId === row.id}
          onClick={handleDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
});

export function ProjectsListClient({
  rows,
}: {
  rows: ProjectsListRow[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [view, setView] = React.useState<"all" | "active" | "closed">("all");
  const [query, setQuery] = React.useState("");
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [deleteBlockedOpen, setDeleteBlockedOpen] = React.useState(false);
  const [deleteBlockedCounts, setDeleteBlockedCounts] = React.useState<ProjectUsageCounts | null>(null);
  const [deleteBlockedProjectId, setDeleteBlockedProjectId] = React.useState<string | null>(null);

  const deleteModalRelatedConfig: { key: keyof ProjectUsageCounts; label: string; viewPath: string }[] = [
    { key: "project_tasks", label: "Tasks", viewPath: "/tasks" },
    { key: "expenses", label: "Expenses", viewPath: "/financial/expenses" },
    { key: "invoices", label: "Invoices", viewPath: "/financial/invoices" },
    { key: "labor_entries", label: "Labor Entries", viewPath: "/labor" },
    { key: "punch_list", label: "Punch List", viewPath: "/punch-list" },
    { key: "site_photos", label: "Site Photos", viewPath: "/site-photos" },
    { key: "project_change_orders", label: "Change Orders", viewPath: "/change-orders" },
    { key: "bills", label: "Bills", viewPath: "/bills" },
    { key: "worker_receipts", label: "Worker Receipts", viewPath: "/labor/receipts" },
    { key: "subcontracts", label: "Subcontracts", viewPath: "/projects" },
    { key: "materials", label: "Materials", viewPath: "/materials/catalog" },
  ];

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (view === "active") return r.status === "active";
        if (view === "closed") return r.status === "completed";
        return true;
      })
      .filter((r) => {
        if (!q) return true;
        return (
          r.name.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q) ||
          (r.clientName ?? "").toLowerCase().includes(q)
        );
      });
  }, [query, rows, view]);

  /** Project overview: totals from all rows (not filtered). */
  const overview = React.useMemo(() => {
    const totalProjects = rows.length;
    const activeProjects = rows.filter((r) => r.status === "active").length;
    const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
    const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
    return { totalProjects, activeProjects, totalBudget, totalSpent };
  }, [rows]);

  const handleNavigate = React.useCallback((id: string) => {
    router.push(`/projects/${id}`);
  }, [router]);

  const handleDelete = React.useCallback(async (id: string, name: string) => {
    const usage = await getProjectUsageAction(id);
    if (usage.blocked && usage.counts) {
      setDeleteBlockedCounts(usage.counts);
      setDeleteBlockedProjectId(id);
      setDeleteBlockedOpen(true);
      return;
    }
    if (!window.confirm(`Delete project "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      const result = await deleteProjectAction(id);
      if (result?.error && !result?.blocked) {
        const msg = String(result.error || "").trim();
        const friendly =
          /subcontract|contract|cannot|can'?t|关联|合同|不能/i.test(msg) ? msg : "Delete failed. Please try again.";
        toast({ title: "Error", description: friendly, variant: "error" });
      } else if (!result?.blocked) {
        router.refresh();
      }
    } finally {
      setDeletingId(null);
    }
  }, [router, toast]);

  const totalCount = rows.length;
  const subtitle =
    totalCount === 1 ? "1 project" : `${totalCount} projects`;

  return (
    <PageLayout
      header={
        <PageHeader
          title="Projects"
          description={subtitle}
        />
      }
      actionBar={
        <ActionBar
          left={
            <>
              <div className="inline-flex items-center rounded-md border border-border/60 bg-background p-0.5">
                <Button
                  type="button"
                  variant={view === "all" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 rounded-md px-3"
                  onClick={() => setView("all")}
                >
                  All
                  <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                    {rows.length}
                  </span>
                </Button>
                <Button
                  type="button"
                  variant={view === "active" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 rounded-md px-3"
                  onClick={() => setView("active")}
                >
                  Active
                  <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                    {rows.filter((r) => r.status === "active").length}
                  </span>
                </Button>
                <Button
                  type="button"
                  variant={view === "closed" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 rounded-md px-3"
                  onClick={() => setView("closed")}
                >
                  Closed
                  <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                    {rows.filter((r) => r.status === "completed").length}
                  </span>
                </Button>
              </div>
              <select
                value={view}
                onChange={(e) =>
                  setView(e.target.value as "all" | "active" | "closed")
                }
                className="h-8 rounded-md border border-border/60 bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring/50"
                aria-label="Filter by status"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
              </select>
              <div className="relative w-full min-w-[200px] max-w-[280px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search projects…"
                  className="h-8 pl-9 rounded-md border-border/60"
                />
              </div>
            </>
          }
          right={
            <Button asChild variant="primary" size="default" className="min-h-[44px] sm:min-h-0 w-full sm:w-auto">
              <Link href="/projects/new">
                <Plus className="h-4 w-4 mr-2" />
                New Project
              </Link>
            </Button>
          }
        />
      }
    >
      {filtered.length === 0 ? (
        <EmptyState
          title="No projects found"
          description={query.trim() || view !== "all" ? "Try adjusting the filter or search." : "Create a project to get started."}
          action={
            query.trim() || view !== "all" ? null : (
              <Button asChild size="sm" className="h-8">
                <Link href="/projects/new">New Project</Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          {/* Project Overview — summary cards */}
          <section className="mb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Project Overview
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 rounded-lg border border-[#eee] bg-white">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Projects</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{overview.totalProjects}</p>
              </div>
              <div className="p-4 rounded-lg border border-[#eee] bg-white">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Active Projects</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{overview.activeProjects}</p>
              </div>
              <div className="p-4 rounded-lg border border-[#eee] bg-white">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Budget</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  ${overview.totalBudget.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="p-4 rounded-lg border border-[#eee] bg-white">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Spent</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  ${overview.totalSpent.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
              </div>
            </div>
          </section>

          {/* Mobile: stacked cards */}
          <div className="sm:hidden rounded-lg border border-[#eee] bg-white overflow-hidden">
            <ul className="divide-y divide-[#eee]">
              {filtered.map((r) => (
                <ProjectMobileCard key={r.id} row={r} onNavigate={handleNavigate} />
              ))}
            </ul>
          </div>

          {/* Tablet/Desktop: table */}
          <div className="hidden sm:block table-responsive rounded-lg border border-[#eee] bg-white overflow-hidden">
            <table className="w-full min-w-[640px] sm:min-w-0 text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#eee]">
                  <th className="text-left py-2.5 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Project</th>
                  <th className="text-left py-2.5 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Client</th>
                  <th className="text-left py-2.5 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground tabular-nums">Budget</th>
                  <th className="text-right py-2.5 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground tabular-nums">Spent</th>
                  <th className="text-left py-2.5 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Progress</th>
                  <th className="w-9" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <ProjectTableRow
                    key={r.id}
                    row={r}
                    onNavigate={handleNavigate}
                    onDelete={handleDelete}
                    deletingId={deletingId}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Dialog open={deleteBlockedOpen} onOpenChange={setDeleteBlockedOpen}>
        <DialogContent className="max-w-md border-border/60 p-5 rounded-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Cannot delete project</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Cannot delete project because it contains related records.
            </DialogDescription>
          </DialogHeader>
          {deleteBlockedCounts && deleteBlockedProjectId != null && (
            <ul className="text-sm text-foreground space-y-2">
              {deleteModalRelatedConfig.map(({ key, label, viewPath }) => {
                const n = deleteBlockedCounts[key] ?? 0;
                if (n <= 0) return null;
                const href = `${viewPath}?project_id=${deleteBlockedProjectId}`;
                return (
                  <li key={key} className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0">
                    <span>
                      {label} ({n})
                    </span>
                    <Button variant="outline" size="sm" className="shrink-0 rounded-sm" asChild>
                      <Link href={href} onClick={() => setDeleteBlockedOpen(false)}>
                        View {label}
                      </Link>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          <DialogFooter className="gap-2 pt-3 border-t border-border/60 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => setDeleteBlockedOpen(false)}>
              Cancel
            </Button>
            {deleteBlockedProjectId != null && (
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  if (!deleteBlockedProjectId) return;
                  const result = await archiveProjectAction(deleteBlockedProjectId);
                  if (result?.error) {
                    toast({ title: "Error", description: result.error, variant: "error" });
                  } else {
                    setDeleteBlockedOpen(false);
                    setDeleteBlockedProjectId(null);
                    router.refresh();
                  }
                }}
              >
                Archive project
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
