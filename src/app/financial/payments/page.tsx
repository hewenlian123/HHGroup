"use client";

import * as React from "react";
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
    return () => { cancelled = true; };
  }, [load]);

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Payments Received"
        description="Record and view customer payments against invoices."
        actions={
          <Button size="sm" className="h-8" onClick={() => setModalOpen(true)}>
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/60 hover:bg-transparent">
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Date</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Customer</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Project</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Invoice #</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground tabular-nums">Amount</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Payment Method</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Account</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((row) => (
                  <TableRow key={row.id} className="border-b border-border/30">
                    <TableCell className="tabular-nums text-foreground">{row.payment_date}</TableCell>
                    <TableCell className="text-foreground">{row.customer_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{row.project_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{row.invoice_no ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-emerald-600/90 dark:text-emerald-400/90">
                      {money(row.amount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.payment_method ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{row.deposit_account ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate" title={row.notes ?? undefined}>
                      {row.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <ReceivePaymentModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSuccess={load}
      />
    </div>
  );
}
