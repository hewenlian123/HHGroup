"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FilterBar } from "@/components/filter-bar";
import { StatusBadge } from "@/components/status-badge";

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
      return name.includes(q) || role.includes(q);
    });
  }, [rows, query]);

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
      setMessage("Half-day rate must be a valid number.");
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
      }
      setEditorOpen(false);
      setForm(EMPTY_FORM);
      await refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage(msg || "Failed to save worker.");
    } finally {
      setSubmitting(false);
    }
  }, [editorMode, form, refresh]);

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
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Workers"
        subtitle="Manage labor worker profiles and default half-day rates."
        actions={
          <Button className="rounded-lg" onClick={openCreate} disabled={submitting || !!deletingId}>
            + New Worker
          </Button>
        }
      />

      <FilterBar>
        <Input
          placeholder="Search by name or trade"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-[320px]"
        />
      </FilterBar>

      {message ? (
        <p className="border-b border-[#EBEBE9] pb-3 text-sm text-muted-foreground dark:border-border">
          {message}
        </p>
      ) : null}
      {editorOpen ? (
        <section className="border-b border-[#EBEBE9] pb-4 dark:border-border">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Name</p>
              <Input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Worker name"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Role</p>
              <Input
                value={form.role}
                onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
                placeholder="Role"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Phone</p>
              <Input
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="Phone"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Half-day Rate</p>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.half_day_rate}
                onChange={(e) => setForm((prev) => ({ ...prev, half_day_rate: e.target.value }))}
                placeholder="0"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Status
              </p>
              <Select
                value={form.status}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    status: e.target.value === "inactive" ? "inactive" : "active",
                  }))
                }
                disabled={submitting}
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </Select>
            </div>
          </div>
          <div className="mt-4 flex flex-col-reverse items-stretch justify-end gap-2 border-t border-[#EBEBE9] pt-3 sm:flex-row sm:items-center dark:border-border">
            <Button
              variant="outline"
              size="sm"
              className="rounded-sm sm:w-auto"
              onClick={closeEditor}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="rounded-sm sm:w-auto"
              onClick={handleSave}
              disabled={submitting}
            >
              {submitting ? "Saving…" : editorMode === "create" ? "Create Worker" : "Save Changes"}
            </Button>
          </div>
        </section>
      ) : null}

      <div className="overflow-hidden rounded-sm border border-[#EBEBE9] dark:border-border">
        <div className="table-responsive">
          <table className="w-full min-w-[520px] text-sm md:min-w-0">
            <thead>
              <tr className="border-b border-[#EBEBE9] bg-[#F7F7F5] dark:border-border/60 dark:bg-muted/30">
                <th className="table-head-label px-4 py-3 text-left">Name</th>
                <th className="table-head-label px-4 py-3 text-left">Role</th>
                <th className="table-head-label px-4 py-3 text-left">Phone</th>
                <th className="table-head-label px-4 py-3 text-right">Half-day Rate</th>
                <th className="table-head-label px-4 py-3 text-left">Status</th>
                <th className="table-head-label px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="py-8 px-4 text-center text-muted-foreground" colSpan={6}>
                    Loading workers...
                  </td>
                </tr>
              ) : null}
              {filtered.map((w) => {
                return (
                  <tr
                    key={w.id}
                    className="group table-row-compact cursor-pointer border-b border-[#EBEBE9]/80 transition-colors hover:bg-[#F7F7F5] dark:border-border/40 dark:hover:bg-muted/20"
                    onClick={() => openEdit(w)}
                  >
                    <td className="py-3 px-4 font-medium text-foreground">{w.name || "—"}</td>
                    <td className="py-3 px-4 text-muted-foreground">{w.role || "—"}</td>
                    <td className="py-3 px-4 text-muted-foreground">{w.phone || "—"}</td>
                    <td className="py-3 px-4 text-right tabular-nums">
                      ${Number(w.half_day_rate ?? 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={w.status === "active" ? "active" : "inactive"} />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-sm px-3"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(w);
                          }}
                          disabled={submitting || deletingId === w.id}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-sm px-3"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDelete(w);
                          }}
                          disabled={submitting || deletingId === w.id}
                        >
                          {deletingId === w.id ? "Deleting..." : "Delete"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td className="py-8 px-4 text-center text-muted-foreground" colSpan={6}>
                    No workers found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
