"use client";

import * as React from "react";
import { PageLayout, PageHeader, Drawer } from "@/components/base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createPunchListItemAction, updatePunchListItemAction } from "./actions";
import { cn } from "@/lib/utils";
import { TYPO } from "@/lib/typography";
import { Search } from "lucide-react";
import {
  MobileFabButton,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useOnAppSync } from "@/hooks/use-on-app-sync";

type ViewMode = "list" | "kanban";
type PunchRow = {
  id: string;
  project_id: string;
  project_name: string | null;
  issue: string;
  location: string | null;
  description: string | null;
  assigned_worker_id: string | null;
  worker_name: string | null;
  priority: string;
  status: string;
  photo_url: string | null;
  photo_id: string | null;
  site_photo_url: string | null;
  notes: string | null;
  created_at: string;
};

type StatusFilter = "open" | "assigned" | "completed" | "";

const PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;
const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  assigned: "In Progress",
  completed: "Completed",
  in_progress: "In Progress",
  resolved: "Completed",
};

function normStatus(s: string): string {
  return s === "in_progress" ? "assigned" : s === "resolved" ? "completed" : s;
}

/** Priority badge: Low neutral, Medium orange, High/Urgent red. */
const PriorityBadge = React.memo(function PriorityBadge({ priority }: { priority: string }) {
  const p = (priority || "Medium").toLowerCase();
  const style =
    p === "low"
      ? "border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-secondary)]"
      : p === "medium"
        ? "border border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] text-[var(--hh-warning)]"
        : "border border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] text-[var(--hh-danger)]";
  return (
    <span className={cn("inline-flex rounded-hh-compact px-1.5 py-0.5 text-hh-status", style)}>
      {priority || "Medium"}
    </span>
  );
});

/** Status badge: Open neutral, In Progress blue, Completed green. */
const StatusBadge = React.memo(function StatusBadge({ status }: { status: string }) {
  const n = normStatus(status);
  const label = STATUS_LABEL[n] ?? status;
  const style =
    n === "completed"
      ? "border border-[var(--hh-success-border)] bg-[var(--hh-success-soft-fill)] text-[var(--hh-success)]"
      : n === "assigned"
        ? "border border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] text-[var(--hh-warning)]"
        : "border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-secondary)]";
  return (
    <span className={cn("inline-flex rounded-hh-compact px-1.5 py-0.5 text-hh-status", style)}>
      {label}
    </span>
  );
});

/** Memoized list row to avoid re-renders when other rows update. */
const PunchListRow = React.memo(function PunchListRow({
  item,
  onOpenDrawer,
}: {
  item: PunchRow;
  onOpenDrawer: (item: PunchRow) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpenDrawer(item)}
        className="w-full min-h-[48px] px-0 py-2.5 text-left transition-colors hover:bg-[var(--hh-l2-operational-surface)] md:px-3"
      >
        <div className="text-sm font-medium text-[var(--hh-text-primary)]">{item.issue || "—"}</div>
        <div className="mt-0.5 text-xs text-[var(--hh-text-secondary)]">
          {[item.project_name, item.location].filter(Boolean).join(" · ") || "—"}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-1.5">
          <PriorityBadge priority={item.priority ?? "Medium"} />
          <span className="text-xs text-[var(--hh-text-secondary)]">
            {item.worker_name ?? "Unassigned"}
          </span>
          <StatusBadge status={item.status} />
        </div>
      </button>
    </li>
  );
});

