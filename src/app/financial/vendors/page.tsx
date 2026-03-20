"use client";

import * as React from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterBar } from "@/components/filter-bar";
import { StatusBadge } from "@/components/status-badge";

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
      const { data, error } = await supabase.from("vendors").select("*").order("created_at", { ascending: false });
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
      const prevRows = rows;
      setRows((r) => r.filter((v) => v.id !== row.id));
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
        setRows(prevRows);
      } finally {
        setDeletingId(null);
      }
    },
    [configured, rows, supabase]
  );

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Vendors"
        subtitle="Manage material and service vendors used by AP bills."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/settings/lists?tab=vendors">Open Lists View</Link>
            </Button>
            <Button onClick={openCreate} disabled={submitting || !!deletingId}>
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
          className="max-w-[360px]"
        />
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
              <p className="text-xs text-muted-foreground">Contact Name</p>
              <Input value={form.contact_name} onChange={(event) => setForm((prev) => ({ ...prev, contact_name: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Phone</p>
              <Input value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Email</p>
              <Input value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <p className="text-xs text-muted-foreground">Address</p>
              <Input value={form.address} onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <p className="text-xs text-muted-foreground">Notes</p>
              <Input value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
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
          </div>
          <div className="mt-4 flex justify-end gap-2 border-t border-zinc-200/60 pt-3 dark:border-border">
            <Button onClick={() => void handleSave()} disabled={submitting}>
              {submitting ? "Saving..." : editorMode === "create" ? "Create Vendor" : "Save Changes"}
            </Button>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={submitting}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="table-responsive">
          <table className="w-full min-w-[560px] text-sm md:min-w-0">
            <thead>
              <tr className="border-b border-zinc-200/40 bg-muted/30 dark:border-border/60">
                <th className="table-head-label px-4 py-3 text-left">Name</th>
                <th className="table-head-label px-4 py-3 text-left">Contact</th>
                <th className="table-head-label px-4 py-3 text-left">Phone</th>
                <th className="table-head-label px-4 py-3 text-left">Email</th>
                <th className="table-head-label px-4 py-3 text-left">Status</th>
                <th className="table-head-label px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>
                    Loading vendors...
                  </td>
                </tr>
              ) : null}
              {filtered.map((row) => (
                <tr key={row.id} className="group border-b border-zinc-100/50 dark:border-border/30">
                  <td className="px-4 py-3 font-medium text-foreground">{row.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.contact_name || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.phone || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.email || "—"}</td>
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
                  <td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>
                    No vendors yet.
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
