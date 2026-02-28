"use client";

import * as React from "react";
import { createClient } from "@supabase/supabase-js";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = !!url && !!anon;
  const supabase = React.useMemo(
    () => (configured ? createClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

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
    if (!configured || !supabase) {
      setMessage("Supabase is not configured.");
      setRows([]);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("workers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRows((data ?? []) as WorkerRow[]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage(msg || "Failed to fetch workers.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [configured, supabase]);

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
    if (!configured || !supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

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
        const { error } = await supabase.from("workers").insert([
          {
            name,
            role: form.role.trim() || null,
            phone: form.phone.trim() || null,
            half_day_rate: rate,
            status: form.status,
          },
        ]);
        if (error) throw error;
      } else {
        if (!form.id) throw new Error("Missing worker id.");
        const { error } = await supabase
          .from("workers")
          .update({
            name,
            role: form.role.trim() || null,
            phone: form.phone.trim() || null,
            half_day_rate: rate,
            status: form.status,
          })
          .eq("id", form.id);
        if (error) throw error;
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
  }, [configured, editorMode, form, refresh, supabase]);

  const handleDelete = React.useCallback(
    async (worker: WorkerRow) => {
      if (!configured || !supabase) {
        setMessage("Supabase is not configured.");
        return;
      }
      if (!window.confirm(`Delete worker "${worker.name || "Unnamed"}"?`)) return;

      setDeletingId(worker.id);
      setMessage(null);
      try {
        const { error } = await supabase.from("workers").delete().eq("id", worker.id);
        if (error) throw error;
        await refresh();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setMessage(msg || "Failed to delete worker.");
      } finally {
        setDeletingId(null);
      }
    },
    [configured, refresh, supabase]
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
        <div className="rounded-lg border border-zinc-200/60 dark:border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {message}
        </div>
      ) : null}
      {editorOpen ? (
        <Card className="rounded-2xl border border-zinc-200/60 dark:border-border p-4">
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
              <p className="text-xs text-muted-foreground">Status</p>
              <select
                className="h-10 w-full rounded-[10px] border border-input bg-muted/20 px-3 text-sm"
                value={form.status}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, status: e.target.value === "inactive" ? "inactive" : "active" }))
                }
                disabled={submitting}
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2 border-t border-zinc-200/60 pt-3 dark:border-border">
            <Button onClick={handleSave} disabled={submitting}>
              {submitting ? "Saving..." : editorMode === "create" ? "Create Worker" : "Save Changes"}
            </Button>
            <Button variant="outline" onClick={closeEditor} disabled={submitting}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200/40 bg-muted/30 dark:border-border/60">
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
                    className="group table-row-compact cursor-pointer border-b border-zinc-100/50 dark:border-border/30"
                    onClick={() => openEdit(w)}
                  >
                    <td className="py-3 px-4 font-medium text-foreground">{w.name || "—"}</td>
                    <td className="py-3 px-4 text-muted-foreground">{w.role || "—"}</td>
                    <td className="py-3 px-4 text-muted-foreground">{w.phone || "—"}</td>
                    <td className="py-3 px-4 text-right tabular-nums">${Number(w.half_day_rate ?? 0).toLocaleString()}</td>
                    <td className="py-3 px-4">
                      <StatusBadge status={w.status === "active" ? "active" : "inactive"} />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity duration-100 group-hover:opacity-100">
                        <Button
                          variant="outline"
                          className="h-8 px-3"
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
                          className="h-8 px-3"
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
      </Card>
    </div>
  );
}
