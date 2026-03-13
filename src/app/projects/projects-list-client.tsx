"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2 } from "lucide-react";
import {
  PageLayout,
  PageHeader,
  ActionBar,
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
  if (s === "completed") return "Completed";
  return status;
}

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

  const deleteModalCountLabels: { key: keyof ProjectUsageCounts; label: string }[] = [
    { key: "expenses", label: "Expenses" },
    { key: "labor_entries", label: "Labor Entries" },
    { key: "worker_receipts", label: "Worker Receipts" },
    { key: "invoices", label: "Invoices" },
    { key: "site_photos", label: "Site Photos" },
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

  const columns: DataTableColumn<ProjectsListRow>[] = [
    {
      key: "name",
      header: "Project Name",
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{r.name}</div>
          <div className="truncate text-xs text-muted-foreground tabular-nums">
            {r.id}
          </div>
        </div>
      ),
    },
    {
      key: "client",
      header: "Client",
      cell: (r) => (
        <span className="text-muted-foreground">{r.clientName ?? "—"}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <StatusBadge
          label={statusLabel(r.status)}
          variant={statusVariant(r.status)}
        />
      ),
    },
    {
      key: "risk",
      header: "Risk",
      cell: (r) => {
        const dotClass =
          r.risk === "green"
            ? "bg-green-500"
            : r.risk === "yellow"
              ? "bg-amber-500"
              : "bg-red-500";
        return (
          <span className="flex items-center gap-1.5" title={r.risk}>
            <span className={cn("h-2 w-2 shrink-0 rounded-full", dotClass)} aria-hidden />
          </span>
        );
      },
    },
    {
      key: "budget",
      header: "Budget",
      numeric: true,
      cell: (r) => `$${r.budget.toLocaleString()}`,
    },
    {
      key: "spent",
      header: "Spent",
      numeric: true,
      cell: (r) => `$${Math.round(r.spent).toLocaleString()}`,
    },
    {
      key: "progress",
      header: "Progress",
      cell: (r) => {
        const progress = Math.max(0, Math.min(100, r.progressPct));
        const barTone =
          progress >= 95
            ? "bg-emerald-500"
            : progress >= 70
              ? "bg-amber-500"
              : "bg-muted-foreground/50";
        return (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", barTone)}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {progress.toFixed(0)}%
            </span>
          </div>
        );
      },
    },
    {
      key: "start",
      header: "Start",
      cell: (r) => (
        <span className="date-text">{r.startDate ?? "—"}</span>
      ),
    },
    {
      key: "end",
      header: "End",
      cell: (r) => (
        <span className="date-text">{r.endDate ?? "—"}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      cell: (r) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
          aria-label={`Delete ${r.name}`}
          disabled={deletingId === r.id}
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const usage = await getProjectUsageAction(r.id);
            if (usage.blocked && usage.counts) {
              setDeleteBlockedCounts(usage.counts);
              setDeleteBlockedProjectId(r.id);
              setDeleteBlockedOpen(true);
              return;
            }
            if (!window.confirm(`Delete project "${r.name}"? This cannot be undone.`)) return;
            setDeletingId(r.id);
            try {
              const result = await deleteProjectAction(r.id);
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
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    },
  ];

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
            <Button asChild variant="primary" size="default">
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
        <DataTable<ProjectsListRow>
          columns={columns}
          data={filtered}
          getRowId={(r) => r.id}
          onRowClick={(r) => router.push(`/projects/${r.id}`)}
        />
      )}

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
            {deleteBlockedProjectId != null && (deleteBlockedCounts?.expenses ?? 0) > 0 && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/financial/expenses?project_id=${deleteBlockedProjectId}`} onClick={() => setDeleteBlockedOpen(false)}>
                  View Expenses
                </Link>
              </Button>
            )}
            {deleteBlockedProjectId != null && (deleteBlockedCounts?.labor_entries ?? 0) > 0 && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/labor?project_id=${deleteBlockedProjectId}`} onClick={() => setDeleteBlockedOpen(false)}>
                  View Labor
                </Link>
              </Button>
            )}
            {deleteBlockedProjectId != null && (deleteBlockedCounts?.worker_receipts ?? 0) > 0 && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/labor/receipts?project_id=${deleteBlockedProjectId}`} onClick={() => setDeleteBlockedOpen(false)}>
                  View Receipts
                </Link>
              </Button>
            )}
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
