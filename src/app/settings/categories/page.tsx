"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import {
  EmptyState,
  LoadingState,
  NeoActionFooter,
  NeoFieldLabel,
  NeoFormGrid,
  NeoInput,
  NeoMobileCard,
  NeoPanel,
  NeoSelect,
  NeoStatus,
  NeoTable,
  NeoToolbar,
  PageHeader,
  PageLayout,
  neoFormNoticeClassName,
} from "@/components/base";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { tableRawThClass } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { listTableRowClassName } from "@/lib/list-table-interaction";

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
    <PageLayout
      className="py-6"
      divider={false}
      header={
        <PageHeader
          title="Categories"
          description="Manage cost and revenue categories used across the app."
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
      }
    >
      <NeoToolbar>
        <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
            <NeoFieldLabel>Search</NeoFieldLabel>
            <NeoInput
              placeholder="Category name or description…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <NeoFieldLabel>Type</NeoFieldLabel>
            <NeoSelect
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter((event.target.value as "" | "expense" | "income" | "other") ?? "")
              }
            >
              <option value="">All types</option>
              <option value="expense">expense</option>
              <option value="income">income</option>
              <option value="other">other</option>
            </NeoSelect>
          </div>
        </div>
      </NeoToolbar>

      {message ? <div className={neoFormNoticeClassName}>{message}</div> : null}

      {editorOpen ? (
        <NeoPanel bodyClassName="p-4">
          <NeoFormGrid>
            <div className="space-y-1.5">
              <NeoFieldLabel>Name</NeoFieldLabel>
              <NeoInput
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Required"
              />
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel>Type</NeoFieldLabel>
              <NeoSelect
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
              </NeoSelect>
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel>Status</NeoFieldLabel>
              <NeoSelect
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
              </NeoSelect>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <NeoFieldLabel>Description</NeoFieldLabel>
              <NeoInput
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
              />
            </div>
          </NeoFormGrid>
          <NeoActionFooter className="static -mx-4 mb-[-1rem] px-4 sm:px-4">
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
          </NeoActionFooter>
        </NeoPanel>
      ) : null}

      {loading ? <LoadingState text="Loading categories..." /> : null}

      {!loading && filtered.length === 0 ? (
        <EmptyState
          title="No categories yet"
          description="Create a category to organize settings data."
        />
      ) : null}

      {!loading && filtered.length > 0 ? (
        <>
          <div className="space-y-2 md:hidden">
            {filtered.map((row) => (
              <NeoMobileCard key={row.id} className="space-y-3 p-3">
                <button
                  type="button"
                  className="block w-full min-w-0 text-left"
                  onClick={() => openEdit(row)}
                >
                  <p className="truncate text-sm font-medium text-[var(--neo-text-primary)]">
                    {row.name}
                  </p>
                  <p className="text-xs text-[var(--neo-text-secondary)]">
                    {row.type} · {row.description || "No description"}
                  </p>
                </button>
                <div className="flex items-center justify-between gap-2">
                  <NeoStatus
                    label={row.status}
                    variant={row.status === "active" ? "success" : "muted"}
                  />
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="btn-outline-destructive"
                      onClick={() => void handleDelete(row)}
                      disabled={deletingId === row.id}
                    >
                      {deletingId === row.id ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </div>
              </NeoMobileCard>
            ))}
          </div>

          <NeoTable className="hidden md:block" tableClassName="min-w-[760px]">
            <thead>
              <tr>
                <th className={tableRawThClass}>Name</th>
                <th className={tableRawThClass}>Type</th>
                <th className={tableRawThClass}>Description</th>
                <th className={tableRawThClass}>Status</th>
                <th className={cn(tableRawThClass, "text-right")}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  className={cn(listTableRowClassName, "group")}
                  onClick={() => openEdit(row)}
                >
                  <td className="px-3 py-2 font-medium text-[var(--neo-text-primary)] hover:underline">
                    {row.name}
                  </td>
                  <td className="px-3 py-2 text-[var(--neo-text-secondary)]">{row.type}</td>
                  <td className="px-3 py-2 text-[var(--neo-text-secondary)]">
                    {row.description || "—"}
                  </td>
                  <td className="px-3 py-2">
                    <NeoStatus
                      label={row.status}
                      variant={row.status === "active" ? "success" : "muted"}
                    />
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
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
                        className="btn-outline-destructive h-8 px-3"
                        onClick={() => void handleDelete(row)}
                        disabled={deletingId === row.id}
                      >
                        {deletingId === row.id ? "Deleting..." : "Delete"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </NeoTable>
        </>
      ) : null}
    </PageLayout>
  );
}
