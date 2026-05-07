"use client";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import * as React from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { type Account, type AccountType } from "@/lib/data";
import {
  createAccountAction,
  deleteAccountAction,
  getAccountsAction,
  updateAccountAction,
} from "./actions";
import { Banknote, CreditCard, Landmark, MoreHorizontal, Plus, Search, Wallet } from "lucide-react";
import {
  MobileFabButton,
  MobileListHeader,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/toast/toast-provider";
import { EmptyState } from "@/components/empty-state";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
import { ConfirmDialog } from "@/components/base";
import { formatInteger } from "@/lib/formatters";

const ACCOUNT_TYPES: AccountType[] = ["Credit Card", "Debit Card", "Bank", "Cash", "Other"];

const accountsShell =
  "rounded-xl border border-zinc-200/70 bg-white shadow-[0_1px_0_rgba(0,0,0,0.04),0_4px_24px_rgba(0,0,0,0.045)] dark:border-border/50 dark:bg-card/80 dark:shadow-none md:rounded-2xl";

const kpiTile =
  "rounded-xl border border-zinc-200/40 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.028),0_1px_12px_rgba(0,0,0,0.028)] dark:border-border/35 dark:bg-card/80 dark:shadow-none";

const kpiIcon =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100/45 text-zinc-400 dark:bg-muted/45 dark:text-muted-foreground";

function typeChipClass(t: AccountType): string {
  if (t === "Bank") return "bg-slate-100 text-slate-700 ring-1 ring-slate-200/70";
  if (t === "Cash") return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/60";
  if (t === "Credit Card" || t === "Debit Card")
    return "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200/60";
  return "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200/60";
}

function AccountTypeIcon({ type }: { type: AccountType }) {
  const cls = "h-4 w-4";
  if (type === "Bank") return <Landmark className={cls} aria-hidden />;
  if (type === "Cash") return <Wallet className={cls} aria-hidden />;
  if (type === "Credit Card" || type === "Debit Card")
    return <CreditCard className={cls} aria-hidden />;
  return <Banknote className={cls} aria-hidden />;
}

export default function AccountsPage() {
  return (
    <React.Suspense fallback={<div className="page-container py-6" />}>
      <AccountsPageInner />
    </React.Suspense>
  );
}

function AccountsPageInner() {
  const router = useRouter();
  const { toast } = useToast();
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<AccountType>("Credit Card");
  const [lastFour, setLastFour] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const nameInputRef = React.useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<"" | AccountType>("");
  const [deleteTarget, setDeleteTarget] = React.useState<Account | null>(null);

  const load = React.useCallback(async () => {
    const res = await getAccountsAction();
    if (res.error) {
      // Keep the page functional even if auth is missing.
      setAccounts([]);
      return;
    }
    setAccounts(
      res.accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type as AccountType,
        lastFour: a.lastFour,
        notes: a.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }))
    );
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  const openModal = () => {
    setName("");
    setType("Credit Card");
    setLastFour("");
    setNotes("");
    setEditingId(null);
    setModalOpen(true);
  };

  const openEdit = (acc: Account) => {
    setName(acc.name ?? "");
    setType((acc.type as AccountType) ?? "Other");
    setLastFour(acc.lastFour ?? "");
    setNotes(acc.notes ?? "");
    setEditingId(acc.id);
    setModalOpen(true);
    // focus on next tick
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const handleDelete = async (acc: Account) => {
    const prev = accounts;
    setAccounts((p) => p.filter((a) => a.id !== acc.id));
    const res = await deleteAccountAction(acc.id);
    if (!res.ok) {
      setAccounts(prev);
      toast({ title: "Failed to delete account", description: res.error, variant: "error" });
      return;
    }
    void load();
    syncRouterNonBlocking(router);
    toast({ title: "Account deleted", variant: "success" });
  };

  const filteredAccounts = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return accounts.filter((row) => {
      if (typeFilter && row.type !== typeFilter) return false;
      if (!q) return true;
      const hay = [row.name, row.type, row.lastFour, row.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [accounts, searchQuery, typeFilter]);

  const summary = React.useMemo(() => {
    const total = accounts.length;
    const bank = accounts.filter((a) => a.type === "Bank").length;
    const cash = accounts.filter((a) => a.type === "Cash").length;
    const cards = accounts.filter(
      (a) => a.type === "Credit Card" || a.type === "Debit Card"
    ).length;
    return { total, bank, cards, cash };
  }, [accounts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    // Defensive: avoid "DOM shows value but state is empty" edge cases.
    const trimmedName = (nameInputRef.current?.value ?? name).trim();
    if (!trimmedName) {
      toast({ title: "Account name required", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        const res = await updateAccountAction({
          id: editingId,
          name: trimmedName,
          type,
          lastFour: lastFour.trim() || null,
          notes: notes.trim() || null,
        });
        if (!res.ok) {
          toast({ title: "Failed to update account", description: res.error, variant: "error" });
          return;
        }
        setModalOpen(false);
        setEditingId(null);
        await load();
        syncRouterNonBlocking(router);
        toast({ title: "Account updated", variant: "success" });
      } else {
        const result = await createAccountAction({
          name: trimmedName,
          type,
          lastFour: lastFour.trim() || null,
          notes: notes.trim() || null,
        });
        if (result.error) {
          toast({
            title: "Failed to create account",
            description: result.error,
            variant: "error",
          });
          return;
        }
        // Close immediately on success even if refresh/load fails.
        setModalOpen(false);
        // Optimistic insert so the user sees it instantly.
        if (result.data?.id) {
          setAccounts((prev) => {
            const exists = prev.some((a) => a.id === result.data!.id);
            if (exists) return prev;
            const now = new Date().toISOString();
            return [
              {
                id: result.data!.id,
                name: trimmedName,
                type,
                lastFour: lastFour.trim() || null,
                notes: notes.trim() || null,
                createdAt: now,
                updatedAt: now,
              },
              ...prev,
            ];
          });
        }
        // Refresh from server so the list reflects canonical data.
        await load();
        syncRouterNonBlocking(router);
        toast({ title: "Account created", variant: "success" });
      }
    } catch (err) {
      toast({
        title: editingId ? "Failed to save account" : "Failed to create account",
        description: err instanceof Error ? err.message : undefined,
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={cn(
        "min-w-0 overflow-x-hidden bg-zinc-50 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-[max(0.35rem,env(safe-area-inset-top,0px))] dark:bg-background",
        "flex flex-col"
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-3 px-4 py-2 pb-4 dark:bg-background sm:max-w-[460px] md:max-w-6xl md:gap-4 md:px-6 md:pb-6 md:pt-3",
          mobileListPagePaddingClass
        )}
      >
        <div className="hidden md:block">
          <PageHeader
            className="gap-1 border-b border-zinc-200/70 pb-2 dark:border-border/60 lg:items-baseline lg:gap-x-4 [&_p]:mt-0"
            title="Accounts"
            subtitle="Manage payment sources: credit cards, debit cards, bank accounts, cash."
            actions={
              <Button
                size="sm"
                className="h-9 shrink-0 gap-1.5 shadow-none bg-[#0B1220] text-white hover:bg-[#0B1220]/92 dark:bg-emerald-500/90 dark:text-black dark:hover:bg-emerald-500"
                onClick={openModal}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add Account
              </Button>
            }
          />
        </div>

        <MobileListHeader
          title="Accounts"
          fab={<MobileFabButton ariaLabel="Add account" onClick={openModal} />}
        />

        {/* KPI summary */}
        <section className="border-b border-border/60 pb-4">
          <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
            Summary
          </p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <Wallet className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Total accounts
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {formatInteger(summary.total)}
                </div>
              </div>
            </div>
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <Landmark className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Bank accounts
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {formatInteger(summary.bank)}
                </div>
              </div>
            </div>
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <CreditCard className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Cards
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {formatInteger(summary.cards)}
                </div>
              </div>
            </div>
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <Banknote className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Cash accounts
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {formatInteger(summary.cash)}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Filter/search surface */}
        <div className={cn(accountsShell, "p-3 md:p-3")}>
          <div className="flex w-full flex-wrap items-end gap-3 md:flex-nowrap">
            <div className="flex min-w-[220px] flex-1 flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                Search
              </label>
              <div className="relative w-full">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search accounts…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 min-h-[44px] pl-8 text-sm"
                  aria-label="Search accounts"
                />
              </div>
            </div>
            <div className="flex min-w-[180px] flex-1 flex-col gap-1 sm:flex-initial">
              <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                Type
              </label>
              <Select
                value={typeFilter}
                onChange={(e) => setTypeFilter((e.target.value || "") as "" | AccountType)}
                className="h-10 min-h-[44px] min-w-0 sm:min-h-10 sm:w-[220px]"
              >
                <option value="">All types</option>
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : accounts.length === 0 ? (
          <div className={cn(accountsShell, "px-4 py-10 text-center")}>
            <span className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200/70 bg-zinc-50/80 text-zinc-600 dark:border-border/60 dark:bg-muted/25 dark:text-zinc-300">
              <CreditCard className="h-5 w-5" aria-hidden />
            </span>
            <p className="text-sm font-medium text-foreground">No payment accounts yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add a bank account, card, or cash account to track company finances.
            </p>
            <Button
              size="sm"
              className="mt-4 h-9 rounded-sm shadow-none bg-[#0B1220] text-white hover:bg-[#0B1220]/92 dark:bg-emerald-500/90 dark:text-black dark:hover:bg-emerald-500"
              onClick={openModal}
            >
              <Plus className="mr-2 h-3.5 w-3.5" aria-hidden />
              Add first account
            </Button>
          </div>
        ) : filteredAccounts.length === 0 ? (
          <EmptyState
            title="No accounts match your filters"
            description="Try adjusting your search or type filter."
            icon={null}
            action={
              <Button
                size="sm"
                variant="outline"
                className="h-9 rounded-sm shadow-none"
                onClick={() => {
                  setSearchQuery("");
                  setTypeFilter("");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <section className={cn(accountsShell, "overflow-hidden p-0")}>
            {/* Desktop header row */}
            <div className="hidden md:grid grid-cols-[minmax(240px,1.6fr)_minmax(120px,0.7fr)_minmax(90px,0.5fr)_minmax(90px,0.5fr)_44px] gap-3 border-b border-border/60 px-3 py-2.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
              <div>Account</div>
              <div>Type</div>
              <div className="text-right">Last 4</div>
              <div>Status</div>
              <div />
            </div>

            <div className="flex flex-col divide-y divide-border/60">
              {filteredAccounts.map((row) => (
                <div
                  key={row.id}
                  className="group flex flex-col gap-2 px-3 py-3 transition-colors hover:bg-muted/25 md:grid md:grid-cols-[minmax(240px,1.6fr)_minmax(120px,0.7fr)_minmax(90px,0.5fr)_minmax(90px,0.5fr)_44px] md:items-center md:gap-3"
                >
                  {/* ACCOUNT */}
                  <button type="button" className="min-w-0 text-left" onClick={() => openEdit(row)}>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-200/70 bg-white text-zinc-600 dark:border-border/60 dark:bg-card dark:text-muted-foreground">
                        <AccountTypeIcon type={row.type} />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {row.name}
                        </div>
                        {row.notes ? (
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">
                            {row.notes}
                          </div>
                        ) : (
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">
                            Payment source
                          </div>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* TYPE */}
                  <div className="md:pl-0">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                        typeChipClass(row.type)
                      )}
                    >
                      {row.type}
                    </span>
                  </div>

                  {/* LAST 4 */}
                  <div className="text-right tabular-nums font-mono text-xs text-muted-foreground">
                    {row.lastFour ? `•••• ${row.lastFour}` : "—"}
                  </div>

                  {/* STATUS (no backend field; all current rows are active) */}
                  <div>
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/60 dark:bg-emerald-900/20 dark:text-emerald-200 dark:ring-emerald-900/30">
                      Active
                    </span>
                  </div>

                  {/* ACTIONS */}
                  <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                    <RowActionsMenu
                      appearance="list"
                      ariaLabel={`Actions for ${row.name}`}
                      actions={[
                        { label: "Edit", onClick: () => openEdit(row) },
                        {
                          label: (
                            <span className="inline-flex items-center gap-2">
                              <MoreHorizontal className="h-0 w-0" aria-hidden />
                              Delete
                            </span>
                          ),
                          destructive: true,
                          onClick: () => setDeleteTarget(row),
                        },
                      ]}
                    />
                  </div>

                  {/* Mobile meta row */}
                  <div className="flex flex-wrap items-center gap-2 md:hidden">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                        typeChipClass(row.type)
                      )}
                    >
                      {row.type}
                    </span>
                    <span className="text-xs font-mono tabular-nums text-muted-foreground">
                      {row.lastFour ? `•••• ${row.lastFour}` : "Last 4 —"}
                    </span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">Active</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title="Delete account?"
          description={
            deleteTarget
              ? `This will permanently delete “${deleteTarget.name}”. This cannot be undone.`
              : undefined
          }
          confirmLabel="Delete"
          cancelLabel="Cancel"
          destructive
          onConfirm={async () => {
            const acc = deleteTarget;
            if (!acc) return;
            setDeleteTarget(null);
            await handleDelete(acc);
          }}
        />
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader className="border-b border-border/60 pb-3">
            <DialogTitle className="text-base font-medium">
              {editingId ? "Edit Account" : "Add Account"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Account Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Chase Ink, BoA Bank"
                className="h-9"
                required
                ref={nameInputRef}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Type
              </label>
              <Select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Last 4 digits (optional)
              </label>
              <Input
                value={lastFour}
                onChange={(e) => setLastFour(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="1234"
                className="h-9 w-24 tabular-nums"
                maxLength={4}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Notes (optional)
              </label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
                className="h-9"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="btn-outline-ghost h-8"
                onClick={() => {
                  setModalOpen(false);
                  setEditingId(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" className="h-8" disabled={saving}>
                <SubmitSpinner loading={saving} className="mr-2" />
                {saving ? "Saving…" : editingId ? "Save changes" : "Save account"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
