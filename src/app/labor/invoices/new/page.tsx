"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createLaborInvoice, getLaborWorkers } from "@/lib/data";

export default function NewLaborInvoicePage() {
  const router = useRouter();
  const workers = getLaborWorkers();
  const [workerId, setWorkerId] = React.useState("");
  const [invoiceDate, setInvoiceDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = React.useState(0);
  const [memo, setMemo] = React.useState("");

  React.useEffect(() => {
    if (!workerId && workers[0]?.id) setWorkerId(workers[0].id);
  }, [workerId, workers]);

  const handleCreate = () => {
    if (!workerId) return;
    const row = createLaborInvoice({
      workerId,
      invoiceDate,
      amount: Number.isFinite(amount) ? Math.max(0, amount) : 0,
      memo,
    });
    router.push(`/labor/invoices/${row.id}`);
  };

  return (
    <div className="mx-auto max-w-[680px] flex flex-col gap-6 p-6">
      <PageHeader title="New Labor Invoice" description="Create a worker invoice/receipt record." />
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
          <Button variant="outline" className="rounded-lg" onClick={() => router.push("/labor/invoices")}>Cancel</Button>
          <Button className="rounded-lg" onClick={handleCreate} disabled={!workerId}>Create</Button>
        </div>
      </Card>
    </div>
  );
}
