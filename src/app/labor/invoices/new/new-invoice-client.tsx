"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBrowserClient } from "@/lib/supabase";

type WorkerOption = { id: string; name: string };

async function getNextInvoiceNo(supabase: NonNullable<ReturnType<typeof createBrowserClient>>): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `LI-${year}-`;
  const { data, error } = await supabase
    .from("labor_invoices")
    .select("invoice_no")
    .like("invoice_no", `${prefix}%`)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return `${prefix}001`;
  let maxSeq = 0;
  for (const row of data ?? []) {
    const no = (row as { invoice_no: string }).invoice_no;
    const m = new RegExp(`^LI-\\d{4}-(\\d+)$`).exec(no);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
}

export default function NewLaborInvoiceClient() {
  const router = useRouter();
  const [workers, setWorkers] = React.useState<WorkerOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [workerId, setWorkerId] = React.useState("");
  const [invoiceDate, setInvoiceDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = React.useState(0);
  const [memo, setMemo] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

  const load = React.useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      setError(configured ? "Supabase client unavailable." : "Supabase is not configured.");
      return;
    }
    setLoading(true);
    const { data, error: err } = await supabase
      .from("workers")
      .select("id,name")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(500);
    if (err) setError(err.message);
    else setWorkers((data ?? []).map((w) => ({ id: (w as { id: string }).id, name: (w as { name: string }).name ?? "" })));
    setLoading(false);
  }, [supabase, configured]);

  React.useEffect(() => {
    void load();
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  React.useEffect(() => {
    if (!workerId && workers[0]?.id) setWorkerId(workers[0].id);
  }, [workerId, workers]);

  const handleCreate = async () => {
    if (!workerId || !supabase) return;
    setSubmitting(true);
    setError(null);
    try {
      const invoiceNo = await getNextInvoiceNo(supabase);
      const { data, error: insErr } = await supabase
        .from("labor_invoices")
        .insert({
          invoice_no: invoiceNo,
          worker_id: workerId,
          invoice_date: invoiceDate,
          amount: Number.isFinite(amount) ? Math.max(0, amount) : 0,
          memo: memo.trim() || null,
          status: "draft",
          project_splits: [],
          checklist: { verifiedWorker: false, verifiedAmount: false, verifiedAllocation: false, verifiedAttachment: false },
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      const id = (data as { id: string }).id;
      router.push(`/labor/invoices/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create invoice.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[680px] flex flex-col gap-6 p-6">
        <PageHeader title="New Labor Invoice" description="Create a worker invoice/receipt record." />
        <Card className="rounded-2xl border border-zinc-200/60 dark:border-border p-6">
          <div className="h-48 flex items-center justify-center text-muted-foreground">Loading…</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[680px] flex flex-col gap-6 p-6">
      <PageHeader title="New Labor Invoice" description="Create a worker invoice/receipt record." />
      {error ? (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}
      <Card className="rounded-2xl border border-zinc-200/60 dark:border-border p-6">
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Worker</label>
            <select
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
              className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Select worker</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Invoice Date</label>
            <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="rounded-lg" />
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Amount</label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} className="rounded-lg" />
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Memo</label>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} className="min-h-[88px] rounded-lg border border-input bg-transparent px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" className="rounded-lg" onClick={() => router.push("/labor/invoices")} disabled={submitting}>Cancel</Button>
          <Button className="rounded-lg" onClick={handleCreate} disabled={!workerId || submitting}>Create</Button>
        </div>
      </Card>
    </div>
  );
}
