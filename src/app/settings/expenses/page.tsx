"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SectionHeader } from "@/components/section-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/toast/toast-provider";
import {
  addExpenseCategory,
  addPaymentAccount,
  addPaymentMethod,
  disableExpenseCategory,
  disablePaymentMethod,
  enableExpenseCategory,
  enablePaymentMethod,
  renameExpenseCategory,
  renamePaymentMethod,
} from "@/lib/data";
import type { ExpenseOptionRow, ExpenseOptionType } from "@/lib/expense-options-db";
import {
  loadExpenseOptionsAdmin,
  renamePaymentAccountOptionDisplay,
  setDefaultExpenseOption,
  setExpenseOptionActive,
  updateExpenseOptionName,
} from "@/lib/expense-options-db";
import type { PaymentAccountType } from "@/lib/payment-accounts-db";
import { cn } from "@/lib/utils";
import {
  MobileListHeader,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";

const TABS: { id: ExpenseOptionType; label: string }[] = [
  { id: "payment_method", label: "Payment methods" },
  { id: "payment_account", label: "Payment accounts" },
  { id: "payment_source", label: "Payment sources" },
  { id: "category", label: "Categories" },
];

export default function SettingsExpensesPage() {
  const { toast } = useToast();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);

  const [tab, setTab] = React.useState<ExpenseOptionType>("payment_method");
  const [rows, setRows] = React.useState<ExpenseOptionRow[]>([]);
  const [tableMissing, setTableMissing] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [addName, setAddName] = React.useState("");
  const [addPaType, setAddPaType] = React.useState<PaymentAccountType>("card");
  const [addBusy, setAddBusy] = React.useState(false);
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [renameRow, setRenameRow] = React.useState<ExpenseOptionRow | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [renameBusy, setRenameBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!configured) {
      setRows([]);
      setTableMissing(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const {
        rows: list,
        tableMissing: missing,
        error: loadErr,
      } = await loadExpenseOptionsAdmin(tab);
      setTableMissing(missing);
      setRows(list);
      if (loadErr) {
        toast({ title: "Expense options", description: loadErr, variant: "error" });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Expense options", description: msg, variant: "error" });
      setRows([]);
      setTableMissing(false);
    } finally {
      setLoading(false);
    }
  }, [configured, tab, toast]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const openRename = (r: ExpenseOptionRow) => {
    setRenameRow(r);
    setRenameValue(r.name);
    setRenameOpen(true);
  };

  const onRenameSave = async () => {
    if (!renameRow) return;
    const next = renameValue.trim();
    if (!next) {
      toast({ title: "Name required", variant: "error" });
      return;
    }
    setRenameBusy(true);
    try {
      let ok = false;
      if (renameRow.type === "payment_account") {
        ok = await renamePaymentAccountOptionDisplay(renameRow.key, next);
      } else if (renameRow.type === "category") {
        ok = await renameExpenseCategory(renameRow.name, next);
      } else if (renameRow.type === "payment_method") {
        ok = await renamePaymentMethod(renameRow.name, next);
      } else {
        ok = await updateExpenseOptionName(renameRow.id, next);
      }
      if (!ok) {
        toast({ title: "Rename failed", variant: "error" });
        return;
      }
      toast({ title: "Saved", variant: "success" });
      setRenameOpen(false);
      setRenameRow(null);
      await refresh();
    } finally {
      setRenameBusy(false);
    }
  };

  const toggleArchive = async (r: ExpenseOptionRow, active: boolean) => {
    if (!active && r.type === "payment_source" && r.is_system) {
      toast({
        title: "Cannot archive",
        description: "System payment sources cannot be archived.",
        variant: "default",
      });
      return;
    }
    if (r.type === "category") {
      const ok = active
        ? await enableExpenseCategory(r.name)
        : await disableExpenseCategory(r.name);
      if (!ok) {
        toast({ title: "Update failed", variant: "error" });
        return;
      }
    } else if (r.type === "payment_method") {
      const ok = active ? await enablePaymentMethod(r.name) : await disablePaymentMethod(r.name);
      if (!ok) {
        toast({ title: "Update failed", variant: "error" });
        return;
      }
    } else {
      const res = await setExpenseOptionActive(r.id, active);
      if (!res.ok) {
        toast({
          title: "Cannot update",
          description: res.reason ?? "Update failed.",
          variant: "error",
        });
        return;
      }
    }
    await refresh();
  };

  const setDefault = async (r: ExpenseOptionRow) => {
    const ok = await setDefaultExpenseOption(r.id, r.type);
    if (!ok) {
      toast({ title: "Could not set default", variant: "error" });
      return;
    }
    await refresh();
  };

  const onAdd = async () => {
    const trimmed = addName.trim();
    if (!trimmed) return;
    setAddBusy(true);
    try {
      if (tab === "category") {
        const out = await addExpenseCategory(trimmed);
        if (!out) {
          toast({ title: "Could not add category", variant: "error" });
          return;
        }
      } else if (tab === "payment_method") {
        const out = await addPaymentMethod(trimmed);
        if (!out) {
          toast({ title: "Could not add payment method", variant: "error" });
          return;
        }
      } else if (tab === "payment_account") {
        const row = await addPaymentAccount(trimmed, addPaType);
        if (!row) {
          toast({ title: "Could not add account", variant: "error" });
          return;
        }
      } else {
        return;
      }
      setAddName("");
      toast({ title: "Added", variant: "success" });
      await refresh();
    } finally {
      setAddBusy(false);
    }
  };

  return (
    <div className={cn("page-container page-stack py-6", mobileListPagePaddingClass)}>
      <div className="hidden md:block">
        <PageHeader
          title="Expenses"
          subtitle="Dropdown options for expenses, inbox approval, and quick expense."
        />
      </div>
      <MobileListHeader
        title="Expenses"
        fab={<span className="inline-block h-10 w-10 shrink-0" />}
      />

      <h1 className="sr-only" data-testid="settings-expenses-heading">
        Expense options
      </h1>

      {!configured ? (
        <p className="text-sm text-muted-foreground">
          Supabase is not configured. Set environment keys to manage expense options.
        </p>
      ) : null}

      {configured && tableMissing ? (
        <div
          className="border-b border-border/60 pb-3 text-sm text-muted-foreground"
          data-testid="settings-expenses-migration-required"
        >
          The <code className="text-xs">expense_options</code> table was not found. Apply migrations
          to your Supabase database (for example run{" "}
          <code className="text-xs">npm run db:migrate</code> against local, or push{" "}
          <code className="text-xs">supabase/migrations/20260505140000_expense_options.sql</code>).
        </div>
      ) : null}

      <div
        className="flex flex-wrap gap-2 border-b border-border/60 pb-3"
        data-testid="settings-expenses-tabs"
      >
        {TABS.map((t) => (
          <Button
            key={t.id}
            type="button"
            variant={tab === t.id ? "default" : "outline"}
            size="sm"
            className="h-8 rounded-sm"
            data-testid={`settings-expenses-tab-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <section className="space-y-3" data-testid="settings-expenses-section">
        <SectionHeader
          title="Options"
          subtitle="Archive hides an option from new entries; existing data keeps the value."
        />
        {tab === "payment_source" ? (
          <p className="text-xs text-muted-foreground">
            Sources map to how an expense was created. System sources cannot be archived.
          </p>
        ) : null}

        {tab !== "payment_source" && !tableMissing ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-1">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">
                Add option
              </label>
              <Input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Name"
                className="h-9 rounded-sm"
                data-testid="settings-expenses-add-name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void onAdd();
                }}
              />
            </div>
            {tab === "payment_account" ? (
              <div className="w-full space-y-1 sm:w-40">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Type
                </label>
                <Select
                  value={addPaType}
                  onValueChange={(v) => setAddPaType(v as PaymentAccountType)}
                >
                  <SelectTrigger
                    className="h-9 rounded-sm"
                    data-testid="settings-expenses-add-pa-type"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <Button
              type="button"
              size="sm"
              className="h-9 rounded-sm"
              disabled={addBusy || !addName.trim()}
              data-testid="settings-expenses-add-submit"
              onClick={() => void onAdd()}
            >
              <SubmitSpinner loading={addBusy} className="mr-2" />
              Add
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">New sources require a database migration.</p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Default</th>
                <th className="py-2 pr-3 font-medium">System</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-6 text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : tableMissing ? (
                <tr>
                  <td colSpan={5} className="py-6 text-muted-foreground">
                    Cannot load options until <code className="text-xs">expense_options</code>{" "}
                    exists.
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-muted-foreground">
                    No options yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/60 table-row-compact"
                    data-testid={`settings-expenses-row-${r.id}`}
                  >
                    <td className="py-2 pr-3 align-middle">{r.name}</td>
                    <td className="py-2 pr-3 align-middle">{r.active ? "Active" : "Archived"}</td>
                    <td className="py-2 pr-3 align-middle">{r.is_default ? "Yes" : "—"}</td>
                    <td className="py-2 pr-3 align-middle">{r.is_system ? "Yes" : "—"}</td>
                    <td className="py-2 align-middle">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 rounded-sm px-2 text-xs"
                          data-testid={`settings-expenses-rename-${r.id}`}
                          onClick={() => openRename(r)}
                        >
                          Rename
                        </Button>
                        {r.active ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 rounded-sm px-2 text-xs"
                            data-testid={`settings-expenses-archive-${r.id}`}
                            onClick={() => void toggleArchive(r, false)}
                          >
                            Archive
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 rounded-sm px-2 text-xs"
                            data-testid={`settings-expenses-restore-${r.id}`}
                            onClick={() => void toggleArchive(r, true)}
                          >
                            Restore
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 rounded-sm px-2 text-xs"
                          data-testid={`settings-expenses-default-${r.id}`}
                          disabled={!r.active}
                          onClick={() => void setDefault(r)}
                        >
                          Set default
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground">
          <Link href="/settings/company" className="underline-offset-4 hover:underline">
            ← Back to company settings
          </Link>
        </p>
      </section>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-sm rounded-sm border-border/60">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">Rename</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="h-9 rounded-sm"
            data-testid="settings-expenses-rename-input"
          />
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-sm"
              onClick={() => setRenameOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-sm"
              disabled={renameBusy}
              data-testid="settings-expenses-rename-save"
              onClick={() => void onRenameSave()}
            >
              {renameBusy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
