"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { FilterBar } from "@/components/filter-bar";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { listTablePrimaryCellClassName, listTableRowClassName } from "@/lib/list-table-interaction";

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
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("created_at", { ascending: false });
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
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/lists?tab=categories">Open Lists View</Link>
            </Button>
            <Button size="sm" onClick={openCreate} disabled={submitting || !!deletingId}>
              + New Category
            </Button>
          </div>
        }
      />

      <FilterBar>
        <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1 sm:col-span-2 lg:col-span-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
              Search
            </p>
            <Input
              placeholder="Category name or description…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
              Type
            </p>
            <Select
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter((event.target.value as "" | "expense" | "income" | "other") ?? "")
              }
            >
              <option value="">All types</option>
              <option value="expense">expense</option>
              <option value="income">income</option>
              <option value="other">other</option>
            </Select>
          </div>
        </div>
      </FilterBar>

      {message ? (
        <div className="rounded-lg border border-gray-100 bg-background px-3 py-2 text-sm text-muted-foreground dark:border-border">
          {message}
        </div>
      ) : null}

      {editorOpen ? (
        <Card className="border-gray-100 p-4 dark:border-border">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                Name
              </p>
              <Input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Required"
              />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                Type
              </p>
              <Select
                value={form.type}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    type:
                      event.target.value === "income"
                        ? "income"
                        : event.target.value === "other"
                          ? "other"
                          : "expense",
                  }))
                }
              >
                <option value="expense">expense</option>
                <option value="income">income</option>
                <option value="other">other</option>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                Status
              </p>
              <Select
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    status: event.target.value === "inactive" ? "inactive" : "active",
                  }))
                }
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                Description
              </p>
              <Input
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2 border-t border-border/60 pt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditorOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={submitting}>
              <SubmitSpinner loading={submitting} className="mr-2" />
              {submitting
                ? "Saving..."
                : editorMode === "create"
                  ? "Create Category"
                  : "Save Changes"}
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-white dark:border-border/60 dark:bg-muted/30">
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
                <tr
                  key={row.id}
                  className={cn(
                    listTableRowClassName,
                    "group border-b border-gray-100/80 dark:border-border/30"
                  )}
                  onClick={() => openEdit(row)}
                >
                  <td
                    className={cn(
                      "px-4 py-3 font-medium text-foreground",
                      listTablePrimaryCellClassName,
                      "hover:underline"
                    )}
                  >
                    {row.name}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.type}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.description || "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-3"
                        onClick={() => openEdit(row)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-3"
                        onClick={() => void handleDelete(row)}
                        disabled={deletingId === row.id}
                      >
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
