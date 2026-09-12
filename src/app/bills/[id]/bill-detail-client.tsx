"use client";

import { financePathWithReturn, financeReturnPath } from "@/lib/finance-navigation";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  KpiTile,
  NeoAmount,
  NeoFieldLabel,
  NeoInput,
  NeoModal,
  NeoPanel,
  NeoTable,
  StatusBadge,
} from "@/components/base";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { tableRawTdClass, tableRawThClass } from "@/components/ui/table";
import type { ApBillWithProject, ApBillPaymentRow } from "@/lib/data";
import { useAttachmentPreview } from "@/contexts/attachment-preview-context";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePreviewSignedUrl } from "@/lib/storage-signed-url";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { TYPO } from "@/lib/typography";
import { cn } from "@/lib/utils";
import { beginPendingSubmission, getPendingSubmission } from "@/lib/financial-idempotency";
import {
  billsDestructiveGhostClass,
  billsDetailDdClass,
  billsDetailDlClass,
  billsDetailDtClass,
  billsGhostButtonClass,
  billsPrimaryButtonClass,
  billsSecondaryButtonClass,
} from "../bills-ui-styles";

type Props = {
  bill: ApBillWithProject;
  payments: ApBillPaymentRow[];
  addPaymentOpen: boolean;
  drawerReturnTo?: string;
};

async function readApiMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
  return typeof body?.message === "string" ? body.message : fallback;
}

