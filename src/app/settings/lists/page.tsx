"use client";

import * as React from "react";
import {
  EmptyState,
  NeoFieldLabel,
  NeoInput,
  NeoMobileCard,
  NeoModal,
  NeoPanel,
  NeoStatus,
  NeoTable,
  NeoToolbar,
  PageHeader,
  PageLayout,
} from "@/components/base";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { tableRawThClass } from "@/components/ui/table";
import {
  getExpenseCategories,
  getPaymentMethods,
  addExpenseCategory,
  addPaymentMethod,
  renameExpenseCategory,
  renamePaymentMethod,
  disableExpenseCategory,
  disablePaymentMethod,
  enableExpenseCategory,
  enablePaymentMethod,
  deleteExpenseCategory,
  deletePaymentMethod,
  getCategoryUsageCount,
  getPaymentMethodUsageCount,
  isExpenseCategoryDisabled,
  isPaymentMethodDisabled,
} from "@/lib/data";
import { Pencil, Ban, Check, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type TabId = "categories" | "vendors" | "paymentMethods";

type ListRow = { id?: string; name: string; used: number; disabled: boolean };

type ListConfig = {
  getItems: (includeDisabled: boolean) => Promise<string[]>;
  getUsage: (name: string) => Promise<number>;
  isDisabled: (name: string) => Promise<boolean>;
  getRows?: (includeDisabled: boolean) => Promise<ListRow[]>;
};

type VendorApiRow = {
  id: string;
  name: string;
  status?: "active" | "inactive" | null;
  used?: number;
  disabled?: boolean;
};

async function vendorApi<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => null)) as
    | ({ ok?: boolean; message?: string } & T)
    | null;
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.message || "Vendor request failed.");
  }
  return payload as T;
}

async function getVendorRows(includeDisabled: boolean): Promise<ListRow[]> {
  const params = new URLSearchParams({ withUsage: "1" });
  if (includeDisabled) params.set("includeDisabled", "1");
  const payload = await vendorApi<{ vendors: VendorApiRow[] }>(`/api/vendors?${params}`);
  return (payload.vendors ?? []).map((vendor) => ({
    id: vendor.id,
    name: vendor.name,
    used: Number(vendor.used ?? 0),
    disabled: Boolean(vendor.disabled ?? vendor.status === "inactive"),
  }));
}

async function addVendorViaApi(name: string): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) return false;
  await vendorApi<{ vendor: VendorApiRow }>("/api/vendors", {
    method: "POST",
    body: JSON.stringify({ name: trimmed, status: "active" }),
  });
  return true;
}

async function patchVendorViaApi(id: string | undefined, patch: Record<string, unknown>) {
  if (!id) return false;
  await vendorApi<{ vendor: VendorApiRow }>(`/api/vendors/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return true;
}

async function deleteVendorViaApi(id: string | undefined): Promise<boolean> {
  if (!id) return false;
  await vendorApi<{ id: string }>(`/api/vendors/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return true;
}

function useListState(tab: TabId, refresh: number, config: ListConfig) {
  const [search, setSearch] = React.useState("");
  const [addValue, setAddValue] = React.useState("");
  const [renameFor, setRenameFor] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [deleteBlocked, setDeleteBlocked] = React.useState<{ name: string; count: number } | null>(
    null
  );
  const [items, setItems] = React.useState<ListRow[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    const loadRows = config.getRows
      ? config.getRows(true)
      : config.getItems(true).then((names) => {
          if (cancelled) return undefined;
          return Promise.all(
            names.map(async (name) => ({
              name,
              used: await config.getUsage(name),
              disabled: await config.isDisabled(name),
            }))
          );
        });
    loadRows
      .then((rows) => {
        if (!cancelled && rows) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, refresh, config]);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((r) => r.name.toLowerCase().includes(q));
  }, [items, search]);

  return {
    search,
    setSearch,
    addValue,
    setAddValue,
    renameFor,
    setRenameFor,
    renameValue,
    setRenameValue,
    filtered,
    items,
    deleteBlocked,
    setDeleteBlocked,
  };
}

