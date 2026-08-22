"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { listTableRowClassName } from "@/lib/list-table-interaction";
import { NeoAmount, NeoMobileCard, NeoTable, NeoToolbar } from "@/components/base";
import {
  MobileFabButton,
  MobileListHeader,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { formatCurrency } from "@/lib/formatters";
import {
  Briefcase,
  DollarSign,
  Pencil,
  PhoneOff,
  Plus,
  Search,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";

type WorkerRow = {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  half_day_rate: number | null;
  status: "active" | "inactive" | null;
};

type WorkerForm = {
  id?: string;
  name: string;
  role: string;
  phone: string;
  half_day_rate: string;
  status: "active" | "inactive";
};

const EMPTY_FORM: WorkerForm = {
  name: "",
  role: "",
  phone: "",
  half_day_rate: "",
  status: "active",
};

const workerShell =
  "rounded-hh-task border border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[color:var(--hh-text-primary)] shadow-operational";

const workerKpiIcon =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[color:var(--hh-information)] shadow-operational md:h-9 md:w-9";

const workerKpiCardClass =
  "flex min-h-[72px] min-w-0 items-center gap-2.5 px-3 py-3 md:h-[82px] md:gap-3 md:px-4";

const workerKpiLabelClass =
  "text-hh-status font-semibold uppercase leading-none tracking-normal text-[color:var(--hh-text-tertiary)]";

const workerKpiValueClass =
  "mt-1 truncate text-hh-financial-total font-semibold tabular-nums leading-none tracking-normal text-[color:var(--hh-text-primary)] ";

const workerKpiMetaClass =
  "mt-1 truncate text-hh-status leading-none text-[color:var(--hh-text-tertiary)]";

const workerHeaderActionButton =
  "h-9 rounded-full border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 text-hh-control text-[var(--hh-text-secondary)] shadow-none transition-colors duration-150 hover:border-[var(--hh-border-strong)] hover:bg-[var(--hh-l3-hover)] hover:text-[var(--hh-text-primary)] disabled:text-[var(--hh-text-tertiary)]";

const workerSecondaryButton =
  "rounded-full border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[color:var(--hh-text-secondary)] shadow-operational transition-colors duration-150 hover:border-[color:var(--hh-border-strong)] hover:bg-[var(--hh-l3-hover)] hover:text-[color:var(--hh-text-primary)]";

const workerInputClass =
  "h-10 rounded-full border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[color:var(--hh-text-primary)] placeholder:text-[color:var(--hh-text-tertiary)] shadow-none hover:bg-[var(--hh-l3-hover)] focus-visible:border-[var(--hh-border-strong)] focus-visible:ring-[var(--hh-focus-ring)]";

const workerFieldClass =
  "h-10 rounded-hh-standard border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[color:var(--hh-text-primary)] placeholder:text-[color:var(--hh-text-tertiary)] shadow-none hover:bg-[var(--hh-l3-hover)] focus-visible:border-[var(--hh-border-strong)] focus-visible:ring-[var(--hh-focus-ring)]";

const workerLabelClass =
  "text-hh-status font-semibold uppercase leading-none tracking-normal text-[color:var(--hh-text-tertiary)]";

function workerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
  }
  return (parts[0] ?? name).slice(0, 2).toUpperCase();
}

function formatDailyRate(value: number | null | undefined): string {
  return `${formatCurrency(Number(value) || 0)} / day`;
}

