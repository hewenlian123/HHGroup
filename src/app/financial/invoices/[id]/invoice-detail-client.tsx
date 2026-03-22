"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { runOptimisticPersist } from "@/lib/optimistic-save";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase";
import { ArrowLeft, Send, CreditCard, FileText, Trash2 } from "lucide-react";
import { deleteInvoiceAction } from "../actions";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";

type InvoiceStatus = "Draft" | "Sent" | "Partially Paid" | "Paid" | "Void";

type Invoice = {
  id: string;
  invoice_no: string;
  project_id: string | null;
  customer_id: string | null;
  client_name: string;
  issue_date: string;
  due_date: string;
  status: InvoiceStatus;
  notes: string | null;
  tax_pct: number | null;
  subtotal: number | null;
  tax_amount: number | null;
  total: number | null;
  /** Derived from invoice_payments. */
  paidTotal?: number;
  /** Derived from invoice_payments. */
  balanceDue?: number;
};

type InvoiceItem = {
  id: string;
  description: string;
  qty: number | null;
  unit_price: number | null;
  amount: number | null;
};

type InvoicePayment = {
  id: string;
  paid_at: string;
  amount: number;
  method: string | null;
  memo: string | null;
  status: "Posted" | "Voided";
};

const DEFAULT_METHODS = ["ACH", "Check", "Cash", "Zelle", "Card"];

function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function isMissingTableError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "42P01";
}

