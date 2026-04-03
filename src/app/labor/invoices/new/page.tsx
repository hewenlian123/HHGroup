"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createLaborInvoice, getLaborWorkers } from "@/lib/data";

export default function NewLaborInvoicePage() {
  const router = useRouter();
  const [workers, setWorkers] = React.useState<{ id: string; name: string }[]>([]);
  const [workerId, setWorkerId] = React.useState("");
  const [invoiceDate, setInvoiceDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = React.useState(0);
  const [memo, setMemo] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    getLaborWorkers().then((list) => {
      if (!cancelled) setWorkers(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!workerId && workers[0]?.id) setWorkerId(workers[0].id);
  }, [workerId, workers]);

  const handleCreate = async () => {
    if (!workerId) return;
    const row = await createLaborInvoice({
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
      <section className="border-b border-[#E5E7EB] pb-6 dark:border-border">
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
              className="min-h-[88px] rounded-sm border border-[#E5E7EB] bg-background px-3 py-2 text-sm dark:border-border"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-sm"
            onClick={() => router.push("/labor/invoices")}
          >
            Cancel
          </Button>
          <Button size="sm" className="rounded-sm" onClick={handleCreate} disabled={!workerId}>
            Create
          </Button>
        </div>
      </section>
    </div>
  );
}
