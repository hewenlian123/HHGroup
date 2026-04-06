"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getPaymentsReceived, type PaymentReceivedWithMeta } from "@/lib/data";
import { Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ReceivePaymentModal } from "./receive-payment-modal";
import { DeleteRowAction } from "@/components/base";
import { useToast } from "@/components/toast/toast-provider";
import { deletePaymentReceivedAction } from "./actions";

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

  return (
    <div className="page-container page-stack py-6">
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

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : payments.length === 0 ? (
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
      ) : (
        <section className="border-b border-border/60">
          <div className="flex flex-col gap-3 md:hidden">
            {payments.map((row) => (
              <div key={row.id} className="rounded-sm border border-border/60 p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="tabular-nums text-sm text-foreground">{row.payment_date}</span>
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
                <p className="mt-1 font-medium text-foreground">{row.customer_name || "—"}</p>
                <p className="text-sm text-muted-foreground">{row.project_name ?? "—"}</p>
                <dl className="mt-3 space-y-2 text-xs">
                  <div className="flex justify-between gap-2 tabular-nums">
                    <dt className="text-muted-foreground">Invoice #</dt>
                    <dd>{row.invoice_no ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Amount</dt>
                    <dd className="font-medium text-hh-profit-positive dark:text-hh-profit-positive">
                      {money(row.amount)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Method</dt>
                    <dd className="text-right">{row.payment_method ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Account</dt>
                    <dd className="text-right">{row.deposit_account ?? "—"}</dd>
                  </div>
                  <div className="text-muted-foreground">
                    <dt className="text-[10px] uppercase tracking-wide">Notes</dt>
                    <dd className="mt-1">{row.notes ?? "—"}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
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
