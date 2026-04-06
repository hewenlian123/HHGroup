"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { PageLayout, PageHeader, Drawer } from "@/components/base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { listTablePrimaryCellClassName, listTableRowClassName } from "@/lib/list-table-interaction";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import {
  MobileEmptyState,
  MobileFabButton,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";

type InspectionRow = {
  id: string;
  project_id: string;
  project_name: string | null;
  inspection_type: string;
  inspector: string | null;
  inspection_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

const STATUS_OPTIONS = [
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
  { value: "pending", label: "Pending" },
];

const STATUS_STYLES: Record<string, string> = {
  passed: "bg-[#DCFCE7] text-[#166534] dark:bg-green-950 dark:text-green-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  pending: "bg-muted text-muted-foreground",
};

export default function InspectionLogPage() {
  const [entries, setEntries] = React.useState<InspectionRow[]>([]);
  const [projects, setProjects] = React.useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [selectedEntry, setSelectedEntry] = React.useState<InspectionRow | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [form, setForm] = React.useState({
    project_id: "",
    inspection_type: "",
    inspector: "",
    inspection_date: "",
    status: "pending" as "passed" | "failed" | "pending",
    notes: "",
  });
  const [drawerForm, setDrawerForm] = React.useState({
    inspection_type: "",
    inspector: "",
    inspection_date: "",
    status: "pending" as "passed" | "failed" | "pending",
    notes: "",
  });
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [projectFilter, setProjectFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/operations/inspection-log");
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Failed to load");
      setEntries(data.entries ?? []);
      setProjects(data.projects ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inspection log.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  const openModal = () => {
    setForm({
      project_id: projects[0]?.id ?? "",
      inspection_type: "",
      inspector: "",
      inspection_date: "",
      status: "pending",
      notes: "",
    });
    setError(null);
    setModalOpen(true);
  };

  const openDrawer = (entry: InspectionRow) => {
    setSelectedEntry(entry);
    setDrawerForm({
      inspection_type: entry.inspection_type,
      inspector: entry.inspector ?? "",
      inspection_date: entry.inspection_date ?? "",
      status: (entry.status as "passed" | "failed" | "pending") || "pending",
      notes: entry.notes ?? "",
    });
    setError(null);
    setDrawerOpen(true);
  };

  const handleCreate = async () => {
    if (!form.project_id) {
      setError("Select a project.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/operations/inspection-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: form.project_id,
          inspection_type: form.inspection_type.trim() || "Inspection",
          inspector: form.inspector.trim() || null,
          inspection_date: form.inspection_date || null,
          status: form.status,
          notes: form.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Failed to create");
      setModalOpen(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveDrawer = async () => {
    if (!selectedEntry) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/operations/inspection-log/${selectedEntry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspection_type: drawerForm.inspection_type.trim() || selectedEntry.inspection_type,
          inspector: drawerForm.inspector.trim() || null,
          inspection_date: drawerForm.inspection_date || null,
          status: drawerForm.status,
          notes: drawerForm.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "Failed to update");
      setDrawerOpen(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update.");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredEntries = React.useMemo(() => {
    let list = entries;
    if (projectFilter) {
      list = list.filter((e) => e.project_id === projectFilter);
    }
    if (statusFilter) {
      list = list.filter((e) => e.status === statusFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          (e.inspection_type ?? "").toLowerCase().includes(q) ||
          (e.project_name ?? "").toLowerCase().includes(q) ||
          (e.inspector ?? "").toLowerCase().includes(q) ||
          (e.notes ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [entries, projectFilter, statusFilter, searchQuery]);

  const activeDrawerFilterCount = (projectFilter ? 1 : 0) + (statusFilter ? 1 : 0);

  return (
    <PageLayout
      divider={false}
      className={cn("max-w-5xl", mobileListPagePaddingClass, "max-md:!gap-3")}
      header={
        <>
          <div className="hidden md:block">
            <PageHeader
              title="Inspection Log"
              description="Track inspections by project."
              actions={
                <Button size="sm" onClick={openModal}>
                  + New Inspection
                </Button>
              }
            />
          </div>
          <div className="md:hidden">
            <MobileListHeader
              title="Inspection Log"
              fab={<MobileFabButton ariaLabel="New inspection" onClick={openModal} />}
            />
          </div>
        </>
      }
    >
      <div className="max-w-5xl space-y-3 md:mx-auto">
        <MobileSearchFiltersRow
          filterSheetOpen={filtersOpen}
          onOpenFilters={() => setFiltersOpen(true)}
          activeFilterCount={activeDrawerFilterCount}
          searchSlot={
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search inspections…"
                className="h-10 pl-8 text-sm"
              />
            </div>
          }
        />
        <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Project</p>
            <Select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="mt-1 w-full"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Status</p>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="mt-1 w-full"
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <Button type="button" className="w-full rounded-sm" onClick={() => setFiltersOpen(false)}>
            Done
          </Button>
        </MobileFilterSheet>

        <div className="hidden flex-wrap items-end gap-3 md:flex">
          <div className="relative min-w-[200px] flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search inspections…"
              className="h-9 pl-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Project
            </p>
            <Select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="h-9 min-w-[160px]"
            >
              <option value="">All</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Status
            </p>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 min-w-[120px]"
            >
              <option value="">All</option>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="airtable-table-wrap airtable-table-wrap--ruled max-md:border-0 max-md:bg-transparent">
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : error ? (
            <div className="px-3 py-10 text-center text-sm text-destructive">{error}</div>
          ) : entries.length === 0 ? (
            <>
              <MobileEmptyState
                icon={<Search className="h-8 w-8 opacity-80" aria-hidden />}
                message="No inspections yet."
                action={
                  <Button size="sm" variant="outline" onClick={openModal}>
                    New inspection
                  </Button>
                }
              />
              <div className="hidden py-10 text-center text-sm text-muted-foreground md:block">
                No inspections yet.
              </div>
            </>
          ) : filteredEntries.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No matches.</div>
          ) : (
            <>
              <div className="divide-y divide-gray-100 dark:divide-border/60 md:hidden">
                {filteredEntries.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => openDrawer(row)}
                    className="flex w-full min-h-[56px] flex-col gap-1 py-2.5 text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {row.inspection_type || "—"}
                        </p>
                        <p className="truncate text-xs text-text-secondary dark:text-muted-foreground">
                          {(row.project_name ?? "—") +
                            " · " +
                            (row.inspection_date
                              ? new Date(row.inspection_date).toLocaleDateString()
                              : "—")}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "inline-flex shrink-0 rounded-sm px-1.5 py-0.5 text-xs font-medium capitalize",
                          STATUS_STYLES[row.status] ?? STATUS_STYLES.pending
                        )}
                      >
                        {row.status}
                      </span>
                    </div>
                    {row.inspector ? (
                      <p className="text-xs text-muted-foreground">{row.inspector}</p>
                    ) : null}
                  </button>
                ))}
              </div>
              <div className="airtable-table-scroll hidden md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="h-8 px-2 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF] sm:px-3">
                        Date
                      </th>
                      <th className="h-8 px-2 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF] sm:px-3">
                        Project
                      </th>
                      <th className="h-8 px-2 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF] sm:px-3">
                        Inspection Type
                      </th>
                      <th className="hidden h-8 px-3 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF] md:table-cell">
                        Inspector
                      </th>
                      <th className="h-8 px-2 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF] sm:px-3">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => openDrawer(row)}
                        className={listTableRowClassName}
                      >
                        <td className="py-2 px-2 sm:px-3 text-muted-foreground tabular-nums">
                          {row.inspection_date
                            ? new Date(row.inspection_date).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="py-2 px-2 sm:px-3 text-muted-foreground">
                          {row.project_name ?? "—"}
                        </td>
                        <td
                          className={cn(
                            "py-2 px-2 sm:px-3 font-medium",
                            listTablePrimaryCellClassName,
                            "hover:underline"
                          )}
                        >
                          {row.inspection_type || "—"}
                        </td>
                        <td className="hidden md:table-cell py-2 px-3 text-muted-foreground">
                          {row.inspector ?? "—"}
                        </td>
                        <td className="py-2 px-2 sm:px-3">
                          <span
                            className={cn(
                              "inline-flex rounded-sm px-1.5 py-0.5 text-xs font-medium capitalize",
                              STATUS_STYLES[row.status] ?? STATUS_STYLES.pending
                            )}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Inspection detail"
        description={selectedEntry?.project_name ?? undefined}
      >
        {selectedEntry && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Inspection type</label>
              <Input
                value={drawerForm.inspection_type}
                onChange={(e) => setDrawerForm((f) => ({ ...f, inspection_type: e.target.value }))}
                className="mt-1 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Inspector</label>
              <Input
                value={drawerForm.inspector}
                onChange={(e) => setDrawerForm((f) => ({ ...f, inspector: e.target.value }))}
                className="mt-1 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Inspection date</label>
              <Input
                type="date"
                value={drawerForm.inspection_date}
                onChange={(e) => setDrawerForm((f) => ({ ...f, inspection_date: e.target.value }))}
                className="mt-1 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select
                value={drawerForm.status}
                onChange={(e) =>
                  setDrawerForm((f) => ({
                    ...f,
                    status: e.target.value as "passed" | "failed" | "pending",
                  }))
                }
                className="mt-1 w-full"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <textarea
                value={drawerForm.notes}
                onChange={(e) => setDrawerForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="mt-1 w-full rounded-sm border border-border/60 px-2.5 py-2 text-sm"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={() => setDrawerOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveDrawer} disabled={submitting}>
                Save
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">New Inspection</DialogTitle>
            <DialogDescription>Add an inspection log entry.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Project</label>
              <Select
                value={form.project_id}
                onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
                className="mt-1.5 w-full"
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Inspection type</label>
              <Input
                value={form.inspection_type}
                onChange={(e) => setForm((f) => ({ ...f, inspection_type: e.target.value }))}
                placeholder="e.g. Foundation, Framing"
                className="mt-1.5 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Inspector</label>
              <Input
                value={form.inspector}
                onChange={(e) => setForm((f) => ({ ...f, inspector: e.target.value }))}
                placeholder="Inspector name"
                className="mt-1.5 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Inspection date</label>
              <Input
                type="date"
                value={form.inspection_date}
                onChange={(e) => setForm((f) => ({ ...f, inspection_date: e.target.value }))}
                className="mt-1.5 h-9 rounded-sm border-border/60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    status: e.target.value as "passed" | "failed" | "pending",
                  }))
                }
                className="mt-1.5 w-full"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional"
                rows={2}
                className="mt-1.5 w-full rounded-sm border border-border/60 px-2.5 py-2 text-sm"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="border-t border-border/60 pt-4">
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={submitting}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
