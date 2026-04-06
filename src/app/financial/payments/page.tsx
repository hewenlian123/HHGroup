"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getPaymentsReceived, type PaymentReceivedWithMeta } from "@/lib/data";
import { Plus, Search } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ReceivePaymentModal } from "./receive-payment-modal";
import { DeleteRowAction } from "@/components/base";
import { useToast } from "@/components/toast/toast-provider";
import { deletePaymentReceivedAction } from "./actions";
import {
  MobileEmptyState,
  MobileFabButton,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [methodFilter, setMethodFilter] = React.useState("");

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

  const filteredPayments = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return payments.filter((row) => {
      if (methodFilter && (row.payment_method ?? "").trim() !== methodFilter) return false;
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
  }, [payments, searchQuery, methodFilter]);

  const activeDrawerFilterCount = methodFilter ? 1 : 0;

  return (
    <div
      className={cn("page-container page-stack py-6", mobileListPagePaddingClass, "max-md:!gap-3")}
    >
      <div className="hidden md:block">
        <PageHeader
          title="Payments Received"
          description="Record and view customer payments against invoices."
          actions={
            <Button
              size="sm"
              className="h-8 max-md:min-h-11 w-full sm:w-auto"
              onClick={() => setModalOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Receive Payment
            </Button>
          }
        />
      </div>
      <MobileListHeader
        title="Payments Received"
        fab={<MobileFabButton ariaLabel="Receive payment" onClick={() => setModalOpen(true)} />}
      />
      <MobileSearchFiltersRow
        filterSheetOpen={filtersOpen}
        onOpenFilters={() => setFiltersOpen(true)}
        activeFilterCount={activeDrawerFilterCount}
        searchSlot={
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Customer, project, invoice…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 pl-8 text-sm"
              aria-label="Search payments"
            />
          </div>
        }
      />
      <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Payment method</p>
          <Select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="w-full"
          >
            <option value="">All methods</option>
            {methodOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </div>
        <Button type="button" className="w-full rounded-sm" onClick={() => setFiltersOpen(false)}>
          Done
        </Button>
      </MobileFilterSheet>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : payments.length === 0 ? (
        <>
          <MobileEmptyState
            icon={<Plus className="h-8 w-8 opacity-80" aria-hidden />}
            message="No payments yet. Record a payment to get started."
            action={
              <Button size="sm" variant="outline" onClick={() => setModalOpen(true)}>
                Receive payment
              </Button>
            }
          />
          <div className="hidden md:block">
            <EmptyState
              title="No payments yet"
              description="Record a payment to get started."
              icon={null}
              action={
                <Button size="sm" className="h-8" onClick={() => setModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Receive Payment
                </Button>
              }
            />
          </div>
        </>
      ) : (
        <section className="border-b border-border/60 md:border-b-0">
          {filteredPayments.length === 0 ? (
            <MobileEmptyState
              icon={<Search className="h-8 w-8 opacity-80" aria-hidden />}
              message="No payments match your filters."
            />
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-border/60 md:hidden">
              {filteredPayments.map((row) => (
                <div key={row.id} className="flex min-h-[48px] flex-col gap-1 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="tabular-nums text-sm font-medium text-foreground">
                        {row.payment_date}
                      </p>
                      <p className="truncate text-sm text-foreground">{row.customer_name || "—"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.project_name ?? "—"} · Inv {row.invoice_no ?? "—"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-medium tabular-nums text-hh-profit-positive dark:text-hh-profit-positive">
                        {money(row.amount)}
                      </span>
                      <DeleteRowAction
                        onDelete={async () => {
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
                        }}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {(row.payment_method ?? "—") + " · " + (row.deposit_account ?? "—")}
                  </p>
                  {row.notes ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{row.notes}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          <div className="hidden overflow-x-auto md:block">
            <Table className="min-w-[640px] lg:min-w-0">
              <TableHeader>
                <TableRow className="border-b border-border/60 hover:bg-transparent">
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                    Date
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                    Customer
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                    Project
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                    Invoice #
                  </TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground tabular-nums">
                    Amount
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                    Payment Method
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                    Account
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                    Notes
                  </TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((row) => (
                  <TableRow
                    key={row.id}
                    className="group border-b border-border/30 hover:bg-muted/20"
                  >
                    <TableCell className="tabular-nums text-foreground">
                      {row.payment_date}
                    </TableCell>
                    <TableCell className="text-foreground">{row.customer_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.project_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.invoice_no ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-hh-profit-positive dark:text-hh-profit-positive">
                      {money(row.amount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.payment_method ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.deposit_account ?? "—"}
                    </TableCell>
                    <TableCell
                      className="text-muted-foreground max-w-[200px] truncate"
                      title={row.notes ?? undefined}
                    >
                      {row.notes ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <DeleteRowAction
                        onDelete={async () => {
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
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <ReceivePaymentModal open={modalOpen} onOpenChange={setModalOpen} onSuccess={load} />
    </div>
  );
}
