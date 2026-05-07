"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { getPaymentsReceived, type PaymentReceivedWithMeta } from "@/lib/data";
import { Banknote, CalendarDays, Link2, Plus, Search, Wallet } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ReceivePaymentModal } from "./receive-payment-modal";
import { useToast } from "@/components/toast/toast-provider";
import { deletePaymentReceivedAction } from "./actions";
import {
  MobileFabButton,
  MobileListHeader,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
import { ConfirmDialog } from "@/components/base";
import { formatCurrency, formatDate, formatInteger } from "@/lib/formatters";
import { TYPO } from "@/lib/typography";

const paymentsShell =
  "rounded-xl border border-zinc-200/70 bg-white shadow-[0_1px_0_rgba(0,0,0,0.04),0_4px_24px_rgba(0,0,0,0.045)] dark:border-border/50 dark:bg-card/80 dark:shadow-none md:rounded-2xl";

const kpiTile =
  "rounded-xl border border-zinc-200/40 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.028),0_1px_12px_rgba(0,0,0,0.028)] dark:border-border/35 dark:bg-card/80 dark:shadow-none";

const kpiIcon =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100/45 text-zinc-400 dark:bg-muted/45 dark:text-muted-foreground";

export default function PaymentsReceivedPage() {
  return (
    <React.Suspense fallback={<div className="page-container py-6" />}>
      <PaymentsReceivedPageInner />
    </React.Suspense>
  );
}

function PaymentsReceivedPageInner() {
  const { toast } = useToast();
  const [payments, setPayments] = React.useState<PaymentReceivedWithMeta[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [methodFilter, setMethodFilter] = React.useState("");
  const [accountFilter, setAccountFilter] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<PaymentReceivedWithMeta | null>(null);

  const load = React.useCallback(async () => {
    const list = await getPaymentsReceived();
    setPayments(list);
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

  const methodOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of payments) {
      const m = (p.payment_method ?? "").trim();
      if (m) set.add(m);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [payments]);

  const accountOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of payments) {
      const a = (p.deposit_account ?? "").trim();
      if (a) set.add(a);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [payments]);

  const filteredPayments = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const from = dateFrom ? dateFrom.slice(0, 10) : "";
    const to = dateTo ? dateTo.slice(0, 10) : "";
    return payments.filter((row) => {
      if (methodFilter && (row.payment_method ?? "").trim() !== methodFilter) return false;
      if (accountFilter && (row.deposit_account ?? "").trim() !== accountFilter) return false;
      const d = (row.payment_date ?? "").slice(0, 10);
      if (from && d && d < from) return false;
      if (to && d && d > to) return false;
      if (!q) return true;
      const hay = [
        row.payment_date,
        row.customer_name,
        row.project_name,
        row.invoice_no,
        row.payment_method,
        row.deposit_account,
        row.notes,
        String(row.amount),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [payments, searchQuery, methodFilter, accountFilter, dateFrom, dateTo]);

  const summary = React.useMemo(() => {
    const totalReceived = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const paymentsCount = payments.length;
    const ym = new Date().toISOString().slice(0, 7);
    const thisMonthTotal = payments
      .filter((p) => String(p.payment_date ?? "").startsWith(ym))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const linkedInvoices = payments.filter((p) => Boolean(p.invoice_no)).length;
    const unknownOrUnapplied = payments.filter(
      (p) => !p.invoice_no || !(p.customer_name ?? "").trim()
    ).length;
    return { totalReceived, paymentsCount, thisMonthTotal, linkedInvoices, unknownOrUnapplied };
  }, [payments]);

  const voidPayment = React.useCallback(
    async (row: PaymentReceivedWithMeta) => {
      const id = row.id;
      let snapshot: PaymentReceivedWithMeta[] | undefined;
      setPayments((prev) => {
        snapshot = prev;
        return prev.filter((p) => p.id !== id);
      });
      const res = await deletePaymentReceivedAction(id);
      if (!res.ok) {
        if (snapshot) setPayments(snapshot);
        toast({
          title: (res.error ?? "").includes("Cannot delete: void instead")
            ? "Cannot delete"
            : "Delete failed",
          description: res.error ?? "Could not delete payment.",
          variant: "error",
        });
        return;
      }
      toast({ title: "Payment voided", variant: "success" });
      void load();
    },
    [load, toast]
  );

  return (
    <div className={cn("min-w-0 overflow-x-hidden bg-zinc-50 dark:bg-background", "flex flex-col")}>
      <div
        className={cn(
          "mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-3 px-4 py-2 pb-4 sm:max-w-[460px] md:max-w-6xl md:gap-4 md:px-6 md:pb-6 md:pt-3",
          mobileListPagePaddingClass
        )}
      >
        <div className="hidden md:block">
          <PageHeader
            className="gap-1 border-b border-zinc-200/70 pb-2 dark:border-border/60 lg:items-baseline lg:gap-x-4 [&_p]:mt-0"
            title="Payments Received"
            subtitle="Cash collection and payment history across customers and invoices."
            actions={
              <Button
                size="sm"
                className="h-9 shrink-0 gap-1.5 shadow-none bg-[#0B1220] text-white hover:bg-[#0B1220]/92 dark:bg-emerald-500/90 dark:text-black dark:hover:bg-emerald-500"
                onClick={() => setModalOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Receive Payment
              </Button>
            }
          />
        </div>

        <MobileListHeader
          title="Payments Received"
          fab={<MobileFabButton ariaLabel="Receive payment" onClick={() => setModalOpen(true)} />}
        />

        {/* KPI summary */}
        <section className="border-b border-border/60 pb-4">
          <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
            Summary
          </p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <Wallet className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Total received
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {formatCurrency(summary.totalReceived)}
                </div>
              </div>
            </div>
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <Banknote className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Payments
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {formatInteger(summary.paymentsCount)}
                </div>
              </div>
            </div>
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <CalendarDays className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  This month
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {formatCurrency(summary.thisMonthTotal)}
                </div>
              </div>
            </div>
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <Link2 className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Linked invoices
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {formatInteger(summary.linkedInvoices)}
                </div>
              </div>
            </div>
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <Search className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Unapplied/unknown
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {formatInteger(summary.unknownOrUnapplied)}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Filter/search surface */}
        <div className={cn(paymentsShell, "p-3")}>
          <div className="flex w-full flex-wrap items-end gap-3 md:flex-nowrap">
            <div className="flex min-w-[240px] flex-1 flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                Search
              </label>
              <div className="relative w-full">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Customer, project, invoice…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 min-h-[44px] pl-8 text-sm"
                  aria-label="Search payments"
                />
              </div>
            </div>

            <div className="flex min-w-[180px] flex-1 flex-col gap-1 sm:flex-initial">
              <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                Method
              </label>
              <Select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                className="h-10 min-h-[44px] min-w-0 sm:min-h-10 sm:w-[200px]"
              >
                <option value="">All methods</option>
                {methodOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex min-w-[180px] flex-1 flex-col gap-1 sm:flex-initial">
              <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                Account
              </label>
              <Select
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                className="h-10 min-h-[44px] min-w-0 sm:min-h-10 sm:w-[200px]"
              >
                <option value="">All accounts</option>
                {accountOptions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-zinc-100/80 pt-3 dark:border-border/60">
            <div className="flex flex-1 flex-col gap-1 sm:flex-initial">
              <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                Date from
              </label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-10 min-h-[44px] tabular-nums sm:min-h-10 sm:w-[170px]"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1 sm:flex-initial">
              <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                Date to
              </label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-10 min-h-[44px] tabular-nums sm:min-h-10 sm:w-[170px]"
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-10 min-h-[44px] rounded-sm shadow-none sm:h-9 sm:min-h-0"
                onClick={() => void load()}
              >
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className={cn(paymentsShell, "px-4 py-10 text-center")}>
            <p className="text-sm text-muted-foreground">Loading payments…</p>
          </div>
        ) : payments.length === 0 ? (
          <div className={cn(paymentsShell, "px-4 py-10 text-center")}>
            <span className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200/70 bg-zinc-50/80 text-zinc-600 dark:border-border/60 dark:bg-muted/25 dark:text-zinc-300">
              <Wallet className="h-5 w-5" aria-hidden />
            </span>
            <p className="text-sm font-medium text-foreground">No payments yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Record a payment to start tracking cash collection and invoice history.
            </p>
            <Button
              size="sm"
              className="mt-4 h-9 rounded-sm shadow-none bg-[#0B1220] text-white hover:bg-[#0B1220]/92 dark:bg-emerald-500/90 dark:text-black dark:hover:bg-emerald-500"
              onClick={() => setModalOpen(true)}
            >
              <Plus className="mr-2 h-3.5 w-3.5" aria-hidden />
              Receive Payment
            </Button>
          </div>
        ) : filteredPayments.length === 0 ? (
          <EmptyState
            title="No payments match your filters"
            description="Try adjusting your search, filters, or date range."
            icon={null}
            action={
              <Button
                size="sm"
                variant="outline"
                className="h-9 rounded-sm shadow-none"
                onClick={() => {
                  setSearchQuery("");
                  setMethodFilter("");
                  setAccountFilter("");
                  setDateFrom("");
                  setDateTo("");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <section className={cn(paymentsShell, "overflow-hidden p-0")}>
            {/* Desktop header row */}
            <div className="hidden md:grid grid-cols-[minmax(200px,1.2fr)_minmax(180px,1fr)_minmax(90px,0.5fr)_minmax(130px,0.6fr)_minmax(120px,0.6fr)_minmax(160px,0.8fr)_minmax(120px,0.6fr)_44px] gap-3 border-b border-border/60 px-3 py-2.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
              <div>Customer</div>
              <div>Project</div>
              <div>Invoice #</div>
              <div className="text-right">Amount</div>
              <div>Method</div>
              <div>Account</div>
              <div>Date</div>
              <div />
            </div>

            <div className="flex flex-col divide-y divide-border/60">
              {filteredPayments.map((row) => (
                <div
                  key={row.id}
                  className="group px-3 py-3 transition-colors hover:bg-muted/25 md:grid md:grid-cols-[minmax(200px,1.2fr)_minmax(180px,1fr)_minmax(90px,0.5fr)_minmax(130px,0.6fr)_minmax(120px,0.6fr)_minmax(160px,0.8fr)_minmax(120px,0.6fr)_44px] md:items-center md:gap-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {row.customer_name || "—"}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground md:hidden">
                      {row.project_name ?? "—"} · Inv {row.invoice_no ?? "—"}
                    </div>
                  </div>

                  <div className="hidden min-w-0 md:block">
                    <div className="truncate text-sm text-foreground">
                      {row.project_name ?? "—"}
                    </div>
                  </div>

                  <div className="hidden md:block text-sm text-muted-foreground font-mono tabular-nums">
                    {row.invoice_no ?? "—"}
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-3 md:mt-0 md:block md:text-right">
                    <div className="md:hidden text-xs text-muted-foreground">
                      {formatDate(row.payment_date)}
                    </div>
                    <div
                      className={cn(TYPO.amount, "text-sm text-emerald-700 dark:text-emerald-400")}
                    >
                      {formatCurrency(row.amount)}
                    </div>
                  </div>

                  <div className="hidden md:block text-sm text-muted-foreground">
                    {row.payment_method ?? "—"}
                  </div>

                  <div className="hidden md:block min-w-0 text-sm text-muted-foreground truncate">
                    {row.deposit_account ?? "—"}
                  </div>

                  <div className="hidden md:block text-sm font-mono tabular-nums text-muted-foreground">
                    {formatDate(row.payment_date)}
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2 md:mt-0 md:block">
                    <div className="md:hidden text-xs text-muted-foreground">
                      {(row.payment_method ?? "—") + " · " + (row.deposit_account ?? "—")}
                    </div>
                    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                      <RowActionsMenu
                        appearance="list"
                        ariaLabel={`Actions for payment ${row.invoice_no ?? ""}`}
                        actions={[
                          {
                            label: "Delete",
                            destructive: true,
                            onClick: () => setDeleteTarget(row),
                          },
                        ]}
                      />
                    </div>
                  </div>

                  {row.notes ? (
                    <div className="mt-2 text-xs text-muted-foreground line-clamp-2 md:hidden">
                      {row.notes}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        )}

        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title="Void payment?"
          description={
            deleteTarget
              ? `This will void the payment for ${deleteTarget.customer_name || "customer"} on ${formatDate(
                  deleteTarget.payment_date
                )}. This cannot be undone.`
              : undefined
          }
          confirmLabel="Void"
          cancelLabel="Cancel"
          destructive
          onConfirm={async () => {
            const row = deleteTarget;
            if (!row) return;
            setDeleteTarget(null);
            await voidPayment(row);
          }}
        />

        <ReceivePaymentModal open={modalOpen} onOpenChange={setModalOpen} onSuccess={load} />
      </div>
    </div>
  );
}
