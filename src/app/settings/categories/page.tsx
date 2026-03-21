"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterBar } from "@/components/filter-bar";
import { StatusBadge } from "@/components/status-badge";

type CategoryRow = {
  id: string;
  name: string;
  type: "expense" | "income" | "other";
  status: "active" | "inactive";
  description: string | null;
  created_at: string;
};

type CategoryForm = {
  id?: string;
  name: string;
  type: "expense" | "income" | "other";
  status: "active" | "inactive";
  description: string;
};

const EMPTY_FORM: CategoryForm = {
  name: "",
  type: "expense",
  status: "active",
  description: "",
};

const toNullable = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export default function CategoriesPage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

  const [rows, setRows] = React.useState<CategoryRow[]>([]);
  const [query, setQuery] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<"" | "expense" | "income" | "other">("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorMode, setEditorMode] = React.useState<"create" | "edit">("create");
  const [form, setForm] = React.useState<CategoryForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    if (!configured || !supabase) {
      setRows([]);
      setMessage("Supabase is not configured.");
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase.from("categories").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setRows((data ?? []) as CategoryRow[]);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      setRows([]);
      setMessage(msg || "Failed to load categories.");
    } finally {
      setLoading(false);
    }
  }, [configured, supabase]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
    [refresh]
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (typeFilter && row.type !== typeFilter) return false;
      if (!q) return true;
      return [row.name, row.type, row.description]
        .map((value) => (value ?? "").toLowerCase())
        .some((value) => value.includes(q));
    });
  }, [rows, query, typeFilter]);

  const openCreate = () => {
    setEditorMode("create");
    setForm(EMPTY_FORM);
    setEditorOpen(true);
    setMessage(null);
  };

  const openEdit = (row: CategoryRow) => {
    setEditorMode("edit");
    setForm({
      id: row.id,
      name: row.name ?? "",
      type: row.type === "income" ? "income" : row.type === "other" ? "other" : "expense",
      status: row.status === "inactive" ? "inactive" : "active",
      description: row.description ?? "",
    });
    setEditorOpen(true);
    setMessage(null);
  };

  const handleSave = React.useCallback(async () => {
    if (!configured || !supabase) {
      setMessage("Supabase is not configured.");
      return;
    }
    if (!form.name.trim()) {
      setMessage("Category name is required.");
      return;
    }
    setSubmitting(true);
    setMessage(null);
    const payload = {
      name: form.name.trim(),
      type: form.type,
      status: form.status,
      description: toNullable(form.description),
    };
    try {
      if (editorMode === "create") {
        const { error } = await supabase.from("categories").insert([payload]);
        if (error) throw error;
      } else {
        if (!form.id) throw new Error("Missing category id.");
        const { error } = await supabase.from("categories").update(payload).eq("id", form.id);
        if (error) throw error;
      }
      setEditorOpen(false);
      setForm(EMPTY_FORM);
      await refresh();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      setMessage(msg || "Failed to save category.");
    } finally {
      setSubmitting(false);
    }
  }, [configured, editorMode, form, refresh, supabase]);

  const handleDelete = React.useCallback(
    async (row: CategoryRow) => {
      if (!configured || !supabase) {
        setMessage("Supabase is not configured.");
        return;
      }
      if (!window.confirm(`Delete category "${row.name}"?`)) return;
      setDeletingId(row.id);
      setMessage(null);
      let snapshot: CategoryRow[] | undefined;
      setRows((r) => {
        snapshot = r;
        return r.filter((c) => c.id !== row.id);
      });
      try {
        const { error } = await supabase.from("categories").delete().eq("id", row.id);
        if (error) throw error;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        setMessage(msg || "Failed to delete category.");
        if (snapshot) setRows(snapshot);
      } finally {
        setDeletingId(null);
      }
    },
    [configured, supabase]
  );

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Categories"
        subtitle="Manage cost and revenue categories used across the app."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/settings/lists?tab=categories">Open Lists View</Link>
            </Button>
            <Button onClick={openCreate} disabled={submitting || !!deletingId}>
              + New Category
            </Button>
          </div>
        }
      />

      <FilterBar>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search category..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="max-w-[300px]"
          />
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter((event.target.value as "" | "expense" | "income" | "other") ?? "")}
            className="h-10 rounded-[10px] border border-input bg-muted/20 px-3 text-sm"
          >
            <option value="">All types</option>
            <option value="expense">expense</option>
            <option value="income">income</option>
            <option value="other">other</option>
          </select>
        </div>
      </FilterBar>

      {message ? (
        <div className="rounded-lg border border-zinc-200/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground dark:border-border">
          {message}
        </div>
      ) : null}

      {editorOpen ? (
        <Card className="rounded-2xl border border-zinc-200/60 p-4 dark:border-border">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Name</p>
              <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Required" />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Type</p>
              <select
                className="h-10 w-full rounded-[10px] border border-input bg-muted/20 px-3 text-sm"
                value={form.type}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    type: event.target.value === "income" ? "income" : event.target.value === "other" ? "other" : "expense",
                  }))
                }
              >
                <option value="expense">expense</option>
                <option value="income">income</option>
                <option value="other">other</option>
              </select>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Status</p>
              <select
                className="h-10 w-full rounded-[10px] border border-input bg-muted/20 px-3 text-sm"
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value === "inactive" ? "inactive" : "active" }))}
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <p className="text-xs text-muted-foreground">Description</p>
              <Input value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2 border-t border-zinc-200/60 pt-3 dark:border-border">
            <Button onClick={() => void handleSave()} disabled={submitting}>
              {submitting ? "Saving..." : editorMode === "create" ? "Create Category" : "Save Changes"}
            </Button>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={submitting}>
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
                <th className="table-head-label px-4 py-3 text-left">Type</th>
                <th className="table-head-label px-4 py-3 text-left">Description</th>
                <th className="table-head-label px-4 py-3 text-left">Status</th>
                <th className="table-head-label px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                    Loading categories...
                  </td>
                </tr>
              ) : null}
              {filtered.map((row) => (
                <tr key={row.id} className="group border-b border-zinc-100/50 dark:border-border/30">
                  <td className="px-4 py-3 font-medium text-foreground">{row.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.type}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.description || "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="outline" className="h-8 px-3" onClick={() => openEdit(row)}>Edit</Button>
                      <Button variant="outline" className="h-8 px-3" onClick={() => void handleDelete(row)} disabled={deletingId === row.id}>
                        {deletingId === row.id ? "Deleting..." : "Delete"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                    No categories yet.
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
