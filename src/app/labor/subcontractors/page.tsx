"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { FilterBar } from "@/components/filter-bar";
import { StatusBadge } from "@/components/status-badge";
import { TableShell, tableRawTdClass, tableRawThClass } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";

type SubcontractorRow = {
  id: string;
  display_name: string;
  legal_name: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  tax_id_last4: string | null;
  w9_on_file: boolean;
  insurance_expiration: string | null;
  license_number: string | null;
  notes: string | null;
  status: "active" | "inactive";
  created_at: string;
};

type SubcontractorForm = {
  id?: string;
  display_name: string;
  legal_name: string;
  contact_name: string;
  phone: string;
  email: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  tax_id_last4: string;
  w9_on_file: boolean;
  insurance_expiration: string;
  license_number: string;
  notes: string;
  status: "active" | "inactive";
};

const EMPTY_FORM: SubcontractorForm = {
  display_name: "",
  legal_name: "",
  contact_name: "",
  phone: "",
  email: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  zip: "",
  tax_id_last4: "",
  w9_on_file: false,
  insurance_expiration: "",
  license_number: "",
  notes: "",
  status: "active",
};

const toNullable = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export default function SubcontractorsPage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

  const [rows, setRows] = React.useState<SubcontractorRow[]>([]);
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"" | "active" | "inactive">("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorMode, setEditorMode] = React.useState<"create" | "edit">("create");
  const [form, setForm] = React.useState<SubcontractorForm>(EMPTY_FORM);
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
        .from("subcontractors")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRows((data ?? []) as SubcontractorRow[]);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      setRows([]);
      setMessage(msg || "Failed to load subcontractors.");
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
      if (statusFilter && row.status !== statusFilter) return false;
      if (!q) return true;
      return [row.display_name, row.legal_name, row.contact_name, row.phone, row.email]
        .map((v) => (v ?? "").toLowerCase())
        .some((v) => v.includes(q));
    });
  }, [rows, query, statusFilter]);

  const openCreate = React.useCallback(() => {
    setEditorMode("create");
    setForm(EMPTY_FORM);
    setEditorOpen(true);
    setMessage(null);
  }, []);

  const openEdit = React.useCallback((row: SubcontractorRow) => {
    setEditorMode("edit");
    setForm({
      id: row.id,
      display_name: row.display_name ?? "",
      legal_name: row.legal_name ?? "",
      contact_name: row.contact_name ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      address1: row.address1 ?? "",
      address2: row.address2 ?? "",
      city: row.city ?? "",
      state: row.state ?? "",
      zip: row.zip ?? "",
      tax_id_last4: row.tax_id_last4 ?? "",
      w9_on_file: row.w9_on_file ?? false,
      insurance_expiration: row.insurance_expiration ?? "",
      license_number: row.license_number ?? "",
      notes: row.notes ?? "",
      status: row.status === "inactive" ? "inactive" : "active",
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
    if (!form.display_name.trim()) {
      setMessage("Display name is required.");
      return;
    }
    setSubmitting(true);
    setMessage(null);
    const payload = {
      display_name: form.display_name.trim(),
      legal_name: toNullable(form.legal_name),
      contact_name: toNullable(form.contact_name),
      phone: toNullable(form.phone),
      email: toNullable(form.email),
      address1: toNullable(form.address1),
      address2: toNullable(form.address2),
      city: toNullable(form.city),
      state: toNullable(form.state),
      zip: toNullable(form.zip),
      tax_id_last4: toNullable(form.tax_id_last4),
      w9_on_file: form.w9_on_file,
      insurance_expiration: form.insurance_expiration || null,
      license_number: toNullable(form.license_number),
      notes: toNullable(form.notes),
      status: form.status,
    };
    try {
      if (editorMode === "create") {
        const { data, error } = await supabase
          .from("subcontractors")
          .insert([payload])
          .select("*")
          .single();
        if (error) throw error;
        if (data) {
          setRows((prev) => [data as SubcontractorRow, ...prev]);
        }
      } else {
        if (!form.id) throw new Error("Missing subcontractor id.");
        const { data, error } = await supabase
          .from("subcontractors")
          .update(payload)
          .eq("id", form.id)
          .select("*")
          .single();
        if (error) throw error;
        if (data) {
          setRows((prev) =>
            prev.map((row) => (row.id === form.id ? (data as SubcontractorRow) : row))
          );
        }
      }
      setEditorOpen(false);
      setForm(EMPTY_FORM);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      setMessage(msg || "Failed to save subcontractor.");
    } finally {
      setSubmitting(false);
    }
  }, [configured, editorMode, form, refresh, supabase]);

  const handleDelete = React.useCallback(
    async (row: SubcontractorRow) => {
      if (!configured || !supabase) {
        setMessage("Supabase is not configured.");
        return;
      }
      if (!window.confirm(`Delete subcontractor "${row.display_name}"?`)) return;
      setDeletingId(row.id);
      setMessage(null);
      const prevRows = rows;
      setRows((r) => r.filter((s) => s.id !== row.id));
      try {
        const { error } = await supabase.from("subcontractors").delete().eq("id", row.id);
        if (error) throw error;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        setMessage(msg || "Failed to delete subcontractor.");
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
        title="Subcontractors"
        subtitle="Master data: company info, compliance, and attachments. (Contracts & billing are under Subcontractors.)"
        actions={
          <Button className="rounded-lg" onClick={openCreate} disabled={submitting || !!deletingId}>
            + New Subcontractor
          </Button>
        }
      />

      <FilterBar>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search name, contact, phone, email"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="max-w-[360px]"
          />
          <Select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter((event.target.value as "" | "active" | "inactive") ?? "")
            }
          >
            <option value="">All statuses</option>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </Select>
        </div>
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
              <p className="text-xs text-muted-foreground">Display Name</p>
              <Input
                value={form.display_name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, display_name: event.target.value }))
                }
                placeholder="Required"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Legal Name</p>
              <Input
                value={form.legal_name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, legal_name: event.target.value }))
                }
                placeholder="Optional"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Contact Name</p>
              <Input
                value={form.contact_name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, contact_name: event.target.value }))
                }
                placeholder="Optional"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Phone</p>
              <Input
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                placeholder="Optional"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Email</p>
              <Input
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="Optional"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">W9 on file</p>
              <label className="inline-flex items-center gap-2 rounded-[10px] border border-input bg-muted/20 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.w9_on_file}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, w9_on_file: event.target.checked }))
                  }
                  disabled={submitting}
                />
                Yes
              </label>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Insurance Expiration</p>
              <Input
                type="date"
                value={form.insurance_expiration}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, insurance_expiration: event.target.value }))
                }
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">License Number</p>
              <Input
                value={form.license_number}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, license_number: event.target.value }))
                }
                placeholder="Optional"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Tax ID Last 4</p>
              <Input
                value={form.tax_id_last4}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, tax_id_last4: event.target.value }))
                }
                placeholder="Optional"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
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
                disabled={submitting}
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <p className="text-xs text-muted-foreground">Address Line 1</p>
              <Input
                value={form.address1}
                onChange={(event) => setForm((prev) => ({ ...prev, address1: event.target.value }))}
                placeholder="Optional"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <p className="text-xs text-muted-foreground">Address Line 2</p>
              <Input
                value={form.address2}
                onChange={(event) => setForm((prev) => ({ ...prev, address2: event.target.value }))}
                placeholder="Optional"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">City</p>
              <Input
                value={form.city}
                onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">State</p>
              <Input
                value={form.state}
                onChange={(event) => setForm((prev) => ({ ...prev, state: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">ZIP</p>
              <Input
                value={form.zip}
                onChange={(event) => setForm((prev) => ({ ...prev, zip: event.target.value }))}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <p className="text-xs text-muted-foreground">Notes</p>
              <Input
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="mt-4 flex flex-col-reverse justify-end gap-2 border-t border-gray-100 pt-3 sm:flex-row sm:items-center dark:border-border">
            <Button
              variant="outline"
              size="sm"
              className="rounded-sm"
              onClick={closeEditor}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button size="sm" className="rounded-sm" onClick={handleSave} disabled={submitting}>
              {submitting
                ? "Saving..."
                : editorMode === "create"
                  ? "Create Subcontractor"
                  : "Save Changes"}
            </Button>
          </div>
        </section>
      ) : null}

      <TableShell>
        <div className="table-responsive">
          <table className="w-full min-w-[640px] border-collapse text-[13px] md:min-w-0">
            <thead>
              <tr>
                <th className={tableRawThClass}>Name</th>
                <th className={tableRawThClass}>Contact</th>
                <th className={tableRawThClass}>Phone</th>
                <th className={tableRawThClass}>Email</th>
                <th className={tableRawThClass}>W9</th>
                <th className={tableRawThClass}>Insurance</th>
                <th className={tableRawThClass}>Status</th>
                <th className={cn(tableRawThClass, "text-right")}>Actions</th>
              </tr>
            </thead>
            <tbody className="[&_tr:last-child>td]:border-b-0">
              {loading ? (
                <tr>
                  <td
                    className={cn(tableRawTdClass, "py-8 text-center text-muted-foreground")}
                    colSpan={8}
                  >
                    Loading subcontractors...
                  </td>
                </tr>
              ) : null}
              {filtered.map((row) => (
                <tr key={row.id} className={listTableRowStaticClassName}>
                  <td className={cn(tableRawTdClass, "font-medium text-foreground")}>
                    <Link href={`/labor/subcontractors/${row.id}`} className="hover:underline">
                      {row.display_name}
                    </Link>
                  </td>
                  <td className={cn(tableRawTdClass, "text-muted-foreground")}>
                    {row.contact_name || "—"}
                  </td>
                  <td className={cn(tableRawTdClass, "text-muted-foreground")}>
                    {row.phone || "—"}
                  </td>
                  <td className={cn(tableRawTdClass, "text-muted-foreground")}>
                    {row.email || "—"}
                  </td>
                  <td className={cn(tableRawTdClass, "text-muted-foreground")}>
                    {row.w9_on_file ? "On file" : "Missing"}
                  </td>
                  <td className={cn(tableRawTdClass, "text-muted-foreground")}>
                    {row.insurance_expiration || "—"}
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
                        disabled={submitting || deletingId === row.id}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-sm px-3"
                        onClick={() => void handleDelete(row)}
                        disabled={submitting || deletingId === row.id}
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
                    colSpan={8}
                  >
                    No subcontractors yet.
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
