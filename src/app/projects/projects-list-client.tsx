"use client";

import { syncRouterAndClients } from "@/lib/sync-router-client";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
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
import {
  listTableAmountCellClassName,
  listTablePrimaryCellClassName,
  listTableRowClassName,
} from "@/lib/list-table-interaction";
import {
  deleteProjectAction,
  getProjectUsageAction,
  archiveProjectAction,
  forceDeleteProjectAction,
} from "./actions";
import {
  DELETE_BLOCKED_RELATED_CONFIG,
  getLabelForKey,
  getViewPathForKey,
  getRelatedLabelsList,
  type DeleteBlockedCounts,
} from "./delete-blocked-config";
import { useToast } from "@/components/toast/toast-provider";

export type ProjectsListRow = {
  id: string;
  name: string;
  clientName: string | null;
  status: string;
  revenue: number;
  laborCost: number;
  profit: number;
  updatedAt: string;
};

function fmtUsd0(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function profitClass(n: number): string {
  if (n > 0.005) return "text-green-600 dark:text-green-500";
  if (n < -0.005) return "text-red-500 dark:text-red-500";
  return "text-graphite/50";
}

export function ProjectsListClient({
  rows,
  titleFontClassName,
}: {
  rows: ProjectsListRow[];
  titleFontClassName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [localRows, setLocalRows] = React.useState<ProjectsListRow[]>(rows);
  React.useEffect(() => setLocalRows(rows), [rows]);
  const [view, setView] = React.useState<"all" | "active" | "closed">("all");
  const [query, setQuery] = React.useState("");
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [deleteBlockedOpen, setDeleteBlockedOpen] = React.useState(false);
  const [deleteBlockedCounts, setDeleteBlockedCounts] = React.useState<DeleteBlockedCounts | null>(null);
  const [deleteBlockedProjectId, setDeleteBlockedProjectId] = React.useState<string | null>(null);
  const [forceDeleteInProgress, setForceDeleteInProgress] = React.useState(false);

  useOnAppSync(
    React.useCallback(() => {
      void syncRouterAndClients(router);
    }, [router]),
    [router]
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return localRows
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
  }, [query, localRows, view]);

  const handleNavigate = React.useCallback(
    (id: string) => {
      router.push(`/projects/${id}`);
    },
    [router]
  );

  const handleDelete = React.useCallback(
    async (id: string, name: string) => {
      const usage = await getProjectUsageAction(id);
      if (usage.blocked && usage.counts) {
        setDeleteBlockedCounts(usage.counts);
        setDeleteBlockedProjectId(id);
        setDeleteBlockedOpen(true);
        return;
      }
      if (!window.confirm(`Delete project "${name}"? This cannot be undone.`)) return;
      let snapshot: ProjectsListRow[] | undefined;
      setLocalRows((prev) => {
        snapshot = prev;
        return prev.filter((r) => r.id !== id);
      });
      setDeletingId(id);
      try {
        const result = await deleteProjectAction(id);
        if (result?.blocked && result?.counts) {
          if (snapshot) setLocalRows(snapshot);
          setDeleteBlockedCounts(result.counts);
          setDeleteBlockedProjectId(id);
          setDeleteBlockedOpen(true);
        } else if (result?.error) {
          if (snapshot) setLocalRows(snapshot);
          toast({ title: "Error", description: result.error, variant: "error" });
        } else {
          void syncRouterAndClients(router);
        }
      } finally {
        setDeletingId(null);
      }
    },
    [router, toast]
  );

  return (
    <div className="font-sans text-graphite antialiased">
      {/* Title + actions */}
      <div className="mb-10 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <h1
            data-testid="projects-page-heading"
            className={cn(
              titleFontClassName,
              "text-4xl font-extrabold leading-none tracking-[-0.03em] text-graphite sm:text-[52px]"
            )}
          >
            Projects
          </h1>
          <p className="text-base font-light tracking-tight text-graphite/55 sm:text-lg">
            Revenue, labor cost, and profit — click a row to open a project.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="inline-flex rounded-xl border border-border-soft bg-white p-0.5 shadow-sm">
            {(["all", "active", "closed"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "rounded-[10px] px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors",
                  view === v ? "bg-warm-grey text-graphite" : "text-graphite/45 hover:text-graphite"
                )}
              >
                {v === "all" ? `All (${localRows.length})` : v === "active" ? `Active (${localRows.filter((r) => r.status === "active").length})` : `Closed (${localRows.filter((r) => r.status === "completed").length})`}
              </button>
            ))}
          </div>
          <div className="relative min-w-[200px] max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-graphite/40" />
            <Input
              data-testid="projects-list-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects…"
              className="h-10 rounded-xl border-border-soft bg-white pl-10 text-sm text-graphite placeholder:text-graphite/40 focus-visible:ring-1 focus-visible:ring-graphite/20 focus-visible:border-graphite/30"
            />
          </div>
          <Button
            asChild
            className="h-11 rounded-xl bg-graphite px-6 text-sm font-bold text-white shadow-sm hover:bg-graphite/90"
          >
            <Link href="/projects/new">
              <Plus className="mr-2 h-[18px] w-[18px]" />
              New Project
            </Link>
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-border-soft/60 bg-white px-10 py-16 text-center shadow-paper-card dark:border-border dark:bg-card dark:shadow-none">
          <p className="text-sm font-medium text-graphite/60">
            {query.trim() || view !== "all" ? "No projects match your filter." : "No projects yet."}
          </p>
          {!query.trim() && view === "all" ? (
            <Button asChild className="mt-6 rounded-xl bg-graphite px-6 text-white" variant="default">
              <Link href="/projects/new">New Project</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-border-soft/60 bg-white shadow-paper-card dark:border-border dark:bg-card dark:shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-separate border-spacing-y-1.5 border-spacing-x-0 text-left">
              <thead>
                <tr className="border-b border-border-soft bg-warm-grey/30 dark:border-border dark:bg-muted/40">
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-graphite/55">
                    Project
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-graphite/55">
                    Client
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-[0.2em] text-graphite/55">
                    Revenue
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-[0.2em] text-graphite/55">
                    Labor
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-[0.2em] text-graphite/55">
                    Profit
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-graphite/55">
                    Updated
                  </th>
                  <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-[0.2em] text-graphite/55">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => handleNavigate(r.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleNavigate(r.id);
                      }
                    }}
                    tabIndex={0}
                    role="link"
                    aria-label={`Open project ${r.name}`}
                    className={cn(listTableRowClassName, "focus-visible:ring-graphite/10")}
                  >
                    <td
                      className={cn(
                        "first:rounded-l-xl px-6 py-4 text-sm font-semibold tracking-tight text-graphite",
                        listTablePrimaryCellClassName
                      )}
                    >
                      {r.name}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-graphite">
                      {r.clientName ?? "—"}
                    </td>
                    <td
                      className={cn(
                        "px-6 py-4 text-right text-base font-extrabold tabular-nums text-graphite/85",
                        listTableAmountCellClassName
                      )}
                    >
                      {fmtUsd0(r.revenue)}
                    </td>
                    <td
                      className={cn(
                        "px-6 py-4 text-right text-sm font-semibold tabular-nums text-graphite/70",
                        listTableAmountCellClassName
                      )}
                    >
                      {fmtUsd0(r.laborCost)}
                    </td>
                    <td
                      className={cn(
                        "px-6 py-4 text-right text-base font-extrabold tabular-nums transition-colors duration-200",
                        listTableAmountCellClassName,
                        profitClass(r.profit)
                      )}
                    >
                      {fmtUsd0(r.profit)}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium italic text-graphite/50">
                      {r.updatedAt}
                    </td>
                    <td
                      className="last:rounded-r-xl px-6 py-4 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-end">
                        <RowActionsMenu
                          appearance="list"
                          ariaLabel={`Actions for ${r.name}`}
                          className="text-graphite/50 hover:text-graphite dark:text-muted-foreground"
                          actions={[
                            { label: "View", onClick: () => handleNavigate(r.id) },
                            { label: "Edit", onClick: () => router.push(`/projects/${r.id}/edit`) },
                            {
                              label: "Delete",
                              onClick: () => void handleDelete(r.id, r.name),
                              destructive: true,
                              disabled: deletingId === r.id,
                            },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-16 flex justify-center sm:mt-20">
        <div className="h-1 w-12 rounded-full bg-border-soft" aria-hidden />
      </div>

      <Dialog open={deleteBlockedOpen} onOpenChange={setDeleteBlockedOpen}>
        <DialogContent className="max-w-md rounded-xl border-border-soft p-5">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-graphite">Cannot delete project</DialogTitle>
            <DialogDescription className="text-sm text-graphite/55">
              This project has related records. Remove or reassign them first, or archive the project.
            </DialogDescription>
          </DialogHeader>
          {deleteBlockedCounts && deleteBlockedProjectId != null && (
            <ul className="space-y-2 text-sm text-graphite">
              {DELETE_BLOCKED_RELATED_CONFIG.map(({ key }) => {
                const n = deleteBlockedCounts[key] ?? 0;
                if (n <= 0) return null;
                const label = getLabelForKey(key);
                const viewPath = getViewPathForKey(key);
                const href = viewPath ? `${viewPath}?project_id=${deleteBlockedProjectId}` : undefined;
                return (
                  <li
                    key={key}
                    className="flex items-center justify-between gap-3 border-b border-border-soft pb-2 last:border-0 last:pb-0"
                  >
                    <span>
                      {label} ({n})
                    </span>
                    {href ? (
                      <Button variant="outline" size="sm" className="shrink-0 rounded-lg border-border-soft" asChild>
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
                  <li
                    key={key}
                    className="flex items-center justify-between gap-3 border-b border-border-soft pb-2 last:border-0 last:pb-0"
                  >
                    <span>
                      {getLabelForKey(key)} ({n})
                    </span>
                  </li>
                ))}
            </ul>
          )}
          <DialogFooter className="flex-wrap gap-2 border-t border-border-soft pt-3">
            <Button variant="ghost" size="sm" onClick={() => setDeleteBlockedOpen(false)} disabled={forceDeleteInProgress}>
              Cancel
            </Button>
            {deleteBlockedProjectId != null && deleteBlockedCounts && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  className="rounded-lg"
                  onClick={async () => {
                    if (!deleteBlockedProjectId) return;
                    const result = await archiveProjectAction(deleteBlockedProjectId);
                    if (result?.error) {
                      toast({ title: "Error", description: result.error, variant: "error" });
                    } else {
                      setDeleteBlockedOpen(false);
                      setDeleteBlockedProjectId(null);
                      void syncRouterAndClients(router);
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
                    const pid = deleteBlockedProjectId;
                    try {
                      const result = await forceDeleteProjectAction(pid);
                      if (result?.error) {
                        toast({ title: "Error", description: result.error, variant: "error" });
                      } else {
                        setLocalRows((prev) => prev.filter((r) => r.id !== pid));
                        setDeleteBlockedOpen(false);
                        setDeleteBlockedProjectId(null);
                        void syncRouterAndClients(router);
                        toast({ title: "Project deleted", variant: "success" });
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
    </div>
  );
}
