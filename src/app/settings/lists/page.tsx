"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getExpenseCategories,
  getVendors,
  getPaymentMethods,
  addExpenseCategory,
  addVendor,
  addPaymentMethod,
  renameExpenseCategory,
  renameVendor,
  renamePaymentMethod,
  disableExpenseCategory,
  disableVendor,
  disablePaymentMethod,
  enableExpenseCategory,
  enableVendor,
  enablePaymentMethod,
  deleteExpenseCategory,
  deleteVendor,
  deletePaymentMethod,
  getCategoryUsageCount,
  getVendorUsageCount,
  getPaymentMethodUsageCount,
  isExpenseCategoryDisabled,
  isVendorDisabled,
  isPaymentMethodDisabled,
} from "@/lib/data";
import { Pencil, Ban, Check, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type TabId = "categories" | "vendors" | "paymentMethods";

type ListRow = { name: string; used: number; disabled: boolean };

type ListConfig = {
  getItems: (includeDisabled: boolean) => Promise<string[]>;
  getUsage: (name: string) => Promise<number>;
  isDisabled: (name: string) => Promise<boolean>;
};

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
    config
      .getItems(true)
      .then((names) => {
        if (cancelled) return;
        return Promise.all(
          names.map(async (name) => ({
            name,
            used: await config.getUsage(name),
            disabled: await config.isDisabled(name),
          }))
        );
      })
      .then((rows) => {
        if (!cancelled && rows) setItems(rows);
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
      getItems: (inc) => getVendors(inc),
      getUsage: getVendorUsageCount,
      isDisabled: isVendorDisabled,
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
      const out = await addVendor(v);
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
    else if (tab === "vendors") ok = await renameVendor(state.renameFor, newVal);
    else ok = await renamePaymentMethod(state.renameFor, newVal);
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
      if (currentlyDisabled) await enableVendor(name);
      else await disableVendor(name);
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
    else if (tab === "vendors") ok = await deleteVendor(name);
    else ok = await deletePaymentMethod(name);
    if (ok) await refreshAll();
  };

  const sectionTitle =
    tab === "categories" ? "Expense Categories" : tab === "vendors" ? "Vendors" : "Payment Methods";

  return (
    <div className="mx-auto max-w-[900px] flex flex-col gap-6 p-6">
      <PageHeader
        title="Settings — Lists"
        description="Manage your custom categories, vendors, and payment methods."
      />

      <div className="flex flex-wrap gap-2 border-b border-gray-300 pb-2 dark:border-border">
        {(["categories", "vendors", "paymentMethods"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-sm border px-3 py-1.5 text-sm font-medium capitalize transition-colors",
              tab === t
                ? "border-[#111827]/25 bg-[#F9FAFB] text-text-primary dark:border-border dark:bg-muted/40 dark:text-foreground"
                : "border-gray-300 bg-background text-muted-foreground hover:bg-[#F9FAFB]/60 dark:border-border"
            )}
          >
            {t === "categories"
              ? "Expense categories"
              : t === "vendors"
                ? "Vendors"
                : "Payment methods"}
          </button>
        ))}
      </div>

      <section className="border-b border-gray-300 pb-6 dark:border-border">
        <h2 className="mb-4 text-base font-semibold text-foreground">{sectionTitle}</h2>
        <div className="mb-4 flex flex-wrap gap-3">
          <Input
            placeholder={`Add ${sectionTitle.toLowerCase()}...`}
            value={state.addValue}
            onChange={(e) => state.setAddValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="max-w-[240px] rounded-sm"
          />
          <Button
            size="sm"
            className="rounded-sm"
            onClick={handleAdd}
            disabled={!state.addValue.trim()}
          >
            Add
          </Button>
          <Input
            placeholder="Search..."
            value={state.search}
            onChange={(e) => state.setSearch(e.target.value)}
            className="ml-auto max-w-[200px] rounded-sm"
          />
        </div>
        <div className="overflow-hidden rounded-sm border border-gray-300 dark:border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-300 bg-white dark:border-border dark:bg-muted/30">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Name</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground w-24">
                  Used
                </th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground w-24">
                  Status
                </th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.filtered.map((row) => (
                <tr
                  key={row.name}
                  className="border-b border-gray-300/80 transition-colors hover:bg-[#F9FAFB] dark:border-border/40 dark:hover:bg-muted/20"
                >
                  <td className="py-2.5 px-4">
                    {state.renameFor === row.name ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={state.renameValue}
                          onChange={(e) => state.setRenameValue(e.target.value)}
                          className="h-8 max-w-[200px] rounded-md"
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
                          <Check className="h-4 w-4 text-[#166534]" />
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
                  <td className="py-2.5 px-4 text-right tabular-nums text-muted-foreground">
                    {row.used}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          row.disabled ? "bg-amber-500/90" : "bg-[#166534]/90"
                        )}
                      />
                      {row.disabled ? "Disabled" : "Active"}
                    </span>
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
          </table>
        </div>
      </section>

      <Dialog
        open={!!state.deleteBlocked}
        onOpenChange={(open) => !open && state.setDeleteBlocked(null)}
      >
        <DialogContent className="rounded-sm">
          <DialogHeader>
            <DialogTitle>Cannot delete</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {state.deleteBlocked
              ? `"${state.deleteBlocked.name}" is used by ${state.deleteBlocked.count} record(s). Disable it instead to hide from dropdowns while keeping existing data.`
              : ""}
          </p>
          <div className="flex justify-end pt-2">
            <Button size="sm" className="rounded-sm" onClick={() => state.setDeleteBlocked(null)}>
              OK
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
