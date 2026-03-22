"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createBrowserClient } from "@/lib/supabase";

type WorkerOption = { id: string; name: string };

async function getNextInvoiceNo(
  supabase: NonNullable<ReturnType<typeof createBrowserClient>>
): Promise<string> {
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
    else
      setWorkers(
        (data ?? []).map((w) => ({
          id: (w as { id: string }).id,
          name: (w as { name: string }).name ?? "",
        }))
      );
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
          checklist: {
            verifiedWorker: false,
            verifiedAmount: false,
            verifiedAllocation: false,
            verifiedAttachment: false,
          },
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
        <PageHeader
          title="New Labor Invoice"
          description="Create a worker invoice/receipt record."
        />
        <section className="border-b border-[#EBEBE9] py-12 text-center text-muted-foreground dark:border-border">
          Loading…
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[680px] flex flex-col gap-6 p-6">
      <PageHeader title="New Labor Invoice" description="Create a worker invoice/receipt record." />
      {error ? (
        <p className="border-b border-red-200/80 pb-3 text-sm text-red-700 dark:border-red-900 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <section className="border-b border-[#EBEBE9] pb-6 dark:border-border">
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Worker
            </label>
            <Select value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
              <option value="">Select worker</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Invoice Date
            </label>
            <Input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="rounded-sm"
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Amount
            </label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              className="rounded-sm"
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Memo
            </label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="min-h-[88px] rounded-sm border border-[#EBEBE9] bg-background px-3 py-2 text-sm dark:border-border"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-sm"
            onClick={() => router.push("/labor/invoices")}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="rounded-sm"
            onClick={handleCreate}
            disabled={!workerId || submitting}
          >
            Create
          </Button>
        </div>
      </section>
    </div>
  );
}