export default function InvoiceDetailClient() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params?.id as string | undefined;

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [invoice, setInvoice] = React.useState<Invoice | null>(null);
  const [projectName, setProjectName] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<InvoiceItem[]>([]);
  const [payments, setPayments] = React.useState<InvoicePayment[]>([]);

  const [showPaymentModal, setShowPaymentModal] = React.useState(false);
  const [paymentDate, setPaymentDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [paymentAmount, setPaymentAmount] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState(DEFAULT_METHODS[0]);
  const [paymentMemo, setPaymentMemo] = React.useState("");
  const [voidConfirm, setVoidConfirm] = React.useState(false);
  const [deleteConfirm, setDeleteConfirm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const [matchedCustomerId, setMatchedCustomerId] = React.useState<string | null>(null);

  const invoiceRef = React.useRef<Invoice | null>(null);
  const paymentsRef = React.useRef<InvoicePayment[]>([]);
  invoiceRef.current = invoice;
  paymentsRef.current = payments;

  const recomputeInvoiceTotals = React.useCallback((inv: Invoice, pays: InvoicePayment[]) => {
    const totalInv = safeNumber(inv.total);
    const paidTotal = pays.reduce((s, p) => (p.status === "Voided" ? s : s + safeNumber(p.amount)), 0);
    const balanceDue = Math.max(0, totalInv - paidTotal);
    let status: InvoiceStatus = inv.status;
    if (inv.status !== "Void" && inv.status !== "Draft") {
      if (totalInv > 0 && paidTotal >= totalInv) status = "Paid";
      else if (paidTotal > 0) status = "Partially Paid";
      else if (paidTotal === 0 && inv.status === "Paid") status = "Sent";
    }
    return { ...inv, paidTotal, balanceDue, status };
  }, []);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

  const refresh = React.useCallback(async () => {
    if (!id) return;
    if (!supabase) {
      setLoading(false);
      setError(configured ? "Supabase client unavailable." : "Supabase is not configured.");
      return;
    }
    setLoading(true);
    setError(null);

    const { data: inv, error: invErr } = await supabase
      .from("invoices")
      .select("id,invoice_no,project_id,customer_id,client_name,issue_date,due_date,status,notes,tax_pct,subtotal,tax_amount,total")
      .eq("id", id)
      .maybeSingle();

    if (invErr) {
      setError(invErr.message);
      setInvoice(null);
      setItems([]);
      setPayments([]);
      setProjectName(null);
      setLoading(false);
      return;
    }
    if (!inv) {
      setInvoice(null);
      setItems([]);
      setPayments([]);
      setProjectName(null);
      setLoading(false);
      return;
    }

    const [projRes, itemsRes, paysRes] = await Promise.all([
      (inv as { project_id: string | null }).project_id
        ? supabase.from("projects").select("name").eq("id", (inv as { project_id: string }).project_id).maybeSingle()
        : Promise.resolve({ data: null as null, error: null as null }),
      supabase
        .from("invoice_items")
        .select("id,description,qty,unit_price,amount")
        .eq("invoice_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("invoice_payments")
        .select("id,paid_at,amount,method,memo,status")
        .eq("invoice_id", id)
        .order("created_at", { ascending: false }),
    ]);

    if (projRes.error) {
      setProjectName(null);
      if (!isMissingTableError(projRes.error)) setError((prev) => prev ?? projRes.error?.message ?? "Failed to load project.");
    } else {
      setProjectName(((projRes.data as { name?: string } | null)?.name ?? null) as string | null);
    }

    if (itemsRes.error) {
      setItems([]);
      if (!isMissingTableError(itemsRes.error)) {
        setError((prev) => prev ?? itemsRes.error?.message ?? "Failed to load items.");
      }
    } else {
      setItems((itemsRes.data ?? []) as InvoiceItem[]);
    }

    if (paysRes.error) {
      setPayments([]);
      setError((prev) => prev ?? paysRes.error?.message ?? "Failed to load payments.");
    } else {
      setPayments((paysRes.data ?? []) as InvoicePayment[]);
    }

    const totalInv = Number((inv as { total?: number }).total) || 0;
    const paidTotal = (paysRes.data ?? []).reduce((s, p) => {
      const r = p as { amount?: number; status?: string };
      return r.status === "Voided" ? s : s + Number(r.amount ?? 0);
    }, 0);
    setInvoice({ ...(inv as Invoice), paidTotal, balanceDue: Math.max(0, totalInv - paidTotal) });

    setLoading(false);
  }, [configured, id, supabase]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
    [refresh]
  );

  React.useEffect(() => {
    if (searchParams.get("recordPayment") === "1" && invoice && invoice.status !== "Void" && invoice.status !== "Paid") {
      setShowPaymentModal(true);
    }
  }, [searchParams, invoice]);

  React.useEffect(() => {
    const loadMatchedCustomer = async () => {
      if (!supabase || !invoice?.client_name?.trim()) {
        setMatchedCustomerId(null);
        return;
      }
      if (invoice.customer_id) {
        setMatchedCustomerId(invoice.customer_id);
        return;
      }
      const { data, error: matchErr } = await supabase
        .from("customers")
        .select("id")
        .eq("name", invoice.client_name.trim())
        .limit(2);
      if (matchErr || !data || data.length !== 1) {
        setMatchedCustomerId(null);
        return;
      }
      setMatchedCustomerId((data[0] as { id: string }).id);
    };
    void loadMatchedCustomer();
  }, [invoice?.client_name, invoice?.customer_id, supabase]);

  const canPay =
    invoice &&
    invoice.status !== "Void" &&
    invoice.status !== "Paid" &&
    safeNumber(invoice.balanceDue) > 0 &&
    invoice.status !== "Draft";

  const handleMarkSent = () => {
    if (!id || !supabase || !invoiceRef.current || busy) return;
    const inv = invoiceRef.current;
    type Snap = { inv: Invoice };
    runOptimisticPersist<Snap>({
      setBusy,
      getSnapshot: () => ({ inv: { ...inv } }),
      apply: () => {
        setError(null);
        setInvoice((prev) => (prev ? { ...prev, status: "Sent" } : null));
      },
      rollback: (s) => setInvoice(s.inv),
      persist: async () => {
        const { error: updErr } = await supabase.from("invoices").update({ status: "Sent" }).eq("id", id);
        return updErr ? { error: updErr.message } : undefined;
      },
      onError: (msg) => setError(msg),
    });
  };

  const handleVoid = () => {
    if (!id || !supabase || busy) return;
    const inv = invoiceRef.current;
    if (!inv) return;
    type Snap = { inv: Invoice };
    runOptimisticPersist<Snap>({
      setBusy,
      getSnapshot: () => ({ inv: { ...inv } }),
      apply: () => {
        setError(null);
        setVoidConfirm(false);
        setInvoice((prev) => (prev ? { ...prev, status: "Void" } : null));
      },
      rollback: (s) => setInvoice(s.inv),
      persist: async () => {
        const { error: updErr } = await supabase.from("invoices").update({ status: "Void" }).eq("id", id);
        return updErr ? { error: updErr.message } : undefined;
      },
      onError: (msg) => setError(msg),
    });
  };

  const handleRecordPayment = () => {
    if (!id || !supabase || busy || !invoiceRef.current) return;
    const inv = invoiceRef.current;
    const pays = paymentsRef.current;
    const amount = safeNumber(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (inv.status === "Draft" || inv.status === "Void") return;

    const tempId = `temp-pay-${Date.now()}`;
    const newPayment: InvoicePayment = {
      id: tempId,
      paid_at: paymentDate,
      amount,
      method: paymentMethod,
      memo: paymentMemo.trim() || null,
      status: "Posted",
    };
    const nextPays = [newPayment, ...pays];
    const nextInv = recomputeInvoiceTotals(inv, nextPays);

    type Snap = { inv: Invoice; pays: InvoicePayment[]; payAmt: string; payMemo: string; modal: boolean };
    runOptimisticPersist<Snap>({
      setBusy,
      getSnapshot: () => ({
        inv: { ...inv },
        pays: [...pays],
        payAmt: paymentAmount,
        payMemo: paymentMemo,
        modal: showPaymentModal,
      }),
      apply: () => {
        setError(null);
        setPayments(nextPays);
        setInvoice(nextInv);
        setPaymentAmount("");
        setPaymentMemo("");
        setShowPaymentModal(false);
      },
      rollback: (s) => {
        setInvoice(s.inv);
        setPayments(s.pays);
        setPaymentAmount(s.payAmt);
        setPaymentMemo(s.payMemo);
        setShowPaymentModal(s.modal);
      },
      persist: async () => {
        const { data, error: insErr } = await supabase
          .from("invoice_payments")
          .insert({
            invoice_id: id,
            paid_at: paymentDate,
            amount,
            method: paymentMethod,
            memo: paymentMemo.trim() || null,
            status: "Posted",
          })
          .select("id,paid_at,amount,method,memo,status")
          .single();
        if (insErr) return { error: insErr.message };
        const row = data as InvoicePayment;
        flushSync(() => {
          setPayments((prev) => prev.map((p) => (p.id === tempId ? row : p)));
        });
        return undefined;
      },
      onError: (msg) => setError(msg),
    });
  };

  const handleVoidPayment = (paymentId: string) => {
    if (!supabase || busy) return;
    const inv = invoiceRef.current;
    if (!inv) return;
    const pays = paymentsRef.current;
    const target = pays.find((p) => p.id === paymentId);
    if (!target || target.status === "Voided") return;

    const nextPays = pays.map((p) => (p.id === paymentId ? { ...p, status: "Voided" as const } : p));
    const nextInv = recomputeInvoiceTotals(inv, nextPays);

    type Snap = { inv: Invoice; pays: InvoicePayment[] };
    runOptimisticPersist<Snap>({
      setBusy,
      getSnapshot: () => ({ inv: { ...inv }, pays: [...pays] }),
      apply: () => {
        setError(null);
        setPayments(nextPays);
        setInvoice(nextInv);
      },
      rollback: (s) => {
        setInvoice(s.inv);
        setPayments(s.pays);
      },
      persist: async () => {
        const { error: updErr } = await supabase.from("invoice_payments").update({ status: "Voided" }).eq("id", paymentId);
        return updErr ? { error: updErr.message } : undefined;
      },
      onError: (msg) => setError(msg),
    });
  };

  const handleDelete = async () => {
    if (!id || busy) return;
    setBusy(true);
    setError(null);
    const result = await deleteInvoiceAction(id);
    if (result.error) setError(result.error);
    else router.push("/financial/invoices");
    setDeleteConfirm(false);
    setBusy(false);
  };

  if (!id) {
    return (
      <div className="mx-auto max-w-[900px] p-6">
        <p className="text-muted-foreground">Invoice not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/financial/invoices">Back to Invoices</Link>
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[900px] flex flex-col gap-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="mx-auto max-w-[900px] p-6">
        <p className="text-muted-foreground">Invoice not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/financial/invoices">Back to Invoices</Link>
        </Button>
      </div>
    );
  }

  const isDraft = invoice.status === "Draft" || (invoice.status as string)?.toLowerCase() === "draft";
  const isVoid = invoice.status === "Void" || (invoice.status as string)?.toLowerCase() === "void";
  const canDeleteInvoice = isDraft || isVoid;

  return (
    <div className="mx-auto max-w-[900px] flex flex-col gap-6 p-6">
      {error ? (
        <Card className="p-5">
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link href="/financial/invoices" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-foreground">{invoice.invoice_no}</h1>
            <StatusBadge status={invoice.status} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" disabled={busy}>
            <Link href={`/financial/invoices/${id}/print`}>
              <FileText className="h-4 w-4 mr-2" />
              Print
            </Link>
          </Button>
          {canDeleteInvoice ? (
            deleteConfirm ? (
              <>
                <Button variant="destructive" size="sm" disabled={busy} onClick={handleDelete}>
                  Confirm Delete
                </Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDeleteConfirm(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 border-red-200"
                disabled={busy}
                onClick={() => setDeleteConfirm(true)}
              >
                Delete
              </Button>
            )
          ) : null}
          {isDraft ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={handleMarkSent}>
              <Send className="h-4 w-4 mr-2" />
              Mark Sent
            </Button>
          ) : null}
          {canPay ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setShowPaymentModal(true)}>
              <CreditCard className="h-4 w-4 mr-2" />
              Record Payment
            </Button>
          ) : null}
          {!isVoid ? (
            voidConfirm ? (
              <>
                <Button variant="destructive" size="sm" disabled={busy} onClick={handleVoid}>
                  Confirm Void
                </Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setVoidConfirm(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 border-red-200"
                disabled={busy}
                onClick={() => setVoidConfirm(true)}
              >
                Void
              </Button>
            )
          ) : null}
        </div>
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3">Client / Project</h2>
        <p className="text-sm text-muted-foreground">
          {matchedCustomerId ? (
            <Link href={`/customers/${matchedCustomerId}`} className="font-medium text-foreground hover:underline">
              {invoice.client_name}
            </Link>
          ) : (
            <span className="font-medium text-foreground">{invoice.client_name}</span>
          )}
          {" — "}
          {projectName ?? "—"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Issue: {invoice.issue_date} · Due: {invoice.due_date}
        </p>
      </Card>

      <Card className="overflow-hidden">
        <h2 className="text-sm font-semibold text-foreground p-4 pb-2">Line items</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Description</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Qty</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Unit price</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 px-4 text-sm text-muted-foreground text-center">
                    No data yet.
                  </td>
                </tr>
              ) : (
                items.map((line) => (
                  <tr key={line.id} className="border-b border-zinc-100/50 dark:border-border/30">
                    <td className="py-3 px-4 text-foreground">{line.description}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">{safeNumber(line.qty)}</td>
                    <td className="py-3 px-4 text-right tabular-nums text-muted-foreground">{money(safeNumber(line.unit_price))}</td>
                    <td className="py-3 px-4 text-right tabular-nums font-medium">{money(safeNumber(line.amount))}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {isDraft ? (
          <p className="text-xs text-muted-foreground px-4 pb-3">
            Draft invoices can be edited (coming next). Mark Sent to enable payments.
          </p>
        ) : null}
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3">Totals</h2>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{money(safeNumber(invoice.subtotal))}</span>
          </div>
          {safeNumber(invoice.tax_amount) > 0 ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax {invoice.tax_pct != null ? `(${invoice.tax_pct}%)` : ""}</span>
              <span className="tabular-nums">{money(safeNumber(invoice.tax_amount))}</span>
            </div>
          ) : null}
          <div className="flex justify-between font-medium pt-2 border-t border-zinc-200/60 dark:border-border">
            <span>Total</span>
            <span className="tabular-nums">{money(safeNumber(invoice.total))}</span>
          </div>
          <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
            <span>Paid</span>
            <span className="tabular-nums">{money(safeNumber(invoice.paidTotal))}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>Balance due</span>
            <span className="tabular-nums">{money(safeNumber(invoice.balanceDue))}</span>
          </div>
        </div>
      </Card>

      {invoice.notes?.trim() ? (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground mb-2">Notes</h2>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.notes}</p>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <h2 className="text-sm font-semibold text-foreground p-4 pb-2">Payments history</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground px-4 pb-4">No payments recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Date</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">Amount</th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Method</th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Memo</th>
                  <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</th>
                  <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-zinc-100/50 dark:border-border/30">
                    <td className="py-3 px-4 tabular-nums">{p.paid_at}</td>
                    <td
                      className={cn(
                        "py-3 px-4 text-right tabular-nums font-medium",
                        p.status === "Posted" ? "text-emerald-600/90 dark:text-emerald-400/90" : "text-muted-foreground line-through"
                      )}
                    >
                      {money(safeNumber(p.amount))}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{p.method ?? "—"}</td>
                    <td className="py-3 px-4 text-muted-foreground">{p.memo ?? "—"}</td>
                    <td className="py-3 px-4">
                      <span className={cn("text-xs font-medium px-2 py-1 rounded", p.status === "Posted" ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-700")}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {p.status === "Posted" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-red-600 hover:text-red-700"
                          disabled={busy || isVoid}
                          onClick={() => handleVoidPayment(p.id)}
                          title="Void payment"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showPaymentModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowPaymentModal(false)}>
          <Card className="p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-foreground mb-4">Record Payment</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</label>
                <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="mt-1 flex h-10 w-full rounded-[10px] border border-input bg-white px-3 text-sm"
                >
                  {DEFAULT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Memo (optional)</label>
                <Input value={paymentMemo} onChange={(e) => setPaymentMemo(e.target.value)} placeholder="Memo" className="mt-1" />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <Button onClick={handleRecordPayment} disabled={!paymentAmount || safeNumber(paymentAmount) <= 0 || busy || !canPay}>
                Record
              </Button>
              <Button variant="outline" onClick={() => setShowPaymentModal(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {!configured ? (
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Supabase is not configured.</p>
        </Card>
      ) : null}
    </div>
  );
}

