"use client";

import * as React from "react";
import { createBrowserClient } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterBar } from "@/components/filter-bar";
import { StatusBadge } from "@/components/status-badge";

type CustomerRow = {
  id: string;
  name: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: "active" | "inactive";
  created_at: string;
};

type CustomerForm = {
  id?: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  status: "active" | "inactive";
};

const EMPTY_FORM: CustomerForm = {
  name: "",
  contact_person: "",
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

export default function CustomersPage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

  const [rows, setRows] = React.useState<CustomerRow[]>([]);
  const [query, setQuery] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorMode, setEditorMode] = React.useState<"create" | "edit">("create");
  const [form, setForm] = React.useState<CustomerForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    if (!configured || !supabase) {
      setRows([]);
      setLoading(false);
      setMessage("Supabase is not configured.");
      return;
    }
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRows((data ?? []) as CustomerRow[]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setRows([]);
      setMessage(msg || "Failed to fetch customers.");
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
      [row.name, row.contact_person, row.phone, row.email, row.address]
        .map((v) => (v ?? "").toLowerCase())
        .some((v) => v.includes(q))
    );
  }, [rows, query]);

  const openCreate = React.useCallback(() => {
    setEditorMode("create");
    setForm(EMPTY_FORM);
    setEditorOpen(true);
    setMessage(null);
  }, []);

  const openEdit = React.useCallback((customer: CustomerRow) => {
    setEditorMode("edit");
    setForm({
      id: customer.id,
      name: customer.name ?? "",
      contact_person: customer.contact_person ?? "",
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      address: customer.address ?? "",
      notes: customer.notes ?? "",
      status: customer.status === "inactive" ? "inactive" : "active",
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
    setSubmitting(true);
    setMessage(null);
    try {
      const payload = {
        name: toNullable(form.name),
        contact_person: toNullable(form.contact_person),
        phone: toNullable(form.phone),
        email: toNullable(form.email),
        address: toNullable(form.address),
        notes: toNullable(form.notes),
        status: form.status,
      };

      if (editorMode === "create") {
        const { error } = await supabase.from("customers").insert([payload]);
        if (error) throw error;
      } else {
        if (!form.id) throw new Error("Missing customer id.");
        const { error } = await supabase.from("customers").update(payload).eq("id", form.id);
        if (error) throw error;
      }
      setEditorOpen(false);
      setForm(EMPTY_FORM);
      await refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessage(msg || "Failed to save customer.");
    } finally {
      setSubmitting(false);
    }
  }, [configured, editorMode, form, refresh, supabase]);

  const handleDelete = React.useCallback(
    async (customer: CustomerRow) => {
      if (!configured || !supabase) {
        setMessage("Supabase is not configured.");
        return;
      }
      if (!window.confirm(`Delete customer "${customer.name || "Unnamed"}"?`)) return;

      setDeletingId(customer.id);
      setMessage(null);
      try {
        const { error } = await supabase.from("customers").delete().eq("id", customer.id);
        if (error) throw error;
        await refresh();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setMessage(msg || "Failed to delete customer.");
      } finally {
        setDeletingId(null);
      }
    },
    [configured, refresh, supabase]
  );

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Customers"
        subtitle="Manage customer profiles for projects and billing."
        actions={
          <Button className="rounded-lg" onClick={openCreate} disabled={submitting || !!deletingId}>
            + New Customer
          </Button>
        }
      />

      <FilterBar>
        <Input
          placeholder="Search by name, contact, phone, email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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
              <p className="text-xs text-muted-foreground">Customer Name</p>
              <Input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Optional"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Contact Person</p>
              <Input
                value={form.contact_person}
                onChange={(e) => setForm((prev) => ({ ...prev, contact_person: e.target.value }))}
                placeholder="Optional"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Phone</p>
              <Input
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="Optional"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Email</p>
              <Input
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="Optional"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <p className="text-xs text-muted-foreground">Address</p>
              <Input
                value={form.address}
                onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                placeholder="Optional"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <p className="text-xs text-muted-foreground">Notes</p>
              <Input
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Optional"
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
              {submitting ? "Saving..." : editorMode === "create" ? "Create Customer" : "Save Changes"}
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
                  <td className="py-8 px-4 text-center text-muted-foreground" colSpan={6}>
                    Loading customers...
                  </td>
                </tr>
              ) : null}

              {filtered.map((customer) => (
                <tr
                  key={customer.id}
                  className="group table-row-compact cursor-pointer border-b border-zinc-100/50 dark:border-border/30"
                  onClick={() => openEdit(customer)}
                >
                  <td className="py-3 px-4 font-medium text-foreground">{customer.name || "—"}</td>
                  <td className="py-3 px-4 text-muted-foreground">{customer.contact_person || "—"}</td>
                  <td className="py-3 px-4 text-muted-foreground">{customer.phone || "—"}</td>
                  <td className="py-3 px-4 text-muted-foreground">{customer.email || "—"}</td>
                  <td className="py-3 px-4">
                    <StatusBadge status={customer.status === "inactive" ? "inactive" : "active"} />
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity duration-100 group-hover:opacity-100">
                      <Button
                        variant="outline"
                        className="h-8 px-3"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(customer);
                        }}
                        disabled={submitting || deletingId === customer.id}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        className="h-8 px-3"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDelete(customer);
                        }}
                        disabled={submitting || deletingId === customer.id}
                      >
                        {deletingId === customer.id ? "Deleting..." : "Delete"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && filtered.length === 0 ? (
                <tr>
                  <td className="py-8 px-4 text-center text-muted-foreground" colSpan={6}>
                    No customers found.
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