/** Memoized Kanban card for minimal re-renders when dragging/dropping. */
const KanbanCard = React.memo(function KanbanCard({
  item,
  onOpenDrawer,
}: {
  item: PunchRow;
  onOpenDrawer: (item: PunchRow) => void;
}) {
  const onDragStart = React.useCallback(
    (ev: React.DragEvent) => {
      ev.dataTransfer.setData("application/json", JSON.stringify({ id: item.id }));
      ev.dataTransfer.effectAllowed = "move";
    },
    [item.id]
  );
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={() => onOpenDrawer(item)}
      className="cursor-grab rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-[10px] text-left transition-colors hover:border-[var(--hh-border-strong)] hover:bg-[var(--hh-l3-hover)] active:cursor-grabbing"
    >
      <div className="font-medium text-sm text-[var(--hh-text-primary)]">{item.issue || "—"}</div>
      <div className="text-xs text-[var(--hh-text-secondary)] mt-0.5">
        {item.project_name ?? "—"}
        {item.location ? ` · ${item.location}` : ""}
      </div>
      <div className="mt-1.5">
        <PriorityBadge priority={item.priority ?? "Medium"} />
      </div>
    </div>
  );
});

export default function PunchListPage() {
  const [items, setItems] = React.useState<PunchRow[]>([]);
  const [summary, setSummary] = React.useState({ open: 0, assigned: 0, completed: 0 });
  const [projects, setProjects] = React.useState<{ id: string; name: string }[]>([]);
  const [workers, setWorkers] = React.useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [projectFilter, setProjectFilter] = React.useState<string>("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("");
  const [priorityFilter, setPriorityFilter] = React.useState<string>("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [viewMode, setViewMode] = React.useState<ViewMode>("list");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [selectedItem, setSelectedItem] = React.useState<PunchRow | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    project_id: "",
    issue: "",
    location: "",
    description: "",
    assigned_worker_id: "",
    priority: "Medium",
    photo_url: null as string | null,
  });
  const [drawerForm, setDrawerForm] = React.useState({
    description: "",
    assigned_worker_id: "",
    status: "open" as string,
    photo_url: null as string | null,
  });
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const drawerFileRef = React.useRef<HTMLInputElement>(null);
  const modalTriggerRef = React.useRef<HTMLElement | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (projectFilter) params.set("project_id", projectFilter);
      const res = await fetch(`/api/operations/punch-list?${params.toString()}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Failed to load");
      setItems(data.items ?? []);
      setSummary(data.summary ?? { open: 0, assigned: 0, completed: 0 });
      setProjects(data.projects ?? []);
      setWorkers(data.workers ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load punch list.");
    } finally {
      setLoading(false);
    }
  }, [projectFilter]);

  React.useEffect(() => {
    load();
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  const debouncedSearch = useDebouncedValue(searchQuery, 200);
  const filteredItems = React.useMemo(() => {
    let list = items;
    if (statusFilter && viewMode === "list") {
      const statusNorm = statusFilter;
      list = list.filter((r) => normStatus(r.status) === statusNorm);
    }
    if (priorityFilter) {
      list = list.filter(
        (r) => (r.priority || "Medium").toLowerCase() === priorityFilter.toLowerCase()
      );
    }
    const q = debouncedSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          (r.issue || "").toLowerCase().includes(q) ||
          (r.project_name || "").toLowerCase().includes(q) ||
          (r.location || "").toLowerCase().includes(q) ||
          (r.worker_name || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, priorityFilter, debouncedSearch, statusFilter, viewMode]);

  const kanbanColumns = React.useMemo(() => {
    const open: PunchRow[] = [];
    const in_progress: PunchRow[] = [];
    const completed: PunchRow[] = [];
    for (const r of filteredItems) {
      const s = normStatus(r.status);
      if (s === "open") open.push(r);
      else if (s === "assigned") in_progress.push(r);
      else completed.push(r);
    }
    return { open, in_progress, completed } as const;
  }, [filteredItems]);

  const openModal = React.useCallback(() => {
    modalTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setForm({
      project_id: projectFilter || projects[0]?.id || "",
      issue: "",
      location: "",
      description: "",
      assigned_worker_id: "",
      priority: "Medium",
      photo_url: null,
    });
    setError(null);
    setModalOpen(true);
  }, [projectFilter, projects]);

  const handleModalOpenChange = React.useCallback((open: boolean) => {
    setModalOpen(open);
    if (!open) {
      requestAnimationFrame(() => modalTriggerRef.current?.focus());
    }
  }, []);

  const openDrawer = React.useCallback((item: PunchRow) => {
    setSelectedItem(item);
    setDrawerForm({
      description: item.description ?? "",
      assigned_worker_id: item.assigned_worker_id ?? "",
      status: normStatus(item.status),
      photo_url: item.photo_url,
    });
    setError(null);
    setDrawerOpen(true);
  }, []);

  const handleFileChange = React.useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const res = await fetch("/api/operations/punch-list/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Upload failed");
      setForm((p) => ({ ...p, photo_url: data.path }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }, []);

  const handleDrawerFileChange = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      setError(null);
      try {
        const formData = new FormData();
        formData.set("file", file);
        const res = await fetch("/api/operations/punch-list/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.message || "Upload failed");
        setDrawerForm((p) => ({ ...p, photo_url: data.path }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    },
    []
  );

  const handleSaveNew = React.useCallback(async () => {
    if (!form.project_id) {
      setError("Select a project.");
      return;
    }
    if (!form.issue.trim()) {
      setError("Issue title is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await createPunchListItemAction({
        project_id: form.project_id,
        issue: form.issue.trim(),
        location: form.location.trim() || null,
        description: form.description.trim() || null,
        assigned_worker_id: form.assigned_worker_id || null,
        priority: form.priority,
        status: "open",
        photo_url: form.photo_url || null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setModalOpen(false);
      load();
    } finally {
      setSubmitting(false);
    }
  }, [form, load]);

  const handleSaveDrawer = React.useCallback(async () => {
    if (!selectedItem) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await updatePunchListItemAction(selectedItem.id, {
        description: drawerForm.description.trim() || null,
        assigned_worker_id: drawerForm.assigned_worker_id || null,
        status: drawerForm.status,
        photo_url: drawerForm.photo_url,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setDrawerOpen(false);
      load();
    } finally {
      setSubmitting(false);
    }
  }, [selectedItem, drawerForm, load]);

  const photoUrl = React.useCallback(
    (path: string | null) =>
      path ? `/api/operations/punch-list/photo?path=${encodeURIComponent(path)}` : null,
    []
  );
  const sitePhotoImageUrl = React.useCallback(
    (path: string | null) =>
      path ? `/api/operations/site-photos/photo?path=${encodeURIComponent(path)}` : null,
    []
  );

  const handleColumnDrop = React.useCallback(
    async (columnStatus: string, e: React.DragEvent) => {
      e.preventDefault();
      e.currentTarget.classList.remove("ring-1", "ring-[var(--hh-focus-ring)]");
      const raw = e.dataTransfer.getData("application/json");
      if (!raw) return;
      try {
        const { id } = JSON.parse(raw) as { id: string };
        const result = await updatePunchListItemAction(id, { status: columnStatus });
        if (result?.error) return;
        load();
      } catch {
        // ignore
      }
    },
    [load]
  );

  const activeDrawerFilterCount =
    (projectFilter ? 1 : 0) +
    (statusFilter ? 1 : 0) +
    (priorityFilter ? 1 : 0) +
    (viewMode !== "list" ? 1 : 0);

  return (
    <PageLayout
      divider={false}
      className={cn(
        "md:max-w-5xl text-[var(--hh-text-secondary)]",
        mobileListPagePaddingClass,
        "max-md:!gap-3"
      )}
      header={
        <>
          <div className="hidden md:block">
            <PageHeader
              title="Punch List"
              description="Track and resolve construction issues."
              actions={
                <Button size="sm" className="rounded-hh-compact" onClick={openModal}>
                  + Add Issue
                </Button>
              }
            />
          </div>
          <div className="md:hidden">
            <MobileListHeader
              title="Punch List"
              fab={
                <MobileFabButton
                  ariaLabel="Add issue"
                  onClick={openModal}
                  className="motion-reduce:transition-none"
                />
              }
            />
          </div>
        </>
      }
    >
      <div className="w-full space-y-3">
        {/* Issue overview — compact cards */}
        <section className="hidden md:block">
          <p className={cn("mb-2", TYPO.sectionLabel)}>Issue Overview</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-hh-3 shadow-operational">
              <p className={TYPO.kpiLabel}>Open Issues</p>
              <p className={cn("mt-0.5", TYPO.kpiValue)}>{summary.open}</p>
            </div>
            <div className="rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-hh-3 shadow-operational">
              <p className={TYPO.kpiLabel}>Assigned Issues</p>
              <p className={cn("mt-0.5", TYPO.kpiValue)}>{summary.assigned}</p>
            </div>
            <div className="rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-hh-3 shadow-operational">
              <p className={TYPO.kpiLabel}>Completed Issues</p>
              <p className={cn("mt-0.5", TYPO.kpiValue)}>{summary.completed}</p>
            </div>
          </div>
        </section>

        <MobileSearchFiltersRow
          filterSheetOpen={filtersOpen}
          onOpenFilters={() => setFiltersOpen(true)}
          activeFilterCount={activeDrawerFilterCount}
          searchSlot={
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--hh-text-secondary)]" />
              <Input
                aria-label="Search punch list"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search issues…"
                className="h-10 pl-8 text-sm"
              />
            </div>
          }
        />
        <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
          <div className="space-y-3">
            <div>
              <p className={cn("mb-1", TYPO.label)}>View</p>
              <div className="flex gap-1 rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "hh-focus-ring hh-touch-min flex-1 rounded-hh-compact px-2 py-1.5 text-hh-control",
                    viewMode === "list"
                      ? "bg-[var(--hh-l3-selected)] text-[var(--hh-text-primary)]"
                      : "text-[var(--hh-text-secondary)]"
                  )}
                >
                  List
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("kanban")}
                  className={cn(
                    "hh-focus-ring hh-touch-min flex-1 rounded-hh-compact px-2 py-1.5 text-hh-control",
                    viewMode === "kanban"
                      ? "bg-[var(--hh-l3-selected)] text-[var(--hh-text-primary)]"
                      : "text-[var(--hh-text-secondary)]"
                  )}
                >
                  Kanban
                </button>
              </div>
            </div>
            <div>
              <p className={cn("mb-1", TYPO.label)}>Project</p>
              <select
                aria-label="Filter punch list by project"
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="hh-focus-ring hh-touch-min hh-type-text-entry h-hh-control-comfortable w-full rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-2.5 text-[var(--hh-text-primary)]"
              >
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className={cn("mb-1", TYPO.label)}>Status</p>
              <select
                aria-label="Filter punch list by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="hh-focus-ring hh-touch-min hh-type-text-entry h-hh-control-comfortable w-full rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-2.5 text-[var(--hh-text-primary)]"
              >
                <option value="">All</option>
                <option value="open">Open</option>
                <option value="assigned">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div>
              <p className={cn("mb-1", TYPO.label)}>Priority</p>
              <select
                aria-label="Filter punch list by priority"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="hh-focus-ring hh-touch-min hh-type-text-entry h-hh-control-comfortable w-full rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-2.5 text-[var(--hh-text-primary)]"
              >
                <option value="">All</option>
                {PRIORITIES.map((pr) => (
                  <option key={pr} value={pr}>
                    {pr}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button
            type="button"
            className="w-full rounded-hh-compact"
            onClick={() => setFiltersOpen(false)}
          >
            Done
          </Button>
        </MobileFilterSheet>

        {/* View switch: List | Kanban */}
        <div className="hidden w-fit items-center gap-0 rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-0.5 md:flex">
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={cn(
              "hh-focus-ring hh-touch-min rounded-hh-compact px-3 py-1.5 text-hh-control transition-colors",
              viewMode === "list"
                ? "bg-[var(--hh-l3-selected)] text-[var(--hh-text-primary)]"
                : "text-[var(--hh-text-secondary)] hover:bg-[var(--hh-l2-operational-surface)] hover:text-[var(--hh-text-primary)]"
            )}
          >
            List View
          </button>
          <button
            type="button"
            onClick={() => setViewMode("kanban")}
            className={cn(
              "hh-focus-ring hh-touch-min rounded-hh-compact px-3 py-1.5 text-hh-control transition-colors",
              viewMode === "kanban"
                ? "bg-[var(--hh-l3-selected)] text-[var(--hh-text-primary)]"
                : "text-[var(--hh-text-secondary)] hover:bg-[var(--hh-l2-operational-surface)] hover:text-[var(--hh-text-primary)]"
            )}
          >
            Kanban Board
          </button>
        </div>

        {/* Filters: desktop */}
        <div className="hidden flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-2 md:flex">
          <div className="w-full min-w-0 sm:w-auto">
            <label className={cn("mb-1 block", TYPO.label)}>Project</label>
            <select
              aria-label="Filter punch list by project"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="hh-focus-ring hh-touch-min hh-type-text-entry h-hh-control-standard w-full min-w-0 rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-2.5 text-[var(--hh-text-primary)] sm:w-auto sm:min-w-[160px]"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full min-w-0 sm:w-auto">
            <label className={cn("mb-1 block", TYPO.label)}>Status</label>
            <select
              aria-label="Filter punch list by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="hh-focus-ring hh-touch-min hh-type-text-entry h-hh-control-standard w-full min-w-0 rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-2.5 text-[var(--hh-text-primary)] sm:w-auto sm:min-w-[120px]"
            >
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="assigned">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div className="w-full min-w-0 sm:w-auto">
            <label className={cn("mb-1 block", TYPO.label)}>Priority</label>
            <select
              aria-label="Filter punch list by priority"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="hh-focus-ring hh-touch-min hh-type-text-entry h-hh-control-standard w-full min-w-0 rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-2.5 text-[var(--hh-text-primary)] sm:w-auto sm:min-w-[100px]"
            >
              <option value="">All</option>
              {PRIORITIES.map((pr) => (
                <option key={pr} value={pr}>
                  {pr}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full min-w-0 flex-1 sm:min-w-[140px]">
            <label className={cn("mb-1 block", TYPO.label)}>Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--hh-text-secondary)]" />
              <Input
                aria-label="Search punch list"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Issue, project, location…"
                className="hh-focus-ring hh-touch-min hh-type-text-entry h-hh-control-standard rounded-hh-standard border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] pl-8 text-[var(--hh-text-primary)]"
              />
            </div>
          </div>
        </div>

        {/* List view — compact issue list */}
        {viewMode === "list" && (
          <div className="overflow-hidden rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] shadow-operational max-md:rounded-none max-md:border-0">
            {loading ? (
              <div className="py-8 text-center text-sm text-[var(--hh-text-secondary)]">
                Loading…
              </div>
            ) : error && items.length === 0 ? (
              <div className="py-8 text-center text-sm text-[var(--hh-danger)]">{error}</div>
            ) : filteredItems.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-[var(--hh-text-secondary)]">
                  No issues match the filters.
                </p>
                <Button onClick={openModal} className="mt-3" size="sm">
                  Add Issue
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--hh-border)]">
                {filteredItems.map((r) => (
                  <PunchListRow key={r.id} item={r} onOpenDrawer={openDrawer} />
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Kanban board — 3 columns with drag and drop */}
        {viewMode === "kanban" && (
          <div className="overflow-hidden rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] shadow-operational max-md:rounded-none max-md:border-0">
            {loading ? (
              <div className="py-8 text-center text-sm text-[var(--hh-text-secondary)]">
                Loading…
              </div>
            ) : error && items.length === 0 ? (
              <div className="py-8 text-center text-sm text-[var(--hh-danger)]">{error}</div>
            ) : filteredItems.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-[var(--hh-text-secondary)]">
                  No issues match the filters.
                </p>
                <Button onClick={openModal} className="mt-3" size="sm">
                  Add Issue
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto overflow-y-hidden scroll-touch-x p-3 sm:p-4">
                <div className="flex min-w-0 gap-4 sm:grid sm:grid-cols-3 lg:grid-cols-3">
                  {(["open", "in_progress", "completed"] as const).map((columnId) => {
                    const columnStatus = columnId === "in_progress" ? "assigned" : columnId;
                    const label =
                      columnId === "open"
                        ? "Open"
                        : columnId === "in_progress"
                          ? "In Progress"
                          : "Completed";
                    const columnItems = kanbanColumns[columnId];
                    return (
                      <div
                        key={columnId}
                        className="flex min-h-[280px] w-[280px] min-w-[280px] flex-col rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] sm:min-w-0 sm:w-auto"
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.currentTarget.classList.add("ring-1", "ring-[var(--hh-focus-ring)]");
                        }}
                        onDragLeave={(e) => {
                          e.currentTarget.classList.remove("ring-1", "ring-[var(--hh-focus-ring)]");
                        }}
                        onDrop={(e) => handleColumnDrop(columnStatus, e)}
                      >
                        <div className="p-2.5 border-b border-[var(--hh-border)] font-medium text-sm text-[var(--hh-text-secondary)]">
                          {label} ({columnItems.length})
                        </div>
                        <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-0">
                          {columnItems.map((r) => (
                            <KanbanCard key={r.id} item={r} onOpenDrawer={openDrawer} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Issue detail drawer */}
      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={selectedItem?.issue ?? "Issue"}
        description={selectedItem?.location ?? undefined}
      >
        {selectedItem && (
          <div className="space-y-4">
            {selectedItem.site_photo_url && (
              <div>
                <label className="text-xs font-medium text-[var(--hh-text-secondary)]">
                  Related photo
                </label>
                <div className="mt-1.5 flex min-h-[160px] items-center justify-center overflow-hidden rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Dynamic local media preserves intrinsic sizing in the issue viewer. */}
                  <img
                    src={sitePhotoImageUrl(selectedItem.site_photo_url)!}
                    alt=""
                    className="max-w-full max-h-48 w-auto h-auto object-contain"
                  />
                </div>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-[var(--hh-text-secondary)]">Project</label>
              <p className="mt-0.5 text-sm">{selectedItem.project_name ?? "—"}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--hh-text-secondary)]">
                Location
              </label>
              <p className="mt-0.5 text-sm">{selectedItem.location ?? "—"}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--hh-text-secondary)]">
                Priority
              </label>
              <p className="mt-0.5 text-sm">{selectedItem.priority ?? "Medium"}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--hh-text-secondary)]">
                Assigned Worker
              </label>
              <select
                value={drawerForm.assigned_worker_id}
                onChange={(e) =>
                  setDrawerForm((p) => ({ ...p, assigned_worker_id: e.target.value }))
                }
                className="hh-focus-ring hh-touch-min mt-1 h-hh-control-standard w-full rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-2.5 text-sm text-[var(--hh-text-primary)]"
              >
                <option value="">—</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--hh-text-secondary)]">
                Description
              </label>
              <textarea
                value={drawerForm.description}
                onChange={(e) => setDrawerForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Details"
                rows={3}
                className="hh-focus-ring hh-touch-min mt-1 min-h-[88px] w-full rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-2.5 py-2 text-sm text-[var(--hh-text-primary)]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--hh-text-secondary)]">Photo</label>
              <input
                ref={drawerFileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleDrawerFileChange}
              />
              <div className="mt-1 flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-hh-compact"
                  disabled={uploading}
                  onClick={() => drawerFileRef.current?.click()}
                >
                  {uploading ? "Uploading…" : "Upload photo"}
                </Button>
                {drawerForm.photo_url && (
                  <a
                    href={photoUrl(drawerForm.photo_url) ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--hh-text-secondary)] hover:underline"
                  >
                    View
                  </a>
                )}
              </div>
              {drawerForm.photo_url && (
                <div className="mt-2 max-w-[200px] overflow-hidden rounded-hh-standard border border-[var(--hh-border)]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Dynamic local media preserves intrinsic sizing in the issue editor. */}
                  <img
                    src={photoUrl(drawerForm.photo_url)!}
                    alt=""
                    className="w-full h-auto object-cover"
                  />
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--hh-text-secondary)]">Status</label>
              <select
                value={drawerForm.status}
                onChange={(e) => setDrawerForm((p) => ({ ...p, status: e.target.value }))}
                className="hh-focus-ring hh-touch-min mt-1 h-hh-control-standard w-full rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-2.5 text-sm text-[var(--hh-text-primary)]"
              >
                <option value="open">Open</option>
                <option value="assigned">Assigned</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            {error && <p className="text-sm text-[var(--hh-danger)]">{error}</p>}
            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                className="rounded-hh-compact"
                onClick={() => setDrawerOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="rounded-hh-compact"
                onClick={handleSaveDrawer}
                disabled={submitting}
              >
                Save
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Add Issue modal */}
      <Dialog open={modalOpen} onOpenChange={handleModalOpenChange}>
        <DialogContent className="max-w-lg rounded-hh-task border-[var(--hh-border-floating)] bg-[var(--hh-l2-operational-surface)] p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Add Issue</DialogTitle>
            <DialogDescription>Create a new punch list issue.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-[var(--hh-text-secondary)]">Project</label>
              <select
                value={form.project_id}
                onChange={(e) => setForm((p) => ({ ...p, project_id: e.target.value }))}
                className="hh-focus-ring hh-touch-min mt-1.5 h-hh-control-standard w-full rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-2.5 text-sm text-[var(--hh-text-primary)]"
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--hh-text-secondary)]">
                Issue Title
              </label>
              <Input
                value={form.issue}
                onChange={(e) => setForm((p) => ({ ...p, issue: e.target.value }))}
                placeholder="Short title"
                className="hh-focus-ring hh-touch-min mt-1.5 h-hh-control-standard rounded-hh-standard border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-primary)]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--hh-text-secondary)]">
                Location
              </label>
              <Input
                value={form.location}
                onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                placeholder="e.g. Room 101"
                className="hh-focus-ring hh-touch-min mt-1.5 h-hh-control-standard rounded-hh-standard border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-primary)]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--hh-text-secondary)]">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Optional details"
                rows={2}
                className="hh-focus-ring hh-touch-min mt-1.5 min-h-[88px] w-full rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-2.5 py-2 text-sm text-[var(--hh-text-primary)]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--hh-text-secondary)]">
                Assigned Worker
              </label>
              <select
                value={form.assigned_worker_id}
                onChange={(e) => setForm((p) => ({ ...p, assigned_worker_id: e.target.value }))}
                className="hh-focus-ring hh-touch-min mt-1.5 h-hh-control-standard w-full rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-2.5 text-sm text-[var(--hh-text-primary)]"
              >
                <option value="">—</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--hh-text-secondary)]">
                Priority
              </label>
              <select
                value={form.priority}
                onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
                className="hh-focus-ring hh-touch-min mt-1.5 h-hh-control-standard w-full rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-2.5 text-sm text-[var(--hh-text-primary)]"
              >
                {PRIORITIES.map((pr) => (
                  <option key={pr} value={pr}>
                    {pr}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--hh-text-secondary)]">Photo</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="mt-1.5 flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-hh-compact"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? "Uploading…" : "Upload photo"}
                </Button>
                {form.photo_url && (
                  <span className="text-xs text-[var(--hh-text-secondary)]">Uploaded</span>
                )}
              </div>
            </div>
            {error && <p className="text-sm text-[var(--hh-danger)]">{error}</p>}
          </div>
          <DialogFooter className="border-t border-[var(--hh-border)] pt-4">
            <Button
              variant="outline"
              size="sm"
              className="rounded-hh-compact"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="rounded-hh-compact"
              onClick={handleSaveNew}
              disabled={submitting}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
