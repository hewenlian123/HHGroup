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
} from "@/components/base";
import {
  MobileEmptyState,
  MobileFabButton,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { cn } from "@/lib/utils";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import { Search, UsersRound } from "lucide-react";

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

const subcontractorHeadClass =
  "h-9 px-3 text-left align-middle text-[11px] font-medium uppercase tracking-normal text-[var(--neo-text-tertiary)]";
const subcontractorCellClass =
  "border-b border-[var(--neo-border)] px-3 py-2 align-middle text-[13px]";

function subcontractorDisplayName(
  row: Pick<SubcontractorRow, "display_name" | "legal_name" | "contact_name" | "email">
) {
  return (
    row.display_name?.trim() ||
    row.legal_name?.trim() ||
    row.contact_name?.trim() ||
    row.email?.trim() ||
    "Unnamed subcontractor"
  );
}

function normalizedStatus(status: SubcontractorRow["status"] | null | undefined) {
  return status === "inactive" ? "inactive" : "active";
}

function statusVariant(status: SubcontractorRow["status"] | null | undefined) {
  return normalizedStatus(status) === "active" ? "success" : "muted";
}

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
  const [mobileFiltersOpen, setMobileFiltersOpen] = React.useState(false);

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
      if (statusFilter && normalizedStatus(row.status) !== statusFilter) return false;
      if (!q) return true;
      return [subcontractorDisplayName(row), row.legal_name, row.contact_name, row.phone, row.email]
        .map((v) => (v ?? "").toLowerCase())
        .some((v) => v.includes(q));
    });
  }, [rows, query, statusFilter]);

  const activeMobileFilterCount = statusFilter ? 1 : 0;

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
  }, [configured, editorMode, form, supabase]);

  const handleDelete = React.useCallback(
    async (row: SubcontractorRow) => {
      if (!configured || !supabase) {
        setMessage("Supabase is not configured.");
        return;
      }
      if (!window.confirm(`Delete subcontractor "${subcontractorDisplayName(row)}"?`)) return;
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
    <PageLayout
      divider={false}
      className={cn("dark", mobileListPagePaddingClass, "max-md:!gap-3")}
      header={
        <>
          <div className="hidden md:block">
            <PageHeader
              title="Subcontractors"
              description="Master records for company info, compliance, attachments, and project links."
              actions={
                <Button
                  size="sm"
                  className="rounded-sm"
                  onClick={openCreate}
                  disabled={submitting || !!deletingId}
                >
                  + New Subcontractor
                </Button>
              }
            />
          </div>
          <MobileListHeader
            title="Subcontractors"
            fab={
              <MobileFabButton
                ariaLabel="New subcontractor"
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
              placeholder="Search subcontractors..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 pl-8 text-sm"
              aria-label="Search subcontractors"
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
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter((event.target.value as "" | "active" | "inactive") ?? "")
            }
            className="w-full"
          >
            <option value="">All statuses</option>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </NeoSelect>
        </div>
        <Button
          type="button"
          className="w-full rounded-sm"
          onClick={() => setMobileFiltersOpen(false)}
        >
          Done
        </Button>
      </MobileFilterSheet>

      <NeoToolbar className="hidden justify-between md:flex">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--neo-text-tertiary)]" />
            <NeoInput
              placeholder="Search name, contact, phone, email"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 pl-8 text-sm"
              aria-label="Search subcontractors"
            />
          </div>
          <NeoSelect
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter((event.target.value as "" | "active" | "inactive") ?? "")
            }
            className="h-9 w-[160px] text-sm"
          >
            <option value="">All statuses</option>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </NeoSelect>
        </div>
        <p className="shrink-0 text-xs text-[var(--neo-text-secondary)]">
          Subcontractors:{" "}
          <span className="font-medium text-[var(--neo-text-primary)]">{rows.length}</span>
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
          title={editorMode === "create" ? "New subcontractor" : "Edit subcontractor"}
          description="Keep compliance, tax, and contact details aligned before work starts."
          bodyClassName="p-4"
        >
          <NeoFormGrid>
            <div className="space-y-1">
              <NeoFieldLabel required>Display Name</NeoFieldLabel>
              <NeoInput
                value={form.display_name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, display_name: event.target.value }))
                }
                placeholder="Required"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <NeoFieldLabel>Legal Name</NeoFieldLabel>
              <NeoInput
                value={form.legal_name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, legal_name: event.target.value }))
                }
                placeholder="Optional"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <NeoFieldLabel>Contact Name</NeoFieldLabel>
              <NeoInput
                value={form.contact_name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, contact_name: event.target.value }))
                }
                placeholder="Optional"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <NeoFieldLabel>Phone</NeoFieldLabel>
              <NeoInput
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                placeholder="Optional"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <NeoFieldLabel>Email</NeoFieldLabel>
              <NeoInput
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="Optional"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <NeoFieldLabel>W9 on file</NeoFieldLabel>
              <label className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--neo-border)] bg-[var(--neo-surface-muted)] px-3 text-sm text-[var(--neo-text-primary)]">
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
              <NeoFieldLabel>Insurance Expiration</NeoFieldLabel>
              <NeoInput
                type="date"
                value={form.insurance_expiration}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, insurance_expiration: event.target.value }))
                }
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <NeoFieldLabel>License Number</NeoFieldLabel>
              <NeoInput
                value={form.license_number}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, license_number: event.target.value }))
                }
                placeholder="Optional"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <NeoFieldLabel>Tax ID Last 4</NeoFieldLabel>
              <NeoInput
                value={form.tax_id_last4}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, tax_id_last4: event.target.value }))
                }
                placeholder="Optional"
                disabled={submitting}
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
                disabled={submitting}
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </NeoSelect>
            </div>
            <div className="space-y-1 md:col-span-2">
              <NeoFieldLabel>Address Line 1</NeoFieldLabel>
              <NeoInput
                value={form.address1}
                onChange={(event) => setForm((prev) => ({ ...prev, address1: event.target.value }))}
                placeholder="Optional"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <NeoFieldLabel>Address Line 2</NeoFieldLabel>
              <NeoInput
                value={form.address2}
                onChange={(event) => setForm((prev) => ({ ...prev, address2: event.target.value }))}
                placeholder="Optional"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1">
              <NeoFieldLabel>City</NeoFieldLabel>
              <NeoInput
                value={form.city}
                onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <NeoFieldLabel>State</NeoFieldLabel>
              <NeoInput
                value={form.state}
                onChange={(event) => setForm((prev) => ({ ...prev, state: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <NeoFieldLabel>ZIP</NeoFieldLabel>
              <NeoInput
                value={form.zip}
                onChange={(event) => setForm((prev) => ({ ...prev, zip: event.target.value }))}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <NeoFieldLabel>Notes</NeoFieldLabel>
              <NeoInput
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="Optional"
              />
            </div>
          </NeoFormGrid>
          <NeoActionFooter className="-mx-4 mt-4 px-4 sm:mx-0 sm:px-0">
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
              <SubmitSpinner loading={submitting} className="mr-2" />
              {submitting
                ? "Saving..."
                : editorMode === "create"
                  ? "Create Subcontractor"
                  : "Save Changes"}
            </Button>
          </NeoActionFooter>
        </NeoPanel>
      ) : null}

      <div className="space-y-2 md:hidden">
        {loading ? <LoadingState text="Loading subcontractors..." /> : null}
        {!loading && filtered.length === 0 ? (
          <MobileEmptyState
            icon={<UsersRound className="h-5 w-5" />}
            message="No subcontractors match the current filters."
          />
        ) : null}
        {!loading &&
          filtered.map((row) => {
            const displayName = subcontractorDisplayName(row);
            const status = normalizedStatus(row.status);
            return (
              <NeoMobileCard key={row.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/labor/subcontractors/${row.id}`}
                      className="font-medium text-[var(--neo-text-primary)] underline-offset-2 hover:underline"
                    >
                      {displayName}
                    </Link>
                    <p className="mt-1 text-xs text-[var(--neo-text-secondary)]">
                      {row.contact_name || "No primary contact"}
                    </p>
                    <p className="truncate text-xs text-[var(--neo-text-secondary)]">
                      {row.phone || row.email || "No phone or email"}
                    </p>
                  </div>
                  <NeoStatus label={status} variant={statusVariant(status)} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--neo-text-secondary)]">
                  <div>
                    <dt className="text-[10px] uppercase tracking-normal text-[var(--neo-text-tertiary)]">
                      W9
                    </dt>
                    <dd className="mt-1">
                      <NeoStatus
                        label={row.w9_on_file ? "On file" : "Missing"}
                        variant={row.w9_on_file ? "success" : "warning"}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-normal text-[var(--neo-text-tertiary)]">
                      Insurance
                    </dt>
                    <dd className="mt-1 text-[var(--neo-text-primary)]">
                      {row.insurance_expiration || "—"}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 flex-1 rounded-sm px-3"
                    onClick={() => openEdit(row)}
                    disabled={submitting || deletingId === row.id}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 flex-1 rounded-sm px-3"
                    onClick={() => void handleDelete(row)}
                    disabled={submitting || deletingId === row.id}
                  >
                    {deletingId === row.id ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </NeoMobileCard>
            );
          })}
      </div>

      <NeoTable className="hidden md:block" tableClassName="min-w-[920px] lg:min-w-0">
        <thead>
          <tr>
            <th className={subcontractorHeadClass}>Name</th>
            <th className={subcontractorHeadClass}>Contact</th>
            <th className={subcontractorHeadClass}>Phone</th>
            <th className={subcontractorHeadClass}>Email</th>
            <th className={subcontractorHeadClass}>W9</th>
            <th className={subcontractorHeadClass}>Insurance</th>
            <th className={subcontractorHeadClass}>Status</th>
            <th className={cn(subcontractorHeadClass, "text-right")}>Actions</th>
          </tr>
        </thead>
        <tbody className="[&_tr:last-child>td]:border-b-0">
          {loading ? (
            <tr>
              <td className="px-3 py-6" colSpan={8}>
                <LoadingState text="Loading subcontractors..." />
              </td>
            </tr>
          ) : null}
          {filtered.map((row) => {
            const displayName = subcontractorDisplayName(row);
            const status = normalizedStatus(row.status);
            return (
              <tr key={row.id} className={listTableRowStaticClassName}>
                <td
                  className={cn(
                    subcontractorCellClass,
                    "font-medium text-[var(--neo-text-primary)]"
                  )}
                >
                  <Link
                    href={`/labor/subcontractors/${row.id}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {displayName}
                  </Link>
                </td>
                <td className={cn(subcontractorCellClass, "text-[var(--neo-text-secondary)]")}>
                  {row.contact_name || "—"}
                </td>
                <td className={cn(subcontractorCellClass, "text-[var(--neo-text-secondary)]")}>
                  {row.phone || "—"}
                </td>
                <td className={cn(subcontractorCellClass, "text-[var(--neo-text-secondary)]")}>
                  {row.email || "—"}
                </td>
                <td className={subcontractorCellClass}>
                  <NeoStatus
                    label={row.w9_on_file ? "On file" : "Missing"}
                    variant={row.w9_on_file ? "success" : "warning"}
                  />
                </td>
                <td className={cn(subcontractorCellClass, "text-[var(--neo-text-secondary)]")}>
                  {row.insurance_expiration || "—"}
                </td>
                <td className={subcontractorCellClass}>
                  <NeoStatus label={status} variant={statusVariant(status)} />
                </td>
                <td className={subcontractorCellClass}>
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
            );
          })}
          {!loading && filtered.length === 0 ? (
            <tr>
              <td className="px-3 py-6" colSpan={8}>
                <EmptyState
                  title="No subcontractors"
                  description="Create a subcontractor profile to track compliance and project links."
                />
              </td>
            </tr>
          ) : null}
        </tbody>
      </NeoTable>
    </PageLayout>
  );
}
