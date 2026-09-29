"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { UnappliedPaymentListItem } from "@/lib/payments-received-db";
import {
  LinkUnappliedPaymentDialog,
  type LinkUnappliedPaymentTarget,
} from "@/components/financial/link-unapplied-payment-dialog";

export function UnappliedPaymentsPanel({
  payments,
  error = null,
}: {
  payments: UnappliedPaymentListItem[];
  error?: string | null;
}) {
  const router = useRouter();
  const [linkTarget, setLinkTarget] = React.useState<LinkUnappliedPaymentTarget | null>(null);

  return (
    <section
      data-testid="unapplied-payments"
      className="min-w-0 rounded-hh-task border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-4 py-4 sm:px-5"
    >
      <div className="flex min-h-8 items-center justify-between gap-3">
        <h2 className="text-hh-status font-medium tracking-normal text-[var(--hh-text-tertiary)]">
          Unapplied payments
        </h2>
      </div>
      <p className="mt-1 text-hh-body text-[var(--hh-text-secondary)]">
        These customer payments are not applied to an invoice, so they are excluded from Paid and
        Balance due.
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-hh-body text-[var(--hh-danger)]">
          {error}
        </p>
      ) : payments.length === 0 ? (
        <p className="mt-3 text-hh-body text-[var(--hh-text-secondary)]">No unapplied payments.</p>
      ) : (
        <div className="airtable-table-wrap airtable-table-wrap--ruled mt-3 overflow-hidden rounded-hh-task border border-[var(--hh-border)]">
          <div className="airtable-table-scroll">
            <table className="w-full text-hh-body">
              <thead>
                <tr>
                  {["Date", "Customer", "Project", "Method", "Reference", "Amount", ""].map(
                    (label) => (
                      <th
                        key={label || "action"}
                        className="h-8 px-3 text-left align-middle text-hh-metadata font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] last:text-right"
                      >
                        {label}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-t border-[var(--hh-border)]">
                    <td className="h-11 px-3 align-middle tabular-nums">
                      {payment.paymentDate ? formatDate(payment.paymentDate) : "—"}
                    </td>
                    <td className="h-11 px-3 align-middle">
                      <span className="mr-2">{payment.customerName || "—"}</span>
                      <Badge variant="warning">Unapplied</Badge>
                    </td>
                    <td className="h-11 px-3 align-middle">{payment.projectName || "—"}</td>
                    <td className="h-11 px-3 align-middle">{payment.method?.trim() || "—"}</td>
                    <td className="h-11 px-3 align-middle">{payment.reference?.trim() || "—"}</td>
                    <td className="h-11 px-3 text-right align-middle tabular-nums">
                      {formatCurrency(payment.amount)}
                    </td>
                    <td className="h-11 px-3 text-right align-middle">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        data-testid="link-to-invoice-action"
                        onClick={() =>
                          setLinkTarget({
                            id: payment.id,
                            amount: payment.amount,
                            customerName: payment.customerName,
                            date: payment.paymentDate,
                            method: payment.method,
                            reference: payment.reference,
                          })
                        }
                      >
                        Link to invoice
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <LinkUnappliedPaymentDialog
        payment={linkTarget}
        open={linkTarget != null}
        onOpenChange={(next) => {
          if (!next) setLinkTarget(null);
        }}
        onLinked={() => router.refresh()}
      />
    </section>
  );
}
