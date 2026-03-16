"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
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
import { deleteProjectAction, getProjectUsageAction, archiveProjectAction, forceDeleteProjectAction } from "./actions";
import {
  DELETE_BLOCKED_RELATED_CONFIG,
  getLabelForKey,
  getViewPathForKey,
  getRelatedLabelsList,
  type DeleteBlockedCounts,
} from "./delete-blocked-config";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/components/toast/toast-provider";

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
  return (
    <li className="border-b border-[#eee] last:border-b-0 flex items-start gap-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onNavigate(row.id)}
        onKeyDown={(e) => e.key === "Enter" && onNavigate(row.id)}
        className="flex-1 min-w-0 py-3 px-3 hover:bg-[#fafafa] transition-colors text-left"
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
      <div className="pt-2 pr-2 shrink-0" onClick={(e) => e.stopPropagation()}>
        <RowActionsMenu
          ariaLabel={`Actions for ${row.name}`}
          actions={[
            { label: "View", onClick: () => onNavigate(row.id) },
            { label: "Delete", onClick: () => onDelete(row.id, row.name), destructive: true, disabled: deletingId === row.id },
          ]}
        />
      </div>
    </li>
  );
});

/** Memoized table row with row actions menu. */
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
      <td className="py-2.5 px-3 w-10 text-right" onClick={(e) => e.stopPropagation()}>
        <RowActionsMenu
          ariaLabel={`Actions for ${row.name}`}
          actions={[
            { label: "View", onClick: () => onNavigate(row.id) },
            { label: "Delete", onClick: () => onDelete(row.id, row.name), destructive: true, disabled: deletingId === row.id },
          ]}
        />
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
  const [deleteBlockedCounts, setDeleteBlockedCounts] = React.useState<DeleteBlockedCounts | null>(null);
  const [deleteBlockedProjectId, setDeleteBlockedProjectId] = React.useState<string | null>(null);
  const [forceDeleteInProgress, setForceDeleteInProgress] = React.useState(false);

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
      if (result?.blocked && result?.counts) {
        setDeleteBlockedCounts(result.counts);
        setDeleteBlockedProjectId(id);
        setDeleteBlockedOpen(true);
      } else if (result?.error) {
        toast({ title: "Error", description: result.error, variant: "error" });
      } else {
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
                <ProjectMobileCard key={r.id} row={r} onNavigate={handleNavigate} onDelete={handleDelete} deletingId={deletingId} />
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
              This project has related records. Remove or reassign them first, or archive the project.
            </DialogDescription>
          </DialogHeader>
          {deleteBlockedCounts && deleteBlockedProjectId != null && (
            <ul className="text-sm text-foreground space-y-2">
              {DELETE_BLOCKED_RELATED_CONFIG.map(({ key }) => {
                const n = deleteBlockedCounts[key] ?? 0;
                if (n <= 0) return null;
                const label = getLabelForKey(key);
                const viewPath = getViewPathForKey(key);
                const href = viewPath ? `${viewPath}?project_id=${deleteBlockedProjectId}` : undefined;
                return (
                  <li key={key} className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0">
                    <span>{label} ({n})</span>
                    {href ? (
                      <Button variant="outline" size="sm" className="shrink-0 rounded-sm" asChild>
                        <Link href={href} onClick={() => setDeleteBlockedOpen(false)}>
                          View {label}
                        </Link>
                      </Button>
                    ) : null}
                  </li>
                );
              })}
              {Object.entries(deleteBlockedCounts)
                .filter(([k, n]) => n > 0 && !DELETE_BLOCKED_RELATED_CONFIG.some((c) => c.key === k))
                .map(([key, n]) => (
                  <li key={key} className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0">
                    <span>{getLabelForKey(key)} ({n})</span>
                  </li>
                ))}
            </ul>
          )}
          <DialogFooter className="gap-2 pt-3 border-t border-border/60 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => setDeleteBlockedOpen(false)} disabled={forceDeleteInProgress}>
              Cancel
            </Button>
            {deleteBlockedProjectId != null && deleteBlockedCounts && (
              <>
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
                  disabled={forceDeleteInProgress}
                >
                  Archive project
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={forceDeleteInProgress}
                  onClick={async () => {
                    if (!deleteBlockedProjectId || !deleteBlockedCounts) return;
                    const labels = getRelatedLabelsList(deleteBlockedCounts);
                    const listText = labels.length > 0 ? labels.join("、") : "";
                    const msg = listText
                      ? `确定要删除该项目及其所有关联数据（${listText}）？此操作不可撤销。`
                      : "确定要删除该项目及其所有关联数据？此操作不可撤销。";
                    if (!window.confirm(msg)) return;
                    setForceDeleteInProgress(true);
                    try {
                      const result = await forceDeleteProjectAction(deleteBlockedProjectId);
                      if (result?.error) {
                        toast({ title: "Error", description: result.error, variant: "error" });
                      }
                    } finally {
                      setForceDeleteInProgress(false);
                    }
                  }}
                >
                  {forceDeleteInProgress ? "Deleting…" : "Force Delete"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
