"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import {
  EmptyState,
  LoadingState,
  NeoFieldLabel,
  NeoInput,
  NeoMobileCard,
  NeoPanel,
  NeoSelect,
  NeoStatus,
  NeoTable,
  NeoToolbar,
  PageHeader,
  PageLayout,
} from "@/components/base";
import { cn } from "@/lib/utils";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import { Search, Store } from "lucide-react";
import {
  MobileEmptyState,
  MobileFabButton,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";

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

const vendorHeadClass =
  "h-9 px-3 text-left align-middle text-[11px] font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)]";
const vendorCellClass = "border-b border-[var(--neo-border)] px-3 py-2 align-middle text-[13px]";

function vendorStatusVariant(status: VendorRow["status"]) {
  return status === "active" ? "success" : "muted";
}

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
  const [mobileFiltersOpen, setMobileFiltersOpen] = React.useState(false);
  const [mobileStatus, setMobileStatus] = React.useState<"all" | "active" | "inactive">("all");

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

  const mobileRows = React.useMemo(() => {
    if (mobileStatus === "all") return filtered;
    return filtered.filter((row) => row.status === mobileStatus);
  }, [filtered, mobileStatus]);

  const activeMobileFilterCount = mobileStatus !== "all" ? 1 : 0;

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
    <PageLayout
      divider={false}
      className={cn("dark", mobileListPagePaddingClass, "max-md:!gap-3")}
      header={
        <>
          <div className="hidden md:block">
            <PageHeader
              title="Vendors"
              description="Manage material and service vendors used by AP bills."
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
          </div>
          <MobileListHeader
            title="Vendors"
            fab={
              <MobileFabButton
                ariaLabel="New vendor"
                onClick={() => {
                  if (!submitting && !deletingId) openCreate();
                }}
              />
            }
          />
        </>
      }
    >
      <MobileSearchFiltersRow
        filterSheetOpen={mobileFiltersOpen}
        onOpenFilters={() => setMobileFiltersOpen(true)}
        activeFilterCount={activeMobileFilterCount}
        searchSlot={
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--neo-text-tertiary)]" />
            <NeoInput
              placeholder="Search name, contact, phone…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 pl-8 text-sm"
              aria-label="Search vendors"
            />
          </div>
        }
      />
      <MobileFilterSheet
        open={mobileFiltersOpen}
        onOpenChange={setMobileFiltersOpen}
        title="Filters"
      >
        <div className="space-y-2">
          <NeoFieldLabel>Status</NeoFieldLabel>
          <NeoSelect
            value={mobileStatus}
            onChange={(e) => setMobileStatus(e.target.value as "all" | "active" | "inactive")}
            className="w-full"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </NeoSelect>
        </div>
        <Button asChild variant="outline" size="sm" className="h-9 w-full rounded-sm">
          <Link href="/settings/lists?tab=vendors">Lists view</Link>
        </Button>
        <Button
          type="button"
          className="w-full rounded-sm"
          onClick={() => setMobileFiltersOpen(false)}
        >
          Done
        </Button>
      </MobileFilterSheet>

      <NeoToolbar className="hidden justify-between md:flex">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--neo-text-tertiary)]" />
          <NeoInput
            placeholder="Search name, contact, phone, email"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-9 pl-8 text-sm"
            aria-label="Search vendors"
          />
        </div>
        <p className="shrink-0 text-xs text-[var(--neo-text-secondary)]">
          Vendors: <span className="font-medium text-[var(--neo-text-primary)]">{rows.length}</span>
        </p>
      </NeoToolbar>

      {message ? (
        <p
          className="rounded-lg border border-[rgb(184_137_45_/_0.24)] bg-[rgb(184_137_45_/_0.10)] px-3 py-2 text-sm text-[var(--neo-text-secondary)]"
          role="status"
        >
          {message}
        </p>
      ) : null}

      {editorOpen ? (
        <NeoPanel
          title={editorMode === "create" ? "New vendor" : "Edit vendor"}
          description="Keep vendor contact details ready for bills and purchasing."
          bodyClassName="p-4"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <NeoFieldLabel required>Name</NeoFieldLabel>
              <NeoInput
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Required"
              />
            </div>
            <div className="space-y-1">
              <NeoFieldLabel>Contact Name</NeoFieldLabel>
              <NeoInput
                value={form.contact_name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, contact_name: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <NeoFieldLabel>Phone</NeoFieldLabel>
              <NeoInput
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <NeoFieldLabel>Email</NeoFieldLabel>
              <NeoInput
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <NeoFieldLabel>Address</NeoFieldLabel>
              <NeoInput
                value={form.address}
                onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <NeoFieldLabel>Notes</NeoFieldLabel>
              <NeoInput
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
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
          </div>
          <div className="-mx-4 mt-4 flex flex-col-reverse justify-end gap-2 border-t border-[var(--neo-border)] px-4 pt-4 sm:flex-row sm:items-center">
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
        </NeoPanel>
      ) : null}

      <div className="space-y-2 md:hidden">
        {!loading && mobileRows.length === 0 ? (
          <MobileEmptyState
            icon={<Store className="h-5 w-5" />}
            message={filtered.length === 0 ? "No vendors yet." : "No vendors match your filters."}
          />
        ) : null}
        {!loading &&
          mobileRows.map((row) => (
            <NeoMobileCard
              key={row.id}
              className="flex min-h-[84px] flex-col justify-center gap-3 p-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-[var(--neo-text-primary)]">{row.name}</p>
                <p className="text-xs text-[var(--neo-text-secondary)]">
                  {row.contact_name || "—"}
                </p>
                <p className="text-xs text-[var(--neo-text-secondary)]">{row.phone || "—"}</p>
                <p className="truncate text-xs text-[var(--neo-text-secondary)]">
                  {row.email || "—"}
                </p>
                <div className="mt-1">
                  <NeoStatus label={row.status} variant={vendorStatusVariant(row.status)} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 rounded-sm px-3"
                  onClick={() => openEdit(row)}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 rounded-sm px-3"
                  onClick={() => void handleDelete(row)}
                  disabled={deletingId === row.id}
                >
                  {deletingId === row.id ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </NeoMobileCard>
          ))}
        {loading ? <LoadingState text="Loading vendors..." /> : null}
      </div>

      <NeoTable className="hidden md:block" tableClassName="min-w-[760px] lg:min-w-0">
        <thead>
          <tr>
            <th className={vendorHeadClass}>Name</th>
            <th className={vendorHeadClass}>Contact</th>
            <th className={vendorHeadClass}>Phone</th>
            <th className={vendorHeadClass}>Email</th>
            <th className={vendorHeadClass}>Status</th>
            <th className={cn(vendorHeadClass, "text-right")}>Actions</th>
          </tr>
        </thead>
        <tbody className="[&_tr:last-child>td]:border-b-0">
          {loading ? (
            <tr>
              <td className="px-3 py-6" colSpan={6}>
                <LoadingState text="Loading vendors..." />
              </td>
            </tr>
          ) : null}
          {filtered.map((row) => (
            <tr key={row.id} className={listTableRowStaticClassName}>
              <td className={cn(vendorCellClass, "font-medium text-[var(--neo-text-primary)]")}>
                {row.name}
              </td>
              <td className={cn(vendorCellClass, "text-[var(--neo-text-secondary)]")}>
                {row.contact_name || "—"}
              </td>
              <td className={cn(vendorCellClass, "text-[var(--neo-text-secondary)]")}>
                {row.phone || "—"}
              </td>
              <td className={cn(vendorCellClass, "text-[var(--neo-text-secondary)]")}>
                {row.email || "—"}
              </td>
              <td className={vendorCellClass}>
                <NeoStatus label={row.status} variant={vendorStatusVariant(row.status)} />
              </td>
              <td className={vendorCellClass}>
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
              <td className="px-3 py-6" colSpan={6}>
                <EmptyState
                  title="No vendors yet"
                  description="Create a vendor profile to track AP sources."
                />
              </td>
            </tr>
          ) : null}
        </tbody>
      </NeoTable>
    </PageLayout>
  );
}
