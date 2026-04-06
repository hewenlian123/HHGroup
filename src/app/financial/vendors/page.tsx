"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import { FilterBar } from "@/components/filter-bar";
import { Select } from "@/components/ui/native-select";
import { StatusBadge } from "@/components/status-badge";
import { TableShell, tableRawTdClass, tableRawThClass } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";

type VendorRow = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: "active" | "inactive";
  created_at: string;
};

type VendorForm = {
  id?: string;
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  status: "active" | "inactive";
};

const EMPTY_FORM: VendorForm = {
  name: "",
  contact_name: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  status: "active",
};

const toNullable = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export default function VendorsPage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

  const [rows, setRows] = React.useState<VendorRow[]>([]);
  const [query, setQuery] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorMode, setEditorMode] = React.useState<"create" | "edit">("create");
  const [form, setForm] = React.useState<VendorForm>(EMPTY_FORM);
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
        .from("vendors")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRows((data ?? []) as VendorRow[]);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      setRows([]);
      setMessage(msg || "Failed to load vendors.");
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
    if (!q) return rows;
    return rows.filter((row) =>
      [row.name, row.contact_name, row.phone, row.email, row.address]
        .map((value) => (value ?? "").toLowerCase())
        .some((value) => value.includes(q))
    );
  }, [rows, query]);

  const openCreate = () => {
    setEditorMode("create");
    setForm(EMPTY_FORM);
    setEditorOpen(true);
    setMessage(null);
  };

  const openEdit = (row: VendorRow) => {
    setEditorMode("edit");
    setForm({
      id: row.id,
      name: row.name ?? "",
      contact_name: row.contact_name ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      address: row.address ?? "",
      notes: row.notes ?? "",
      status: row.status === "inactive" ? "inactive" : "active",
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
      setMessage("Vendor name is required.");
      return;
    }
    setSubmitting(true);
    setMessage(null);
    const payload = {
      name: form.name.trim(),
      contact_name: toNullable(form.contact_name),
      phone: toNullable(form.phone),
      email: toNullable(form.email),
      address: toNullable(form.address),
      notes: toNullable(form.notes),
      status: form.status,
    };
    try {
      if (editorMode === "create") {
        const { error } = await supabase.from("vendors").insert([payload]);
        if (error) throw error;
      } else {
        if (!form.id) throw new Error("Missing vendor id.");
        const { error } = await supabase.from("vendors").update(payload).eq("id", form.id);
        if (error) throw error;
      }
      setEditorOpen(false);
      setForm(EMPTY_FORM);
      await refresh();
    } catch (error: unknown) {
      const msg =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? String((error as { message: unknown }).message)
            : String(error);
      setMessage(msg || "Failed to save vendor.");
    } finally {
      setSubmitting(false);
    }
  }, [configured, editorMode, form, refresh, supabase]);

  const handleDelete = React.useCallback(
    async (row: VendorRow) => {
      if (!configured || !supabase) {
        setMessage("Supabase is not configured.");
        return;
      }
      if (!window.confirm(`Delete vendor "${row.name}"?`)) return;
      setDeletingId(row.id);
      setMessage(null);
      let snapshot: VendorRow[] | undefined;
      setRows((r) => {
        snapshot = r;
        return r.filter((v) => v.id !== row.id);
      });
      try {
        const { error } = await supabase.from("vendors").delete().eq("id", row.id);
        if (error) throw error;
      } catch (error: unknown) {
        const msg =
          error instanceof Error
            ? error.message
            : typeof error === "object" && error !== null && "message" in error
              ? String((error as { message: unknown }).message)
              : String(error);
        setMessage(msg || "Failed to delete vendor.");
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
        title="Vendors"
        subtitle="Manage material and service vendors used by AP bills."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="rounded-sm">
              <Link href="/settings/lists?tab=vendors">Open Lists View</Link>
            </Button>
            <Button
              size="sm"
              className="rounded-sm"
              onClick={openCreate}
              disabled={submitting || !!deletingId}
            >
              + New Vendor
            </Button>
          </div>
        }
      />

      <FilterBar>
        <Input
          placeholder="Search name, contact, phone, email"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full max-w-none md:max-w-[360px]"
        />
      </FilterBar>

      {message ? (
        <p className="border-b border-gray-100 pb-3 text-sm text-muted-foreground dark:border-border">
          {message}
        </p>
      ) : null}

      {editorOpen ? (
        <section className="border-b border-gray-100 pb-4 dark:border-border">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Name</p>
              <Input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Required"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Contact Name</p>
              <Input
                value={form.contact_name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, contact_name: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Phone</p>
              <Input
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Email</p>
              <Input
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <p className="text-xs text-muted-foreground">Address</p>
              <Input
                value={form.address}
                onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <p className="text-xs text-muted-foreground">Notes</p>
              <Input
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Status</p>
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
          </div>
          <div className="mt-4 flex flex-col-reverse justify-end gap-2 border-t border-gray-100 pt-3 sm:flex-row sm:items-center dark:border-border">
            <Button
              variant="outline"
              size="sm"
              className="rounded-sm"
              onClick={() => setEditorOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="rounded-sm"
              onClick={() => void handleSave()}
              disabled={submitting}
            >
              <SubmitSpinner loading={submitting} className="mr-2" />
              {submitting
                ? "Saving..."
                : editorMode === "create"
                  ? "Create Vendor"
                  : "Save Changes"}
            </Button>
          </div>
        </section>
      ) : null}

      <div className="flex flex-col gap-3 md:hidden">
        {!loading &&
          filtered.map((row) => (
            <div
              key={row.id}
              className="rounded-sm border border-border/60 bg-background p-4 dark:bg-card"
            >
              <p className="font-medium text-foreground">{row.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{row.contact_name || "—"}</p>
              <p className="text-xs text-muted-foreground">{row.phone || "—"}</p>
              <p className="text-xs text-muted-foreground">{row.email || "—"}</p>
              <div className="mt-2">
                <StatusBadge status={row.status} />
              </div>
              <div className="mt-3 flex flex-col gap-2 border-t border-border/40 pt-3 sm:flex-row">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 w-full rounded-sm px-3 sm:h-8 sm:flex-1"
                  onClick={() => openEdit(row)}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 w-full rounded-sm px-3 sm:h-8 sm:flex-1"
                  onClick={() => void handleDelete(row)}
                  disabled={deletingId === row.id}
                >
                  {deletingId === row.id ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </div>
          ))}
        {!loading && filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No vendors yet.</p>
        ) : null}
      </div>

      <TableShell className="hidden md:block">
        <div className="table-responsive overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13px] lg:min-w-0">
            <thead>
              <tr>
                <th className={tableRawThClass}>Name</th>
                <th className={tableRawThClass}>Contact</th>
                <th className={tableRawThClass}>Phone</th>
                <th className={tableRawThClass}>Email</th>
                <th className={tableRawThClass}>Status</th>
                <th className={cn(tableRawThClass, "text-right")}>Actions</th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child>td]:border-b-0">
              {loading ? (
                <tr>
                  <td
                    className={cn(tableRawTdClass, "py-8 text-center text-muted-foreground")}
                    colSpan={6}
                  >
                    Loading vendors...
                  </td>
                </tr>
              ) : null}
              {filtered.map((row) => (
                <tr key={row.id} className={listTableRowStaticClassName}>
                  <td className={cn(tableRawTdClass, "font-medium text-foreground")}>{row.name}</td>
                  <td className={cn(tableRawTdClass, "text-muted-foreground")}>
                    {row.contact_name || "—"}
                  </td>
                  <td className={cn(tableRawTdClass, "text-muted-foreground")}>
                    {row.phone || "—"}
                  </td>
                  <td className={cn(tableRawTdClass, "text-muted-foreground")}>
                    {row.email || "—"}
                  </td>
                  <td className={tableRawTdClass}>
                    <StatusBadge status={row.status} />
                  </td>
                  <td className={tableRawTdClass}>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-sm px-3"
                        onClick={() => openEdit(row)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-sm px-3"
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
                  <td
                    className={cn(tableRawTdClass, "py-8 text-center text-muted-foreground")}
                    colSpan={6}
                  >
                    No vendors yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </TableShell>
    </div>
  );
}