function WorkerStatusPill({ status }: { status: WorkerRow["status"] }) {
  const active = status === "active";
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border bg-[var(--hh-l2-operational-surface)] px-2.5 text-hh-status font-semibold leading-none shadow-operational",
        active
          ? "border-[color:rgb(139_215_177_/_0.28)] text-[color:var(--hh-success)]"
          : "border-[color:var(--hh-border)] text-[color:var(--hh-text-tertiary)]"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          active ? "bg-[var(--hh-success)]" : "bg-[var(--hh-text-tertiary)]"
        )}
        aria-hidden
      />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export default function LaborWorkersPage() {
  const [rows, setRows] = React.useState<WorkerRow[]>([]);
  const [query, setQuery] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorMode, setEditorMode] = React.useState<"create" | "edit">("create");
  const [form, setForm] = React.useState<WorkerForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/labor/workers?t=${Date.now()}`, {
        cache: "no-store",
        headers: { Pragma: "no-cache" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Failed to fetch workers.");
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.workers ?? []);
      setRows(
        list.map((w: Record<string, unknown>) => ({
          id: (w.id as string) ?? "",
          name: (w.name as string) ?? "",
          role: (w.role ?? w.trade) as string | null,
          phone: (w.phone as string | null) ?? null,
          half_day_rate: Number(w.half_day_rate ?? w.daily_rate ?? 0) || 0,
          status: (w.status === "active" || w.status === "inactive" ? w.status : "active") as
            | "active"
            | "inactive"
            | null,
        }))
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage(msg || "Failed to fetch workers.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((w) => {
      const name = (w.name ?? "").toLowerCase();
      const role = (w.role ?? "").toLowerCase();
      const phone = (w.phone ?? "").toLowerCase();
      return name.includes(q) || role.includes(q) || phone.includes(q);
    });
  }, [rows, query]);

  const workerStats = React.useMemo(() => {
    const activeWorkers = rows.filter((w) => w.status !== "inactive").length;
    const inactiveWorkers = rows.length - activeWorkers;
    const missingPhone = rows.filter((w) => !w.phone?.trim()).length;
    const ratedWorkers = rows.filter((w) => Number.isFinite(Number(w.half_day_rate)));
    const avgDailyRate = ratedWorkers.length
      ? ratedWorkers.reduce((sum, w) => sum + (Number(w.half_day_rate) || 0), 0) /
        ratedWorkers.length
      : 0;

    return {
      activeWorkers,
      avgDailyRate,
      inactiveWorkers,
      missingPhone,
      totalWorkers: rows.length,
    };
  }, [rows]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
    [refresh]
  );

  const openCreate = React.useCallback(() => {
    setEditorMode("create");
    setForm(EMPTY_FORM);
    setEditorOpen(true);
    setMessage(null);
  }, []);

  const openEdit = React.useCallback((worker: WorkerRow) => {
    setEditorMode("edit");
    setForm({
      id: worker.id,
      name: worker.name ?? "",
      role: worker.role ?? "",
      phone: worker.phone ?? "",
      half_day_rate: String(worker.half_day_rate ?? 0),
      status: worker.status === "inactive" ? "inactive" : "active",
    });
    setEditorOpen(true);
    setMessage(null);
  }, []);

  const closeEditor = React.useCallback(() => {
    if (submitting) return;
    setEditorOpen(false);
    setForm(EMPTY_FORM);
  }, [submitting]);

  const handleSave = React.useCallback(async () => {
    const name = form.name.trim();
    const rate = Number(form.half_day_rate);
    if (!name) {
      setMessage("Name is required.");
      return;
    }
    if (!Number.isFinite(rate) || rate < 0) {
      setMessage("Daily rate must be a valid number.");
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      if (editorMode === "create") {
        const res = await fetch("/api/labor/workers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            role: form.role.trim() || null,
            phone: form.phone.trim() || null,
            half_day_rate: rate,
            status: form.status,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message ?? "Failed to create worker.");
        setRows((prev) => [
          {
            id: String(data.id ?? crypto.randomUUID()),
            name: String(data.name ?? name),
            role: (data.trade ?? data.role ?? form.role ?? null) as string | null,
            phone: (data.phone ?? form.phone ?? null) as string | null,
            half_day_rate: Number(data.halfDayRate ?? data.half_day_rate ?? rate) || 0,
            status: (data.status === "inactive" ? "inactive" : "active") as
              | "active"
              | "inactive"
              | null,
          },
          ...prev,
        ]);
      } else {
        if (!form.id) throw new Error("Missing worker id.");
        const res = await fetch(`/api/labor/workers/${form.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            role: form.role.trim() || null,
            phone: form.phone.trim() || null,
            half_day_rate: rate,
            status: form.status,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message ?? "Failed to update worker.");
        setRows((prev) =>
          prev.map((w) =>
            w.id === form.id
              ? {
                  ...w,
                  name: String(data.name ?? name),
                  role: (data.trade ?? data.role ?? form.role ?? null) as string | null,
                  phone: (data.phone ?? form.phone ?? null) as string | null,
                  half_day_rate: Number(data.halfDayRate ?? data.half_day_rate ?? rate) || 0,
                  status: (data.status === "inactive" ? "inactive" : "active") as
                    | "active"
                    | "inactive"
                    | null,
                }
              : w
          )
        );
      }
      setEditorOpen(false);
      setForm(EMPTY_FORM);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage(msg || "Failed to save worker.");
    } finally {
      setSubmitting(false);
    }
  }, [editorMode, form]);

  const handleDelete = React.useCallback(
    async (worker: WorkerRow) => {
      if (!window.confirm(`Delete worker "${worker.name || "Unnamed"}"?`)) return;

      setDeletingId(worker.id);
      setMessage(null);
      const prevRows = rows;
      setRows((r) => r.filter((w) => w.id !== worker.id));
      try {
        const res = await fetch(`/api/labor/workers/${worker.id}`, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message ?? "Failed to delete worker.");
      } catch (err: unknown) {
        setRows(prevRows);
        const msg = err instanceof Error ? err.message : String(err);
        setMessage(msg || "Failed to delete worker.");
      } finally {
        setDeletingId(null);
      }
    },
    [rows]
  );

  return (
    <div className="min-w-0 overflow-x-hidden bg-[var(--hh-l0-canvas)] pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-[max(0.35rem,env(safe-area-inset-top,0px))] text-[color:var(--hh-text-secondary)]">
      <div
        className={cn(
          "page-container page-shell-wide flex min-w-0 flex-col gap-2 pb-4 pt-2 md:gap-3 md:pb-6 md:pt-3",
          mobileListPagePaddingClass,
          "max-md:!gap-2"
        )}
      >
        <div className="hidden md:block">
          <PageHeader
            className="gap-2 border-b border-[color:var(--hh-border)] pb-4 lg:items-end lg:gap-x-5 [&_h1]:!text-hh-page-title [&_h1]:!font-semibold [&_h1]:!leading-none [&_h1]:!tracking-normal [&_h1]:!text-[color:var(--hh-text-primary)] [&_p]:!mt-1.5 [&_p]:!max-w-xl [&_p]:!text-hh-body [&_p]:!leading-snug [&_p]:!text-[color:var(--hh-text-secondary)]"
            title="Workers"
            subtitle="Manage workers: trades, daily rate, default OT rate, and status."
            actions={
              <Button
                size="sm"
                variant="outline"
                className={workerHeaderActionButton}
                onClick={openCreate}
                disabled={submitting || !!deletingId}
                aria-label="+ New Worker"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add Worker
              </Button>
            }
          />
        </div>

        <MobileListHeader
          title="Workers"
          fab={
            <MobileFabButton
              ariaLabel="+ New Worker"
              onClick={openCreate}
              className="h-11 w-11 min-h-[44px] min-w-[44px] border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-information)]"
            />
          }
        />

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
          <div className={cn(workerShell, workerKpiCardClass)}>
            <span className={workerKpiIcon}>
              <UserCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className={workerKpiLabelClass}>Active Workers</p>
              <p className={workerKpiValueClass}>{workerStats.activeWorkers}</p>
              <p className={workerKpiMetaClass}>{workerStats.totalWorkers} total</p>
            </div>
          </div>
          <div className={cn(workerShell, workerKpiCardClass)}>
            <span className={workerKpiIcon}>
              <DollarSign className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className={workerKpiLabelClass}>Avg Daily Rate</p>
              <p className={workerKpiValueClass}>{formatCurrency(workerStats.avgDailyRate)}</p>
              <p className={workerKpiMetaClass}>Current list</p>
            </div>
          </div>
          <div className={cn(workerShell, workerKpiCardClass)}>
            <span className={workerKpiIcon}>
              <PhoneOff className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className={workerKpiLabelClass}>Missing Phone</p>
              <p className={workerKpiValueClass}>{workerStats.missingPhone}</p>
              <p className={workerKpiMetaClass}>Needs contact</p>
            </div>
          </div>
          <div className={cn(workerShell, workerKpiCardClass)}>
            <span className={workerKpiIcon}>
              <Users className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className={workerKpiLabelClass}>Inactive Workers</p>
              <p className={workerKpiValueClass}>{workerStats.inactiveWorkers}</p>
              <p className={workerKpiMetaClass}>Archived from crew</p>
            </div>
          </div>
        </div>

        <NeoToolbar className="border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-2.5 shadow-operational">
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className={workerKpiLabelClass}>Search</p>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--hh-text-tertiary)]"
                aria-hidden
              />
              <Input
                placeholder="Search workers, trade, phone..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={cn(workerInputClass, "pl-9")}
                aria-label="Search workers"
              />
            </div>
          </div>
        </NeoToolbar>

        {message ? (
          <p className="rounded-hh-standard border border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 py-2 text-sm text-[color:var(--hh-text-secondary)]">
            {message}
          </p>
        ) : null}
        {editorOpen ? (
          <section className={cn(workerShell, "p-4")}>
            <div className="mb-4 flex flex-col gap-1 border-b border-[color:var(--hh-border)] pb-3">
              <h2 className="text-hh-section-title font-semibold leading-none text-[color:var(--hh-text-primary)]">
                {editorMode === "create" ? "Add Worker" : "Edit Worker"}
              </h2>
              <p className="text-hh-metadata leading-snug text-[color:var(--hh-text-secondary)]">
                Update worker profile details without changing labor calculations.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <p className={workerLabelClass}>Name</p>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Worker name"
                  disabled={submitting}
                  className={workerFieldClass}
                />
              </div>
              <div className="space-y-1">
                <p className={workerLabelClass}>Trade</p>
                <Input
                  value={form.role}
                  onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
                  placeholder="Trade"
                  disabled={submitting}
                  className={workerFieldClass}
                />
              </div>
              <div className="space-y-1">
                <p className={workerLabelClass}>Phone</p>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="Phone"
                  disabled={submitting}
                  className={workerFieldClass}
                />
              </div>
              <div className="space-y-1">
                <p className={workerLabelClass}>Daily Rate</p>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.half_day_rate}
                  onChange={(e) => setForm((prev) => ({ ...prev, half_day_rate: e.target.value }))}
                  placeholder="0"
                  disabled={submitting}
                  className={cn(workerFieldClass, "tabular-nums")}
                />
              </div>
              <div className="space-y-1">
                <p className={workerLabelClass}>Status</p>
                <Select
                  value={form.status}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      status: e.target.value === "inactive" ? "inactive" : "active",
                    }))
                  }
                  disabled={submitting}
                  className={cn(workerFieldClass, "rounded-hh-standard")}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </div>
            </div>
            <div className="mt-4 flex flex-col-reverse items-stretch justify-end gap-2 border-t border-[color:var(--hh-border)] pt-3 sm:flex-row sm:items-center">
              <Button
                variant="outline"
                size="sm"
                className={cn(workerSecondaryButton, "h-10 sm:w-auto md:min-h-10")}
                onClick={closeEditor}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={cn(workerHeaderActionButton, "h-10 sm:w-auto md:min-h-10")}
                onClick={handleSave}
                disabled={submitting}
              >
                <SubmitSpinner loading={submitting} className="mr-2" />
                {submitting
                  ? "Saving…"
                  : editorMode === "create"
                    ? "Create Worker"
                    : "Save Changes"}
              </Button>
            </div>
          </section>
        ) : null}

        <div className="md:hidden">
          {loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <NeoMobileCard
                  key={i}
                  className="space-y-3 rounded-hh-task border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-3"
                >
                  <div className="flex items-start gap-3">
                    <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Skeleton className="h-11 w-full" />
                    <Skeleton className="h-11 w-full" />
                  </div>
                </NeoMobileCard>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <NeoMobileCard className="flex flex-col items-center rounded-hh-task border-dashed border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-4 py-10 text-center">
              <Briefcase className="h-8 w-8 text-[color:var(--hh-text-tertiary)]" aria-hidden />
              <p className="mt-3 text-sm font-medium text-[color:var(--hh-text-secondary)]">
                No workers yet
              </p>
              <p className="mt-1 max-w-[260px] text-xs leading-snug text-[color:var(--hh-text-tertiary)]">
                Add a worker to start managing crew rates, trades, and labor status.
              </p>
              <Button
                size="sm"
                variant="outline"
                className={cn(workerHeaderActionButton, "mt-4 h-10 min-h-[44px]")}
                onClick={openCreate}
                aria-label="+ New Worker"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add Worker
              </Button>
            </NeoMobileCard>
          ) : filtered.length === 0 ? (
            <NeoMobileCard className="flex flex-col items-center rounded-hh-task border-dashed border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-4 py-10 text-center">
              <Search className="h-8 w-8 text-[color:var(--hh-text-tertiary)]" aria-hidden />
              <p className="mt-3 text-sm font-medium text-[color:var(--hh-text-secondary)]">
                No workers match your search
              </p>
            </NeoMobileCard>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((w) => (
                <NeoMobileCard
                  key={w.id}
                  className="space-y-3 rounded-hh-task border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-3 shadow-operational"
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                      onClick={() => openEdit(w)}
                    >
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-hh-metadata font-semibold leading-none text-[color:var(--hh-text-secondary)] shadow-operational"
                        aria-hidden
                      >
                        {workerInitials(w.name || "Worker")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-hh-section-title font-semibold leading-snug text-[color:var(--hh-text-primary)]">
                          {w.name || "—"}
                        </span>
                        <span className="mt-0.5 block truncate text-hh-metadata leading-snug text-[color:var(--hh-text-secondary)]">
                          {w.role?.trim() || "Trade not set"}
                        </span>
                      </span>
                    </button>
                    <WorkerStatusPill status={w.status === "active" ? "active" : "inactive"} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-y border-[color:var(--hh-border)] py-2 text-xs">
                    <div className="min-w-0">
                      <p className={workerKpiLabelClass}>Daily Rate</p>
                      <NeoAmount className="mt-1 block truncate text-hh-body">
                        {formatDailyRate(w.half_day_rate)}
                      </NeoAmount>
                    </div>
                    <div className="min-w-0">
                      <p className={workerKpiLabelClass}>Default OT</p>
                      <p className="mt-1 truncate text-hh-table-cell font-medium tabular-nums text-[color:var(--hh-text-tertiary)]">
                        —
                      </p>
                    </div>
                    <div className="col-span-2 min-w-0">
                      <p className={workerKpiLabelClass}>Phone</p>
                      <p
                        className={cn(
                          "mt-1 truncate text-hh-table-cell leading-snug",
                          w.phone?.trim()
                            ? "text-[color:var(--hh-text-secondary)]"
                            : "text-[color:var(--hh-text-tertiary)]"
                        )}
                      >
                        {w.phone?.trim() || "Phone not set"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(workerSecondaryButton, "h-11 min-h-[44px] flex-1")}
                      onClick={() => openEdit(w)}
                      disabled={submitting || deletingId === w.id}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        workerSecondaryButton,
                        "h-11 min-h-[44px] flex-1 text-[var(--hh-danger)] hover:border-[var(--hh-danger-border)] hover:bg-[var(--hh-danger-soft-fill)] hover:text-[var(--hh-danger)]"
                      )}
                      onClick={() => void handleDelete(w)}
                      disabled={submitting || deletingId === w.id}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                      {deletingId === w.id ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </NeoMobileCard>
              ))}
            </div>
          )}
        </div>

        <NeoTable
          className="hidden border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] shadow-operational md:block"
          tableClassName="min-w-[860px] lg:min-w-0"
          busy={loading}
        >
          <thead>
            <tr className="border-b border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)]">
              <th className="min-w-[180px] px-3 py-2 text-left text-hh-status font-semibold uppercase tracking-normal text-[color:var(--hh-text-tertiary)]">
                Name
              </th>
              <th className="min-w-[128px] px-3 py-2 text-left text-hh-status font-semibold uppercase tracking-normal text-[color:var(--hh-text-tertiary)]">
                Trade
              </th>
              <th className="min-w-[132px] px-3 py-2 text-left text-hh-status font-semibold uppercase tracking-normal text-[color:var(--hh-text-tertiary)]">
                Phone
              </th>
              <th className="min-w-[132px] whitespace-nowrap px-3 py-2 text-right text-hh-status font-semibold uppercase tracking-normal text-[color:var(--hh-text-tertiary)] tabular-nums">
                Daily Rate
              </th>
              <th className="min-w-[128px] whitespace-nowrap px-3 py-2 text-right text-hh-status font-semibold uppercase tracking-normal text-[color:var(--hh-text-tertiary)] tabular-nums">
                Default OT
              </th>
              <th className="w-[108px] whitespace-nowrap px-3 py-2 text-left text-hh-status font-semibold uppercase tracking-normal text-[color:var(--hh-text-tertiary)]">
                Status
              </th>
              <th className="w-[150px] px-3 py-2 text-right text-hh-status font-semibold uppercase tracking-normal text-[color:var(--hh-text-tertiary)]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }, (_, i) => (
                  <tr
                    key={`sk-${i}`}
                    className="pointer-events-none border-0 hover:!translate-y-0 hover:!bg-transparent active:!scale-100"
                  >
                    {Array.from({ length: 7 }, (__, j) => (
                      <td key={j} className="px-3 py-2.5 align-middle">
                        <Skeleton
                          className={cn(
                            "h-4 rounded-hh-compact",
                            j === 5 ? "w-16" : j === 6 ? "ml-auto w-24" : "max-w-[10rem]"
                          )}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              : null}
            {filtered.map((w) => {
              return (
                <tr
                  key={w.id}
                  className={cn(
                    listTableRowClassName,
                    "border-b border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] hover:!bg-[var(--hh-l3-hover)] focus-within:!bg-[var(--hh-l3-hover)]"
                  )}
                  onClick={() => openEdit(w)}
                >
                  <td className="px-3 py-2.5 align-middle">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-hh-status font-semibold leading-none text-[color:var(--hh-text-secondary)] shadow-operational"
                        aria-hidden
                      >
                        {workerInitials(w.name || "Worker")}
                      </span>
                      <span className="line-clamp-2 text-hh-body font-semibold leading-snug text-[color:var(--hh-text-primary)]">
                        {w.name || "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-middle text-hh-table-cell text-[color:var(--hh-text-secondary)]">
                    {w.role?.trim() ? (
                      <span className="line-clamp-2">{w.role}</span>
                    ) : (
                      <span className="text-[color:var(--hh-text-tertiary)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-middle text-hh-table-cell text-[color:var(--hh-text-secondary)]">
                    {w.phone?.trim() ? (
                      <span className="line-clamp-2">{w.phone}</span>
                    ) : (
                      <span className="text-[color:var(--hh-text-tertiary)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right align-middle">
                    <NeoAmount className="text-hh-table-cell">
                      {formatDailyRate(w.half_day_rate)}
                    </NeoAmount>
                  </td>
                  <td className="px-3 py-2.5 text-right align-middle">
                    <span className="text-hh-table-cell font-medium tabular-nums text-[color:var(--hh-text-tertiary)]">
                      —
                    </span>
                  </td>
                  <td className="px-3 py-2.5 align-middle text-hh-table-cell">
                    <WorkerStatusPill status={w.status === "active" ? "active" : "inactive"} />
                  </td>
                  <td className="px-3 py-2.5 align-middle text-hh-table-cell">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(workerSecondaryButton, "h-8 min-h-8 rounded-full px-3")}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(w);
                        }}
                        disabled={submitting || deletingId === w.id}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          workerSecondaryButton,
                          "h-8 min-h-8 rounded-full px-3 text-[var(--hh-danger)] hover:border-[var(--hh-danger-border)] hover:bg-[var(--hh-danger-soft-fill)] hover:text-[var(--hh-danger)]"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDelete(w);
                        }}
                        disabled={submitting || deletingId === w.id}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        {deletingId === w.id ? "Deleting..." : "Delete"}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && filtered.length === 0 ? (
              <tr className="border-b border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)]">
                <td
                  className="px-3 py-10 text-center text-[color:var(--hh-text-secondary)]"
                  colSpan={7}
                >
                  <div className="mx-auto flex max-w-[360px] flex-col items-center">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[color:var(--hh-text-tertiary)] shadow-operational">
                      {rows.length === 0 ? (
                        <Briefcase className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                      ) : (
                        <Search className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                      )}
                    </div>
                    <p className="mt-3 text-hh-table-cell font-medium text-[color:var(--hh-text-secondary)]">
                      {rows.length === 0 ? "No workers yet" : "No workers match your search"}
                    </p>
                    <p className="mt-1 text-hh-metadata leading-snug text-[color:var(--hh-text-tertiary)]">
                      {rows.length === 0
                        ? "Add a worker to start managing crew rates, trades, and labor status."
                        : "Try searching by worker, trade, or phone."}
                    </p>
                    {rows.length === 0 ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className={cn(workerHeaderActionButton, "mt-4")}
                        onClick={openCreate}
                        aria-label="+ New Worker"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                        Add Worker
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </NeoTable>
      </div>
    </div>
  );
}
