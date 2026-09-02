"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import {
  Drawer,
  EmptyState,
  LoadingState,
  NeoActionFooter,
  NeoFieldLabel,
  NeoInput,
  NeoMobileCard,
  NeoModal,
  NeoSelect,
  NeoStatus,
  NeoTable,
  NeoTextarea,
  NeoToolbar,
  PageLayout,
  PageHeader,
  neoFormErrorClassName,
  type StatusBadgeVariant,
} from "@/components/base";
import { Button } from "@/components/ui/button";
import { listTablePrimaryCellClassName, listTableRowClassName } from "@/lib/list-table-interaction";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { TYPO } from "@/lib/typography";
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

const STATUS_VARIANT: Record<string, StatusBadgeVariant> = {
  passed: "success",
  failed: "danger",
  pending: "warning",
};

function statusLabel(status: string) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

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
      className={cn("md:max-w-5xl", mobileListPagePaddingClass, "max-md:!gap-3")}
      header={
        <>
          <div className="hidden md:block">
            <PageHeader
              title="Inspection Log"
              description="Track inspections by project."
              actions={
                <Button size="sm" className="md:max-lg:min-h-11" onClick={openModal}>
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
      <div data-testid="operations-inspection-log" className="w-full space-y-3">
        <MobileSearchFiltersRow
          filterSheetOpen={filtersOpen}
          onOpenFilters={() => setFiltersOpen(true)}
          activeFilterCount={activeDrawerFilterCount}
          searchSlot={
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <NeoInput
                aria-label="Search inspections"
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
            <NeoFieldLabel>Project</NeoFieldLabel>
            <NeoSelect
              aria-label="Filter inspections by project"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="w-full"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NeoSelect>
          </div>
          <div className="space-y-2">
            <NeoFieldLabel>Status</NeoFieldLabel>
            <NeoSelect
              aria-label="Filter inspections by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full"
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NeoSelect>
          </div>
          <Button
            type="button"
            className="w-full rounded-hh-compact"
            onClick={() => setFiltersOpen(false)}
          >
            Done
          </Button>
        </MobileFilterSheet>

        <NeoToolbar className="hidden flex-wrap items-end gap-3 md:flex">
          <div className="relative min-w-[200px] flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <NeoInput
              aria-label="Search inspections"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search inspections…"
              className="h-9 pl-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <NeoFieldLabel>Project</NeoFieldLabel>
            <NeoSelect
              aria-label="Filter inspections by project"
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
            </NeoSelect>
          </div>
          <div className="space-y-1">
            <NeoFieldLabel>Status</NeoFieldLabel>
            <NeoSelect
              aria-label="Filter inspections by status"
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
            </NeoSelect>
          </div>
        </NeoToolbar>

        <div>
          {loading ? (
            <LoadingState text="Loading inspections..." />
          ) : error ? (
            <EmptyState title="Inspection log unavailable" description={error} />
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
              <EmptyState
                title="No inspections yet"
                description="Add the first inspection entry for a project."
                action={
                  <Button size="sm" onClick={openModal}>
                    New inspection
                  </Button>
                }
                className="hidden md:block"
              />
            </>
          ) : filteredEntries.length === 0 ? (
            <EmptyState title="No matches" description="Try a different inspection filter." />
          ) : (
            <>
              <div className="space-y-2 md:hidden">
                {filteredEntries.map((row) => (
                  <NeoMobileCard asChild key={row.id}>
                    <button
                      type="button"
                      onClick={() => openDrawer(row)}
                      className="flex w-full min-h-[64px] flex-col gap-2 p-3 text-left"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[var(--hh-text-primary)]">
                            {row.inspection_type || "—"}
                          </p>
                          <p className="truncate text-xs text-[var(--hh-text-secondary)]">
                            {(row.project_name ?? "—") +
                              " · " +
                              (row.inspection_date
                                ? new Date(row.inspection_date).toLocaleDateString()
                                : "—")}
                          </p>
                        </div>
                        <NeoStatus
                          label={statusLabel(row.status)}
                          variant={STATUS_VARIANT[row.status] ?? "default"}
                        />
                      </div>
                      {row.inspector ? (
                        <p className="text-xs text-[var(--hh-text-secondary)]">{row.inspector}</p>
                      ) : null}
                    </button>
                  </NeoMobileCard>
                ))}
              </div>
              <NeoTable className="hidden md:block" tableClassName="min-w-[780px] lg:min-w-0">
                <thead>
                  <tr>
                    <th className={cn("h-9 px-3 text-left align-middle", TYPO.tableHeader)}>
                      Date
                    </th>
                    <th className={cn("h-9 px-3 text-left align-middle", TYPO.tableHeader)}>
                      Project
                    </th>
                    <th className={cn("h-9 px-3 text-left align-middle", TYPO.tableHeader)}>
                      Inspection Type
                    </th>
                    <th
                      className={cn(
                        "hidden h-9 px-3 text-left align-middle md:table-cell",
                        TYPO.tableHeader
                      )}
                    >
                      Inspector
                    </th>
                    <th className={cn("h-9 px-3 text-left align-middle", TYPO.tableHeader)}>
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
                      <td className="hh-fin h-11 px-3 py-0 align-middle text-hh-table-cell text-[var(--hh-text-secondary)]">
                        {row.inspection_date
                          ? new Date(row.inspection_date).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="h-11 px-3 py-0 align-middle text-hh-table-cell text-[var(--hh-text-secondary)]">
                        {row.project_name ?? "—"}
                      </td>
                      <td
                        className={cn(
                          "h-11 px-3 py-0 align-middle text-hh-table-cell font-medium text-[var(--hh-text-primary)]",
                          listTablePrimaryCellClassName,
                          "hover:underline"
                        )}
                      >
                        {row.inspection_type || "—"}
                      </td>
                      <td className="hidden h-11 px-3 py-0 align-middle text-hh-table-cell text-[var(--hh-text-secondary)] md:table-cell">
                        {row.inspector ?? "—"}
                      </td>
                      <td className="h-11 px-3 py-0 align-middle">
                        <NeoStatus
                          label={statusLabel(row.status)}
                          variant={STATUS_VARIANT[row.status] ?? "default"}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </NeoTable>
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
            <div className="space-y-1.5">
              <NeoFieldLabel>Inspection type</NeoFieldLabel>
              <NeoInput
                value={drawerForm.inspection_type}
                onChange={(e) => setDrawerForm((f) => ({ ...f, inspection_type: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel>Inspector</NeoFieldLabel>
              <NeoInput
                value={drawerForm.inspector}
                onChange={(e) => setDrawerForm((f) => ({ ...f, inspector: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel>Inspection date</NeoFieldLabel>
              <NeoInput
                type="date"
                value={drawerForm.inspection_date}
                onChange={(e) => setDrawerForm((f) => ({ ...f, inspection_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel>Status</NeoFieldLabel>
              <NeoSelect
                value={drawerForm.status}
                onChange={(e) =>
                  setDrawerForm((f) => ({
                    ...f,
                    status: e.target.value as "passed" | "failed" | "pending",
                  }))
                }
                className="w-full"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NeoSelect>
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel>Notes</NeoFieldLabel>
              <NeoTextarea
                value={drawerForm.notes}
                onChange={(e) => setDrawerForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
              />
            </div>
            {error && <p className={neoFormErrorClassName}>{error}</p>}
            <NeoActionFooter>
              <Button size="sm" variant="outline" onClick={() => setDrawerOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveDrawer} disabled={submitting}>
                Save
              </Button>
            </NeoActionFooter>
          </div>
        )}
      </Drawer>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <NeoModal
          title="New Inspection"
          description="Add an inspection log entry."
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={submitting}>
                Add
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <NeoFieldLabel>Project</NeoFieldLabel>
              <NeoSelect
                value={form.project_id}
                onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
                className="w-full"
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NeoSelect>
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel>Inspection type</NeoFieldLabel>
              <NeoInput
                value={form.inspection_type}
                onChange={(e) => setForm((f) => ({ ...f, inspection_type: e.target.value }))}
                placeholder="e.g. Foundation, Framing"
              />
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel>Inspector</NeoFieldLabel>
              <NeoInput
                value={form.inspector}
                onChange={(e) => setForm((f) => ({ ...f, inspector: e.target.value }))}
                placeholder="Inspector name"
              />
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel>Inspection date</NeoFieldLabel>
              <NeoInput
                type="date"
                value={form.inspection_date}
                onChange={(e) => setForm((f) => ({ ...f, inspection_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel>Status</NeoFieldLabel>
              <NeoSelect
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    status: e.target.value as "passed" | "failed" | "pending",
                  }))
                }
                className="w-full"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NeoSelect>
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel>Notes</NeoFieldLabel>
              <NeoTextarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional"
                rows={2}
              />
            </div>
            {error && <p className={neoFormErrorClassName}>{error}</p>}
          </div>
        </NeoModal>
      </Dialog>
    </PageLayout>
  );
}
