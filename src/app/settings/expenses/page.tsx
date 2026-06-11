"use client";

import * as React from "react";
import Link from "next/link";
import {
  EmptyState,
  LoadingState,
  NeoFieldLabel,
  NeoInput,
  NeoModal,
  NeoPanel,
  NeoSelect,
  NeoStatus,
  NeoTable,
  PageHeader,
  PageLayout,
  neoFormNoticeClassName,
} from "@/components/base";
import { SectionHeader } from "@/components/section-header";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Dialog } from "@/components/ui/dialog";
import { tableRawThClass } from "@/components/ui/table";
import { useToast } from "@/components/toast/toast-provider";
import { addExpenseCategory, addPaymentAccount } from "@/lib/data";
import type { ExpenseOptionRow, ExpenseOptionType } from "@/lib/expense-options-db";
import { loadExpenseOptionsAdmin } from "@/lib/expense-options-db";
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

type ExpenseOptionsApiResponse = {
  ok?: boolean;
  rows?: ExpenseOptionRow[];
  row?: ExpenseOptionRow;
  tableMissing?: boolean;
  message?: string;
};

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function fetchExpenseOptions(type: ExpenseOptionType): Promise<ExpenseOptionsApiResponse> {
  const response = await fetch(`/api/settings/expense-options?type=${encodeURIComponent(type)}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const body = await readJson<ExpenseOptionsApiResponse>(response);
  if (!response.ok || !body?.ok) {
    return { ok: false, message: body?.message || "Failed to load expense options." };
  }
  return body;
}

async function createExpenseOption(
  type: ExpenseOptionType,
  name: string
): Promise<ExpenseOptionRow | null> {
  const response = await fetch("/api/settings/expense-options", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ type, name }),
  });
  const body = await readJson<ExpenseOptionsApiResponse>(response);
  if (!response.ok || !body?.ok) return null;
  return body.row ?? null;
}

async function setDefaultExpenseOptionViaApi(
  id: string,
  type: ExpenseOptionType
): Promise<boolean> {
  const response = await fetch("/api/settings/expense-options", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ action: "set-default", id, type }),
  });
  const body = await readJson<ExpenseOptionsApiResponse>(response);
  return response.ok && Boolean(body?.ok);
}

async function renameExpenseOptionViaApi(
  id: string,
  type: ExpenseOptionType,
  name: string
): Promise<{ ok: boolean; message?: string }> {
  const response = await fetch("/api/settings/expense-options", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ action: "rename", id, type, name }),
  });
  const body = await readJson<ExpenseOptionsApiResponse>(response);
  return {
    ok: response.ok && Boolean(body?.ok),
    message: body?.message,
  };
}

async function setExpenseOptionActiveViaApi(
  id: string,
  type: ExpenseOptionType,
  active: boolean
): Promise<{ ok: boolean; message?: string }> {
  const response = await fetch("/api/settings/expense-options", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ action: "set-active", id, type, active }),
  });
  const body = await readJson<ExpenseOptionsApiResponse>(response);
  return {
    ok: response.ok && Boolean(body?.ok),
    message: body?.message,
  };
}

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
      const body = await fetchExpenseOptions(tab);
      if (body.ok) {
        setTableMissing(Boolean(body.tableMissing));
        setRows(body.rows ?? []);
      } else {
        const {
          rows: list,
          tableMissing: missing,
          error: loadErr,
        } = await loadExpenseOptionsAdmin(tab);
        setTableMissing(missing);
        setRows(list);
        toast({
          title: "Expense options",
          description: body.message || loadErr || "Failed to load expense options.",
          variant: "error",
        });
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
      const result = await renameExpenseOptionViaApi(renameRow.id, renameRow.type, next);
      if (!result.ok) {
        toast({
          title: "Rename failed",
          description: result.message,
          variant: "error",
        });
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
    const res = await setExpenseOptionActiveViaApi(r.id, r.type, active);
    if (!res.ok) {
      toast({
        title: active ? "Could not restore" : "Cannot archive",
        description: res.message ?? "Update failed.",
        variant: "error",
      });
      return;
    }
    await refresh();
  };

  const setDefault = async (r: ExpenseOptionRow) => {
    const ok = await setDefaultExpenseOptionViaApi(r.id, r.type);
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
        const out = (await createExpenseOption(tab, trimmed))?.name ?? "";
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
    <PageLayout
      className={cn("py-6", mobileListPagePaddingClass)}
      divider={false}
      header={
        <div className="hidden md:block">
          <PageHeader
            title="Expenses"
            description="Dropdown options for expenses, inbox approval, and quick expense."
          />
        </div>
      }
    >
      <MobileListHeader
        title="Expenses"
        fab={<span className="inline-block h-10 w-10 shrink-0" />}
      />

      <h1 className="sr-only" data-testid="settings-expenses-heading">
        Expense options
      </h1>

      {!configured ? (
        <p className={neoFormNoticeClassName}>
          Supabase is not configured. Set environment keys to manage expense options.
        </p>
      ) : null}

      {configured && tableMissing ? (
        <div className={neoFormNoticeClassName} data-testid="settings-expenses-migration-required">
          The <code className="text-xs">expense_options</code> table was not found. Apply migrations
          to your Supabase database (for example run{" "}
          <code className="text-xs">npm run db:migrate</code> against local, or push{" "}
          <code className="text-xs">supabase/migrations/20260505140000_expense_options.sql</code>).
        </div>
      ) : null}

      <div
        className="flex flex-wrap gap-2 rounded-xl border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] p-2 shadow-[var(--neo-shadow-panel)]"
        data-testid="settings-expenses-tabs"
      >
        {TABS.map((t) => (
          <Button
            key={t.id}
            type="button"
            variant={tab === t.id ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-8 rounded-md",
              tab === t.id && "bg-[var(--neo-gold)] text-zinc-950 hover:bg-[var(--neo-gold-soft)]"
            )}
            data-testid={`settings-expenses-tab-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <div data-testid="settings-expenses-section">
        <NeoPanel bodyClassName="space-y-4 p-4">
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
              <div className="min-w-0 flex-1 space-y-1.5">
                <NeoFieldLabel>Add option</NeoFieldLabel>
                <NeoInput
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
                <div className="w-full space-y-1.5 sm:w-40">
                  <NeoFieldLabel>Type</NeoFieldLabel>
                  <NeoSelect
                    value={addPaType}
                    onChange={(event) => setAddPaType(event.target.value as PaymentAccountType)}
                    className="h-9"
                    data-testid="settings-expenses-add-pa-type"
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="bank">Bank</option>
                  </NeoSelect>
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
            <p className="text-xs text-muted-foreground">
              New sources require a database migration.
            </p>
          )}

          {loading ? (
            <LoadingState text="Loading…" />
          ) : tableMissing ? (
            <EmptyState
              title="Expense options unavailable"
              description="Cannot load options until expense_options exists."
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No options yet"
              description="Add an option to make it available in expense forms."
            />
          ) : (
            <NeoTable tableClassName="min-w-[680px]">
              <thead>
                <tr>
                  <th className={tableRawThClass}>Name</th>
                  <th className={tableRawThClass}>Status</th>
                  <th className={tableRawThClass}>Default</th>
                  <th className={tableRawThClass}>System</th>
                  <th className={tableRawThClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="table-row-compact"
                    data-testid={`settings-expenses-row-${r.id}`}
                  >
                    <td className="px-3 py-2 align-middle font-medium text-[var(--neo-text-primary)]">
                      {r.name}
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <NeoStatus
                        label={r.active ? "Active" : "Archived"}
                        variant={r.active ? "success" : "warning"}
                      />
                    </td>
                    <td className="px-3 py-2 align-middle text-[var(--neo-text-secondary)]">
                      {r.is_default ? "Yes" : "—"}
                    </td>
                    <td className="px-3 py-2 align-middle text-[var(--neo-text-secondary)]">
                      {r.is_system ? "Yes" : "—"}
                    </td>
                    <td className="px-3 py-2 align-middle">
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
                ))}
              </tbody>
            </NeoTable>
          )}

          <p className="text-xs text-muted-foreground">
            <Link href="/settings/company" className="underline-offset-4 hover:underline">
              ← Back to company settings
            </Link>
          </p>
        </NeoPanel>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <NeoModal
          title="Rename"
          className="max-w-sm"
          footer={
            <>
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
            </>
          }
        >
          <NeoInput
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="h-9 rounded-sm"
            data-testid="settings-expenses-rename-input"
          />
        </NeoModal>
      </Dialog>
    </PageLayout>
  );
}