export default function SettingsListsPage() {
  const [tab, setTab] = React.useState<TabId>("categories");
  const [refresh, setRefresh] = React.useState(0);

  const refreshAll = React.useCallback(() => setRefresh((r) => r + 1), []);

  const categoriesConfig = React.useMemo<ListConfig>(
    () => ({
      getItems: (inc) => getExpenseCategories(inc),
      getUsage: getCategoryUsageCount,
      isDisabled: isExpenseCategoryDisabled,
    }),
    []
  );
  const vendorsConfig = React.useMemo<ListConfig>(
    () => ({
      getItems: async () => [],
      getUsage: async () => 0,
      isDisabled: async () => false,
      getRows: getVendorRows,
    }),
    []
  );
  const paymentConfig = React.useMemo<ListConfig>(
    () => ({
      getItems: (inc) => getPaymentMethods(inc),
      getUsage: getPaymentMethodUsageCount,
      isDisabled: isPaymentMethodDisabled,
    }),
    []
  );

  const categoriesState = useListState("categories", refresh, categoriesConfig);
  const vendorsState = useListState("vendors", refresh, vendorsConfig);
  const paymentState = useListState("paymentMethods", refresh, paymentConfig);

  const state =
    tab === "categories" ? categoriesState : tab === "vendors" ? vendorsState : paymentState;

  const handleAdd = async () => {
    const v = state.addValue.trim();
    if (!v) return;
    if (tab === "categories") {
      const out = await addExpenseCategory(v);
      if (out) await refreshAll();
    } else if (tab === "vendors") {
      const out = await addVendorViaApi(v);
      if (out) await refreshAll();
    } else {
      const out = await addPaymentMethod(v);
      if (out) await refreshAll();
    }
    state.setAddValue("");
  };

  const handleRenameSave = async () => {
    const newVal = state.renameValue.trim();
    if (!newVal || !state.renameFor) return;
    let ok = false;
    if (tab === "categories") ok = await renameExpenseCategory(state.renameFor, newVal);
    else if (tab === "vendors") {
      const row = vendorsState.items.find((item) => item.name === state.renameFor);
      ok = await patchVendorViaApi(row?.id, { name: newVal });
    } else ok = await renamePaymentMethod(state.renameFor, newVal);
    if (ok) {
      await refreshAll();
      state.setRenameFor(null);
      state.setRenameValue("");
    }
  };

  const handleDisableEnable = async (name: string, currentlyDisabled: boolean) => {
    if (tab === "categories") {
      if (currentlyDisabled) await enableExpenseCategory(name);
      else await disableExpenseCategory(name);
    } else if (tab === "vendors") {
      const row = vendorsState.items.find((item) => item.name === name);
      await patchVendorViaApi(row?.id, { status: currentlyDisabled ? "active" : "inactive" });
    } else {
      if (currentlyDisabled) await enablePaymentMethod(name);
      else await disablePaymentMethod(name);
    }
    await refreshAll();
  };

  const handleDelete = async (name: string, used: number) => {
    if (used > 0) {
      state.setDeleteBlocked({ name, count: used });
      return;
    }
    let ok = false;
    if (tab === "categories") ok = await deleteExpenseCategory(name);
    else if (tab === "vendors") {
      const row = vendorsState.items.find((item) => item.name === name);
      ok = await deleteVendorViaApi(row?.id);
    } else ok = await deletePaymentMethod(name);
    if (ok) await refreshAll();
  };

  const sectionTitle =
    tab === "categories" ? "Expense Categories" : tab === "vendors" ? "Vendors" : "Payment Methods";

  return (
    <PageLayout
      className="max-w-[960px] py-6"
      divider={false}
      header={
        <PageHeader
          title="Settings — Lists"
          description="Manage your custom categories, vendors, and payment methods."
        />
      }
    >
      <NeoToolbar className="flex-wrap">
        {(["categories", "vendors", "paymentMethods"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "min-h-11 lg:min-h-9 rounded-hh-standard border px-3 py-1.5 text-sm font-medium capitalize transition-colors",
              tab === t
                ? "border-[var(--hh-border-strong)] bg-[var(--hh-l3-selected)] text-[var(--hh-text-primary)]"
                : "border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-secondary)] hover:bg-[var(--hh-l3-hover)] hover:text-[var(--hh-text-primary)]"
            )}
          >
            {t === "categories"
              ? "Expense categories"
              : t === "vendors"
                ? "Vendors"
                : "Payment methods"}
          </button>
        ))}
      </NeoToolbar>

      <NeoPanel
        title={sectionTitle}
        description="Disable values instead of deleting when existing records still reference them."
        bodyClassName="space-y-4 p-4"
      >
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(180px,220px)] md:items-end">
          <div className="space-y-1.5">
            <NeoFieldLabel>Add value</NeoFieldLabel>
            <NeoInput
              placeholder={`Add ${sectionTitle.toLowerCase()}...`}
              value={state.addValue}
              onChange={(e) => state.setAddValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
          </div>
          <Button
            size="sm"
            className="min-h-11 lg:min-h-10"
            onClick={handleAdd}
            disabled={!state.addValue.trim()}
          >
            Add
          </Button>
          <div className="space-y-1.5">
            <NeoFieldLabel>Search</NeoFieldLabel>
            <NeoInput
              placeholder="Search..."
              value={state.search}
              onChange={(e) => state.setSearch(e.target.value)}
            />
          </div>
        </div>

        {state.filtered.length === 0 ? (
          <EmptyState
            title="No list items"
            description="Add a value to make it available in forms."
          />
        ) : (
          <>
            <div data-testid="settings-lists-mobile-records" className="space-y-3 md:hidden">
              {state.filtered.map((row) => (
                <NeoMobileCard key={row.name} className="space-y-3 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-hh-body-strong text-[var(--hh-text-primary)]">
                        {row.name}
                      </p>
                      <p className="text-hh-metadata text-[var(--hh-text-secondary)]">
                        Used by {row.used} record{row.used === 1 ? "" : "s"}
                      </p>
                    </div>
                    <NeoStatus
                      label={row.disabled ? "Disabled" : "Active"}
                      variant={row.disabled ? "warning" : "success"}
                    />
                  </div>
                  {state.renameFor === row.name ? (
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
                      <NeoInput
                        value={state.renameValue}
                        onChange={(e) => state.setRenameValue(e.target.value)}
                        className="min-h-11"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameSave();
                          if (e.key === "Escape") {
                            state.setRenameFor(null);
                            state.setRenameValue("");
                          }
                        }}
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        className="min-h-11 min-w-11"
                        onClick={handleRenameSave}
                        aria-label="Save"
                      >
                        <Check className="h-4 w-4 text-[var(--hh-success)]" />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="min-h-11 min-w-11"
                        onClick={() => {
                          state.setRenameFor(null);
                          state.setRenameValue("");
                        }}
                        aria-label="Cancel"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-11 rounded-hh-standard"
                        onClick={() => {
                          state.setRenameFor(row.name);
                          state.setRenameValue(row.name);
                        }}
                      >
                        Rename
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-11 rounded-hh-standard"
                        onClick={() => handleDisableEnable(row.name, row.disabled)}
                      >
                        {row.disabled ? "Enable" : "Disable"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-11 rounded-hh-standard text-destructive hover:text-destructive"
                        onClick={() => handleDelete(row.name, row.used)}
                      >
                        Delete
                      </Button>
                    </div>
                  )}
                </NeoMobileCard>
              ))}
            </div>
            <NeoTable className="hidden md:block" tableClassName="min-w-[720px]">
              <thead>
                <tr>
                  <th className={tableRawThClass}>Name</th>
                  <th className={cn(tableRawThClass, "w-24 text-right")}>Used</th>
                  <th className={cn(tableRawThClass, "w-28")}>Status</th>
                  <th className={cn(tableRawThClass, "text-right")}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.filtered.map((row) => (
                  <tr key={row.name} className="table-row-compact">
                    <td className="py-2.5 px-4">
                      {state.renameFor === row.name ? (
                        <div className="flex items-center gap-2">
                          <NeoInput
                            value={state.renameValue}
                            onChange={(e) => state.setRenameValue(e.target.value)}
                            className="h-8 max-w-[200px] rounded-hh-compact"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRenameSave();
                              if (e.key === "Escape") {
                                state.setRenameFor(null);
                                state.setRenameValue("");
                              }
                            }}
                          />
                          <Button
                            size="icon"
                            variant="outline"
                            className="btn-outline-ghost h-8 w-8"
                            onClick={handleRenameSave}
                            aria-label="Save"
                          >
                            <Check className="h-4 w-4 text-[var(--hh-success)]" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            className="btn-outline-ghost h-8 w-8"
                            onClick={() => {
                              state.setRenameFor(null);
                              state.setRenameValue("");
                            }}
                            aria-label="Cancel"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <span className="font-medium">{row.name}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-[var(--hh-text-secondary)]">
                      {row.used}
                    </td>
                    <td className="px-4 py-2.5">
                      <NeoStatus
                        label={row.disabled ? "Disabled" : "Active"}
                        variant={row.disabled ? "warning" : "success"}
                      />
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {state.renameFor === row.name ? null : (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="btn-outline-ghost h-8 gap-1"
                            onClick={() => {
                              state.setRenameFor(row.name);
                              state.setRenameValue(row.name);
                            }}
                            aria-label="Rename"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Rename
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="btn-outline-ghost h-8 gap-1"
                            onClick={() => handleDisableEnable(row.name, row.disabled)}
                            aria-label={row.disabled ? "Enable" : "Disable"}
                          >
                            <Ban className="h-3.5 w-3.5" />
                            {row.disabled ? "Enable" : "Disable"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="btn-outline-ghost h-8 gap-1 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(row.name, row.used)}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </NeoTable>
          </>
        )}
      </NeoPanel>

      <Dialog
        open={!!state.deleteBlocked}
        onOpenChange={(open) => !open && state.setDeleteBlocked(null)}
      >
        <NeoModal title="Cannot delete" className="max-w-sm">
          <p className="text-sm text-[var(--hh-text-secondary)]">
            {state.deleteBlocked
              ? `"${state.deleteBlocked.name}" is used by ${state.deleteBlocked.count} record(s). Disable it instead to hide from dropdowns while keeping existing data.`
              : ""}
          </p>
          <div className="flex justify-end pt-2">
            <Button
              size="sm"
              className="rounded-hh-compact"
              onClick={() => state.setDeleteBlocked(null)}
            >
              OK
            </Button>
          </div>
        </NeoModal>
      </Dialog>
    </PageLayout>
  );
}