export function BillDetailClient({
  bill,
  payments,
  addPaymentOpen: initialAddPaymentOpen,
  drawerReturnTo,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openPreview } = useAttachmentPreview();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const [supabase, setSupabase] = React.useState<SupabaseClient | null>(null);
  const [addPaymentOpen, setAddPaymentOpen] = React.useState(initialAddPaymentOpen);
  const [paymentDate, setPaymentDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [paymentAmount, setPaymentAmount] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState("");
  const [paymentRef, setPaymentRef] = React.useState("");
  const [paymentNotes, setPaymentNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [intentStorageKey, setIntentStorageKey] = React.useState<string | null>(null);
  const paymentInFlight = React.useRef(false);
  const [hasPendingPayment, setHasPendingPayment] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [voidConfirm, setVoidConfirm] = React.useState(false);
  const [deleteConfirm, setDeleteConfirm] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    async function restoreIntent() {
      if (!configured) throw new Error("Payment session is unavailable.");
      const { createBrowserClient } = await import("@/lib/supabase");
      const client = createBrowserClient(url as string, anon as string);
      const identity = await client.auth.getUser();
      if (!identity?.data.user || identity.error)
        throw new Error("Payment session is unavailable.");
      if (!active) return;
      setSupabase(client);
      const key = `hh:ap-payment:${identity.data.user.id}:${bill.id}`;
      const pending = getPendingSubmission(localStorage, key);
      if (!active) return;
      setIntentStorageKey(key);
      setHasPendingPayment(Boolean(pending));
      if (pending) {
        const draft = JSON.parse(pending.fingerprint);
        setPaymentDate(draft.payment_date);
        setPaymentAmount(String(draft.amount));
        setPaymentMethod(draft.payment_method ?? "");
        setPaymentRef(draft.reference_no ?? "");
        setPaymentNotes(draft.notes ?? "");
      }
    }
    void restoreIntent().catch((error) => {
      if (active)
        setError(error instanceof Error ? error.message : "Payment session is unavailable.");
    });
    return () => {
      active = false;
    };
  }, [bill.id, configured, url, anon]);

  const canAddPayment =
    hasPendingPayment || bill.status === "Pending" || bill.status === "Partially Paid";
  const canVoid =
    bill.status === "Pending" || bill.status === "Partially Paid" || bill.status === "Paid";

  React.useEffect(
    () => setAddPaymentOpen(canAddPayment && initialAddPaymentOpen),
    [canAddPayment, initialAddPaymentOpen]
  );

  const statusVariant =
    bill.status === "Paid"
      ? "success"
      : bill.status === "Partially Paid" || bill.status === "Pending"
        ? "warning"
        : "muted";

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentInFlight.current) return;
    if (!canAddPayment) {
      setError("Only pending bills can be paid.");
      return;
    }
    const amt = parseFloat(paymentAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    paymentInFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      if (!intentStorageKey) throw new Error("Payment session is unavailable.");
      const draft = {
        payment_date: paymentDate,
        amount: amt,
        payment_method: paymentMethod || undefined,
        reference_no: paymentRef || undefined,
        notes: paymentNotes || undefined,
      };
      const intent = beginPendingSubmission(localStorage, intentStorageKey, draft);
      setHasPendingPayment(true);
      const response = await fetch(`/api/bills/${encodeURIComponent(bill.id)}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, idempotency_key: intent.key }),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) {
        if (result.outcome === "rejected") {
          localStorage.removeItem(intentStorageKey);
          setHasPendingPayment(false);
        }
        throw new Error(result.message ?? "Failed to add payment.");
      }
      if (getPendingSubmission(localStorage, intentStorageKey)?.key === intent.key)
        localStorage.removeItem(intentStorageKey);
      setHasPendingPayment(false);
      setPaymentAmount("");
      setPaymentMethod("");
      setPaymentRef("");
      setPaymentNotes("");
      setAddPaymentOpen(false);
      syncRouterNonBlocking(router);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add payment.");
    } finally {
      paymentInFlight.current = false;
      setSubmitting(false);
    }
  };

  const handleApprove = async () => {
    setError(null);
    const response = await fetch(`/api/bills/${encodeURIComponent(bill.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    if (response.ok) {
      syncRouterNonBlocking(router);
    } else {
      setError(await readApiMessage(response, "Failed to approve bill."));
    }
  };

  const handleVoid = async () => {
    setError(null);
    const response = await fetch(`/api/bills/${encodeURIComponent(bill.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "void" }),
    });
    if (response.ok) {
      setVoidConfirm(false);
      syncRouterNonBlocking(router);
    } else {
      setError(await readApiMessage(response, "Failed to void bill."));
    }
  };

  const handleDeleteDraft = async () => {
    setError(null);
    const response = await fetch(`/api/bills/${encodeURIComponent(bill.id)}`, {
      method: "DELETE",
    });
    if (response.ok) {
      router.push(financeReturnPath(searchParams.get("returnTo"), "/bills"));
      syncRouterNonBlocking(router);
    } else {
      setError(await readApiMessage(response, "Failed to delete bill."));
    }
  };

  return (
    <div className="mx-auto flex min-w-0 max-w-[1000px] flex-col gap-4 md:gap-5">
      {error && !addPaymentOpen ? (
        <p role="alert" className="text-[var(--hh-danger)]">
          {error}
        </p>
      ) : null}
      <NeoPanel title="Bill details" bodyClassName="px-4 py-4 md:px-6 md:py-5">
        <dl className={billsDetailDlClass}>
          <dt className={billsDetailDtClass}>Bill no.</dt>
          <dd className={billsDetailDdClass}>{bill.bill_no ?? "—"}</dd>
          <dt className={billsDetailDtClass}>Vendor / payee</dt>
          <dd className={billsDetailDdClass}>{bill.vendor_name}</dd>
          <dt className={billsDetailDtClass}>Type</dt>
          <dd className={billsDetailDdClass}>{bill.bill_type}</dd>
          <dt className={billsDetailDtClass}>Project</dt>
          <dd className={billsDetailDdClass}>
            {bill.project_id ? (
              <Link
                className="underline"
                href={financePathWithReturn(
                  `/projects/${bill.project_id}`,
                  drawerReturnTo ?? `/bills/${bill.id}`
                )}
              >
                {bill.project_name ?? "Open project"}
              </Link>
            ) : (
              "—"
            )}
          </dd>
          <dt className={billsDetailDtClass}>Subcontract</dt>
          <dd className={billsDetailDdClass}>
            {bill.project_id && bill.subcontract_id ? (
              <Link
                href={`/projects/${bill.project_id}/subcontracts/${bill.subcontract_id}`}
                className="underline-offset-2 hover:underline"
              >
                {bill.subcontractor_name ?? bill.subcontract_cost_code ?? "Linked subcontract"}
              </Link>
            ) : (
              "—"
            )}
          </dd>
          <dt className={billsDetailDtClass}>Category</dt>
          <dd className={billsDetailDdClass}>{bill.category ?? "—"}</dd>
          <dt className={billsDetailDtClass}>Issue date</dt>
          <dd
            className={cn(
              billsDetailDdClass,
              "tabular-nums font-normal text-[var(--hh-text-secondary)]"
            )}
          >
            {formatDate(bill.issue_date)}
          </dd>
          <dt className={billsDetailDtClass}>Due date</dt>
          <dd
            className={cn(
              billsDetailDdClass,
              "tabular-nums font-normal text-[var(--hh-text-secondary)]"
            )}
          >
            {formatDate(bill.due_date)}
          </dd>
          <dt className={billsDetailDtClass}>Status</dt>
          <dd>
            <StatusBadge label={bill.status} variant={statusVariant} />
          </dd>
        </dl>
      </NeoPanel>

      <section
        className={cn("grid min-w-0 gap-3", drawerReturnTo ? "grid-cols-3" : "sm:grid-cols-3")}
      >
        <KpiTile label="Total amount" value={formatCurrency(bill.amount)} />
        <KpiTile label="Paid amount" value={formatCurrency(bill.paid_amount)} tone="positive" />
        <KpiTile label="Balance" value={formatCurrency(bill.balance_amount)} />
      </section>

      <NeoPanel
        title="Payment history"
        description={payments.length === 0 ? "No payments recorded yet." : undefined}
        action={
          canAddPayment && !drawerReturnTo ? (
            <Button
              variant={drawerReturnTo ? "default" : "outline"}
              size="sm"
              className={drawerReturnTo ? billsPrimaryButtonClass : billsGhostButtonClass}
              onClick={() => setAddPaymentOpen(true)}
            >
              {drawerReturnTo ? "Pay bill" : "Add payment"}
            </Button>
          ) : undefined
        }
        bodyClassName="p-0"
      >
        {payments.length === 0 ? (
          <p className="px-4 py-6 text-hh-table-cell text-[var(--hh-text-secondary)] md:px-6">
            Record a payment when you pay this bill.
          </p>
        ) : (
          <NeoTable
            className="rounded-none border-0 shadow-none"
            tableClassName="min-w-[640px] lg:min-w-0"
          >
            <thead>
              <tr>
                <th className={tableRawThClass}>Payment date</th>
                <th className={cn(tableRawThClass, "text-right tabular-nums")}>Amount</th>
                <th className={tableRawThClass}>Method</th>
                <th className={tableRawThClass}>Reference</th>
                <th className={tableRawThClass}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-[var(--hh-border)] last:border-b-0">
                  <td className={cn(tableRawTdClass, TYPO.date)}>{formatDate(p.payment_date)}</td>
                  <td className={cn(tableRawTdClass, "text-right", TYPO.amount)}>
                    <NeoAmount>{formatCurrency(p.amount)}</NeoAmount>
                  </td>
                  <td className={cn(tableRawTdClass, "text-[var(--hh-text-secondary)]")}>
                    {p.payment_method ?? "—"}
                  </td>
                  <td className={cn(tableRawTdClass, "text-[var(--hh-text-secondary)]")}>
                    {p.reference_no ?? "—"}
                  </td>
                  <td
                    className={cn(
                      tableRawTdClass,
                      "max-w-[200px] truncate text-[var(--hh-text-secondary)]"
                    )}
                    title={p.notes ?? ""}
                  >
                    {p.notes ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </NeoTable>
        )}
      </NeoPanel>

      {bill.notes || drawerReturnTo ? (
        <NeoPanel title="Notes" bodyClassName="px-4 py-4 md:px-6 md:py-5">
          <p className="text-hh-table-cell text-[var(--hh-text-secondary)]">
            {bill.notes || "No notes"}
          </p>
        </NeoPanel>
      ) : null}

      <div
        className={cn(
          "flex flex-wrap items-center gap-2 border-t border-[var(--hh-border)] pt-4",
          "max-md:[&_button]:min-h-11 max-md:[&_a]:min-h-11",
          drawerReturnTo && "order-first border-t-0 pt-0"
        )}
      >
        {drawerReturnTo && canAddPayment ? (
          <Button size="sm" onClick={() => setAddPaymentOpen(true)}>
            Pay bill
          </Button>
        ) : null}
        <Button variant="outline" size="sm" className={billsGhostButtonClass} asChild>
          <Link
            href={financePathWithReturn(
              `/bills/${bill.id}/edit`,
              drawerReturnTo ?? searchParams.get("returnTo")
            )}
          >
            Edit bill
          </Link>
        </Button>
        {drawerReturnTo && !bill.attachment_url ? (
          <p className="text-hh-metadata">No attachments</p>
        ) : null}
        {bill.attachment_url ? (
          <Button
            variant="outline"
            size="sm"
            type="button"
            className={billsGhostButtonClass}
            disabled={!supabase}
            onClick={() => {
              const raw = (bill.attachment_url ?? "").trim();
              if (!raw) return;
              void (async () => {
                const signed = await resolvePreviewSignedUrl({
                  supabase,
                  rawUrlOrPath: raw,
                  ttlSec: 3600,
                  bucketCandidates: [
                    "ap-bills",
                    "bills",
                    "documents",
                    "receipts",
                    "expense-attachments",
                  ],
                });
                openPreview({ url: signed || raw, fileName: "Attachment" });
              })();
            }}
          >
            View attachment
          </Button>
        ) : null}
        {bill.status === "Draft" ? (
          <Button
            variant="outline"
            size="sm"
            className={billsGhostButtonClass}
            onClick={handleApprove}
          >
            Approve
          </Button>
        ) : null}
        {drawerReturnTo && canVoid ? (
          <Button asChild variant="outline" size="sm">
            <Link href={financePathWithReturn(`/bills/${bill.id}`, drawerReturnTo)}>
              Void · review full bill
            </Link>
          </Button>
        ) : null}
        {!drawerReturnTo &&
          canVoid &&
          (!voidConfirm ? (
            <Button
              variant="outline"
              size="sm"
              className={billsGhostButtonClass}
              onClick={() => setVoidConfirm(true)}
            >
              Mark void
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className={billsDestructiveGhostClass}
                onClick={handleVoid}
              >
                Confirm void
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={billsSecondaryButtonClass}
                onClick={() => setVoidConfirm(false)}
              >
                Cancel
              </Button>
            </>
          ))}

        {!drawerReturnTo &&
          bill.status === "Draft" &&
          payments.length === 0 &&
          (!deleteConfirm ? (
            <Button
              variant="outline"
              size="sm"
              className={billsDestructiveGhostClass}
              onClick={() => setDeleteConfirm(true)}
            >
              Delete
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className={billsDestructiveGhostClass}
                onClick={handleDeleteDraft}
              >
                Confirm delete
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={billsSecondaryButtonClass}
                onClick={() => setDeleteConfirm(false)}
              >
                Cancel
              </Button>
            </>
          ))}
      </div>

      <Dialog open={addPaymentOpen} onOpenChange={setAddPaymentOpen}>
        <NeoModal
          title="Add payment"
          description="Apply a payment to this bill."
          className="max-w-md"
          footer={
            <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={billsSecondaryButtonClass}
                onClick={() => setAddPaymentOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="bill-add-payment-form"
                size="sm"
                className={billsPrimaryButtonClass}
                disabled={submitting || !intentStorageKey}
              >
                <SubmitSpinner loading={submitting} className="mr-2" />
                {submitting ? "Saving…" : "Add payment"}
              </Button>
            </div>
          }
        >
          <form id="bill-add-payment-form" onSubmit={handleAddPayment} className="space-y-4">
            <div className="space-y-1.5">
              <NeoFieldLabel required>Payment date</NeoFieldLabel>
              <NeoInput
                disabled={submitting || !intentStorageKey}
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="h-11 rounded-hh-standard tabular-nums"
                required
              />
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel required>Amount</NeoFieldLabel>
              <NeoInput
                disabled={submitting || !intentStorageKey}
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="neo-amount h-11 rounded-hh-standard tabular-nums"
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel>Payment method</NeoFieldLabel>
              <NeoInput
                disabled={submitting || !intentStorageKey}
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="h-11 rounded-hh-standard"
                placeholder="e.g. Check, ACH"
              />
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel>Reference no.</NeoFieldLabel>
              <NeoInput
                disabled={submitting || !intentStorageKey}
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                className="h-11 rounded-hh-standard"
              />
            </div>
            <div className="space-y-1.5">
              <NeoFieldLabel>Notes</NeoFieldLabel>
              <NeoInput
                disabled={submitting || !intentStorageKey}
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                className="h-11 rounded-hh-standard"
              />
            </div>
            {error ? (
              <p className="rounded-hh-standard border border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] px-3 py-2 text-hh-error text-[var(--hh-danger)]">
                {error}
              </p>
            ) : null}
          </form>
        </NeoModal>
      </Dialog>
    </div>
  );
}
