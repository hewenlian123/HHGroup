"use client";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
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
import { TableShell, tableRawTdClass, tableRawThClass } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { listTableRowClassName } from "@/lib/list-table-interaction";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MobileEmptyState,
  MobileFabPlus,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";

export type ProjectsListRow = {
  id: string;
  name: string;
  clientName: string | null;
  status: string;
  budget: number;
  revenue: number;
  laborCost: number;
  profit: number;
  updatedAt: string;
};

const PAGE_BG = "bg-page";
const FIELD =
  "h-10 rounded-lg border-[0.5px] border-gray-100 bg-white text-[14px] focus-visible:border-[#111827] focus-visible:ring-2 focus-visible:ring-[#111827]/15";
const MODAL =
  "max-w-[480px] w-full gap-0 border-[0.5px] border-gray-100 p-8 shadow-modal rounded-modal sm:max-w-[480px]";

function fmtUsd0(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function profitClass(n: number): string {
  if (n > 0.005) return "text-[#166534]";
  if (n < -0.005) return "text-red-600";
  return "text-text-secondary";
}

export type ProjectListStatusFilter = "all" | "active" | "completed" | "pending" | "on_hold";

function normalizeProjectStatus(
  status: string
): "active" | "completed" | "pending" | "on_hold" | "other" {
  const v = (status ?? "").toLowerCase().trim().replace(/\s+/g, "_");
  if (v === "active") return "active";
  if (v === "completed") return "completed";
  if (v === "pending") return "pending";
  if (v === "on_hold" || v === "on-hold" || v.includes("hold")) return "on_hold";
  return "other";
}

function ProjectListStatusPill({ status }: { status: string }) {
  const n = normalizeProjectStatus(status);
  const map = {
    active: { pill: "hh-pill-success", label: "Active" },
    completed: { pill: "hh-pill-success", label: "Completed" },
    pending: { pill: "hh-pill-warning", label: "Pending" },
    on_hold: { pill: "hh-pill-neutral", label: "On Hold" },
    other: {
      pill: "hh-pill-neutral",
      label:
        status && status.trim()
          ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
          : "—",
    },
  } as const;
  const c = map[n];
  return <span className={cn(c.pill, "text-[12px] leading-tight")}>{c.label}</span>;
}

export function ProjectsListClient({
  rows,
  dataLoadWarning = null,
}: {
  rows: ProjectsListRow[];
  dataLoadWarning?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [localRows, setLocalRows] = React.useState<ProjectsListRow[]>(rows);
  React.useEffect(() => setLocalRows(rows), [rows]);
  const [statusFilter, setStatusFilter] = React.useState<ProjectListStatusFilter>("all");
  const [sortBy, setSortBy] = React.useState<"updated" | "name" | "revenue" | "profit">("updated");
  const [query, setQuery] = React.useState("");
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [deleteBlockedOpen, setDeleteBlockedOpen] = React.useState(false);
  const [deleteBlockedCounts, setDeleteBlockedCounts] = React.useState<DeleteBlockedCounts | null>(
    null
  );
  const [deleteBlockedProjectId, setDeleteBlockedProjectId] = React.useState<string | null>(null);
  const [forceDeleteInProgress, setForceDeleteInProgress] = React.useState(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  const activeDrawerFilterCount = (statusFilter !== "all" ? 1 : 0) + (sortBy !== "updated" ? 1 : 0);

  useOnAppSync(
    React.useCallback(() => {
      syncRouterNonBlocking(router);
    }, [router]),
    [router]
  );

  const summary = React.useMemo(() => {
    const total = localRows.length;
    const active = localRows.filter((r) => normalizeProjectStatus(r.status) === "active").length;
    const completed = localRows.filter(
      (r) => normalizeProjectStatus(r.status) === "completed"
    ).length;
    const totalBudget = localRows.reduce((s, r) => s + (Number(r.budget) || 0), 0);
    return { total, active, completed, totalBudget };
  }, [localRows]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = localRows.filter((r) => {
      const n = normalizeProjectStatus(r.status);
      if (statusFilter === "all") return true;
      if (statusFilter === "on_hold") return n === "on_hold";
      return n === statusFilter;
    });
    list = list.filter((r) => {
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        (r.clientName ?? "").toLowerCase().includes(q)
      );
    });
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "revenue") return b.revenue - a.revenue;
      if (sortBy === "profit") return b.profit - a.profit;
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    });
    return sorted;
  }, [query, localRows, statusFilter, sortBy]);

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
          syncRouterNonBlocking(router);
        }
      } finally {
        setDeletingId(null);
      }
    },
    [router, toast]
  );

  return (
    <div
      className={cn(
        "page-container page-stack py-8 text-[14px] leading-normal",
        PAGE_BG,
        mobileListPagePaddingClass,
        "max-md:!gap-3"
      )}
    >
      {dataLoadWarning ? (
        <p className="border-b border-gray-100 pb-3 text-sm text-text-secondary" role="status">
          {dataLoadWarning}
        </p>
      ) : null}

      <MobileListHeader
        title="Projects"
        fab={<MobileFabPlus href="/projects/new" ariaLabel="New project" />}
      />

      <div className="hidden flex-col gap-3 sm:flex-row sm:items-end sm:justify-between md:flex">
        <div>
          <h1
            data-testid="projects-page-heading"
            className="text-2xl font-bold tracking-tight text-text-primary"
          >
            Projects
          </h1>
          <p className="mt-1 max-w-xl text-[14px] text-text-secondary">
            Revenue, labor cost, and profit — click a row or View to open a project.
          </p>
        </div>
        <Button
          asChild
          variant="outline"
          className="h-10 shrink-0 rounded-md border-[0.5px] border-gray-100 bg-white px-4 text-[14px] font-medium text-text-primary shadow-none transition-all duration-150 ease-out hover:-translate-y-px hover:bg-gray-50 active:scale-[0.97] active:duration-100 dark:hover:bg-muted/40"
        >
          <Link href="/projects/new">
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Link>
        </Button>
      </div>

      <div className="hidden grid-cols-2 gap-[10px] sm:grid-cols-2 lg:grid-cols-4 md:grid">
        {(
          [
            ["TOTAL PROJECTS", summary.total],
            ["ACTIVE", summary.active],
            ["COMPLETED", summary.completed],
            ["TOTAL BUDGET", summary.totalBudget],
          ] as const
        ).map(([label, value]) => (
          <div
            key={label}
            className="rounded-[10px] border-[0.5px] border-solid border-gray-100 bg-white px-4 py-[14px]"
          >
            <p className="kpi-metric-label">{label}</p>
            <p className="kpi-metric-value mt-0.5 font-mono tabular-nums text-text-primary">
              {label === "TOTAL BUDGET" ? fmtUsd0(value as number) : (value as number)}
            </p>
          </div>
        ))}
      </div>

      <MobileSearchFiltersRow
        filterSheetOpen={filtersOpen}
        onOpenFilters={() => setFiltersOpen(true)}
        activeFilterCount={activeDrawerFilterCount}
        searchSlot={
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
            <Input
              data-testid="projects-list-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects…"
              className={cn("pl-9", FIELD)}
              aria-label="Search projects"
            />
          </div>
        }
      />

      <div className="hidden flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center md:flex">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
          <Input
            data-testid="projects-list-search-desktop"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects…"
            className={cn("pl-9", FIELD)}
            aria-label="Search projects"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ProjectListStatusFilter)}
          className={cn("min-w-[160px] px-3", FIELD)}
          aria-label="Filter projects by status"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="on_hold">On hold</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className={cn("min-w-[180px] px-3", FIELD)}
          aria-label="Sort projects"
        >
          <option value="updated">Sort: Updated (newest)</option>
          <option value="name">Sort: Name (A–Z)</option>
          <option value="revenue">Sort: Revenue (high)</option>
          <option value="profit">Sort: Profit (high)</option>
        </select>
      </div>

      <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-secondary">Status</p>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ProjectListStatusFilter)}
            className={cn("w-full px-3", FIELD)}
            aria-label="Filter projects by status"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="on_hold">On hold</option>
          </select>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-secondary">Sort</p>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className={cn("w-full px-3", FIELD)}
            aria-label="Sort projects"
          >
            <option value="updated">Updated (newest)</option>
            <option value="name">Name (A–Z)</option>
            <option value="revenue">Revenue (high)</option>
            <option value="profit">Profit (high)</option>
          </select>
        </div>
        <Button type="button" className="w-full rounded-sm" onClick={() => setFiltersOpen(false)}>
          Done
        </Button>
      </MobileFilterSheet>

      {filtered.length === 0 ? (
        <>
          <MobileEmptyState
            icon={<Search className="h-8 w-8 opacity-80" aria-hidden />}
            message={
              dataLoadWarning
                ? "Could not load projects."
                : query.trim() || statusFilter !== "all"
                  ? "No projects match your filters."
                  : "No projects yet."
            }
            action={
              !query.trim() && statusFilter === "all" && !dataLoadWarning ? (
                <Button asChild size="sm" variant="outline">
                  <Link href="/projects/new">New project</Link>
                </Button>
              ) : undefined
            }
          />
          <div className="hidden rounded-lg bg-white px-8 py-14 text-center shadow-[0_1px_3px_rgba(0,0,0,0.06)] md:block dark:bg-card">
            <p className="text-[14px] font-medium text-text-secondary">
              {dataLoadWarning
                ? "Could not load projects."
                : query.trim() || statusFilter !== "all"
                  ? "No projects match your filter."
                  : "No projects yet."}
            </p>
            {!query.trim() && statusFilter === "all" ? (
              <Button
                asChild
                variant="outline"
                className="mt-6 h-10 rounded-md border-[0.5px] border-gray-100 bg-white px-4 text-text-primary shadow-none transition-all duration-150 ease-out hover:-translate-y-px hover:bg-gray-50 active:scale-[0.97] active:duration-100 dark:hover:bg-muted/40"
              >
                <Link href="/projects/new">New Project</Link>
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="divide-y divide-gray-100 dark:divide-border/60 md:hidden">
            {filtered.map((r) => (
              <div key={r.id} className="flex min-h-[56px] items-center gap-2 py-2.5">
                <Link
                  href={`/projects/${r.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left active:bg-muted/30"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">{r.name}</p>
                    <p className="truncate text-xs text-text-secondary dark:text-muted-foreground">
                      {(r.clientName ?? "—") + " · " + r.updatedAt}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={cn("text-sm font-medium tabular-nums", profitClass(r.profit))}>
                      {fmtUsd0(r.profit)}
                    </span>
                    <ProjectListStatusPill status={r.status} />
                  </div>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 rounded-sm"
                      aria-label={`More actions for ${r.name}`}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[160px]">
                    <DropdownMenuItem asChild>
                      <Link href={`/projects/${r.id}`}>View</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/projects/${r.id}/edit`}>Edit</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => void handleDelete(r.id, r.name)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
          <TableShell className="hidden md:block">
            <div className="airtable-table-scroll">
              <table className="w-full min-w-[880px] border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th className={tableRawThClass}>Project</th>
                    <th className={tableRawThClass}>Client</th>
                    <th className={tableRawThClass}>Status</th>
                    <th className={cn(tableRawThClass, "text-right tabular-nums")}>Revenue</th>
                    <th className={cn(tableRawThClass, "text-right tabular-nums")}>Labor</th>
                    <th className={cn(tableRawThClass, "text-right tabular-nums")}>Profit</th>
                    <th className={tableRawThClass}>Updated</th>
                    <th className={cn(tableRawThClass, "text-right")}>Actions</th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child>td]:border-b-0">
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
                      className={listTableRowClassName}
                    >
                      <td className={cn(tableRawTdClass, "font-medium text-text-primary")}>
                        {r.name}
                      </td>
                      <td className={tableRawTdClass}>{r.clientName ?? "—"}</td>
                      <td className={tableRawTdClass}>
                        <ProjectListStatusPill status={r.status} />
                      </td>
                      <td
                        className={cn(
                          tableRawTdClass,
                          "text-right font-mono tabular-nums text-text-primary"
                        )}
                      >
                        {fmtUsd0(r.revenue)}
                      </td>
                      <td
                        className={cn(
                          tableRawTdClass,
                          "text-right font-mono tabular-nums text-text-secondary"
                        )}
                      >
                        {fmtUsd0(r.laborCost)}
                      </td>
                      <td
                        className={cn(
                          tableRawTdClass,
                          "text-right font-mono text-base font-semibold tabular-nums",
                          profitClass(r.profit)
                        )}
                      >
                        {fmtUsd0(r.profit)}
                      </td>
                      <td
                        className={cn(tableRawTdClass, "font-mono text-[13px] text-text-secondary")}
                      >
                        {r.updatedAt}
                      </td>
                      <td
                        className={cn(tableRawTdClass, "text-right")}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div
                          className="inline-flex flex-wrap items-center justify-end gap-3"
                          role="group"
                          aria-label={`Actions for ${r.name}`}
                        >
                          <button
                            type="button"
                            className="text-[14px] font-medium text-text-primary hover:underline"
                            onClick={() => handleNavigate(r.id)}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="text-[14px] font-medium text-text-secondary hover:text-text-primary hover:underline"
                            onClick={() => router.push(`/projects/${r.id}/edit`)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                            aria-label={`Delete ${r.name}`}
                            disabled={deletingId === r.id}
                            onClick={() => void handleDelete(r.id, r.name)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableShell>
        </>
      )}

      <Dialog open={deleteBlockedOpen} onOpenChange={setDeleteBlockedOpen}>
        <DialogContent className={MODAL}>
          <DialogHeader className="text-left">
            <DialogTitle className="text-xl font-bold text-text-primary">
              Cannot delete project
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed text-text-secondary">
              This project has related records. Remove or reassign them first, or archive the
              project.
            </DialogDescription>
          </DialogHeader>
          {deleteBlockedCounts && deleteBlockedProjectId != null && (
            <ul className="max-h-[40vh] space-y-2 overflow-y-auto text-[14px] text-[#374151]">
              {DELETE_BLOCKED_RELATED_CONFIG.map(({ key }) => {
                const n = deleteBlockedCounts[key] ?? 0;
                if (n <= 0) return null;
                const label = getLabelForKey(key);
                const viewPath = getViewPathForKey(key);
                const href = viewPath
                  ? `${viewPath}?project_id=${deleteBlockedProjectId}`
                  : undefined;
                return (
                  <li
                    key={key}
                    className="flex items-center justify-between gap-3 border-b border-[#E8E4DD] pb-2 last:border-0 last:pb-0"
                  >
                    <span>
                      {label} ({n})
                    </span>
                    {href ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 shrink-0 rounded-lg border-gray-100 text-[13px]"
                        asChild
                      >
                        <Link href={href} onClick={() => setDeleteBlockedOpen(false)}>
                          View {label}
                        </Link>
                      </Button>
                    ) : null}
                  </li>
                );
              })}
              {Object.entries(deleteBlockedCounts)
                .filter(
                  ([k, n]) => n > 0 && !DELETE_BLOCKED_RELATED_CONFIG.some((c) => c.key === k)
                )
                .map(([key, n]) => (
                  <li
                    key={key}
                    className="flex items-center justify-between gap-3 border-b border-[#E8E4DD] pb-2 last:border-0 last:pb-0"
                  >
                    <span>
                      {getLabelForKey(key)} ({n})
                    </span>
                  </li>
                ))}
            </ul>
          )}
          <DialogFooter className="mt-4 flex-wrap gap-2 border-t border-[#F0EDE8] bg-transparent pt-4">
            <Button
              variant="outline"
              className="h-10 rounded-lg border-gray-100 bg-white text-[14px] font-medium text-text-secondary"
              onClick={() => setDeleteBlockedOpen(false)}
              disabled={forceDeleteInProgress}
            >
              Cancel
            </Button>
            {deleteBlockedProjectId != null && deleteBlockedCounts && (
              <>
                <Button
                  variant="outline"
                  className="h-10 rounded-lg border-gray-100 text-[14px] font-medium"
                  onClick={async () => {
                    if (!deleteBlockedProjectId) return;
                    const result = await archiveProjectAction(deleteBlockedProjectId);
                    if (result?.error) {
                      toast({ title: "Error", description: result.error, variant: "error" });
                    } else {
                      setDeleteBlockedOpen(false);
                      setDeleteBlockedProjectId(null);
                      syncRouterNonBlocking(router);
                    }
                  }}
                  disabled={forceDeleteInProgress}
                >
                  Archive project
                </Button>
                <Button
                  className="h-10 rounded-lg bg-red-600 text-[14px] font-medium text-white hover:bg-red-700"
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
                        syncRouterNonBlocking(router);
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
