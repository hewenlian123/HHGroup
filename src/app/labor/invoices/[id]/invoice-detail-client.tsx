"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase";
import { ArrowLeft, Plus } from "lucide-react";

type LaborInvoiceStatus = "draft" | "reviewed" | "confirmed" | "void";

type ProjectSplit = { projectId: string; amount: number };
type Checklist = { verifiedWorker: boolean; verifiedAmount: boolean; verifiedAllocation: boolean; verifiedAttachment: boolean };

type InvoiceState = {
  id: string;
  invoiceNo: string;
  workerId: string;
  invoiceDate: string;
  amount: number;
  memo: string | null;
  status: LaborInvoiceStatus;
  projectSplits: ProjectSplit[];
  checklist: Checklist;
  attachments: never[];
};

type WorkerOption = { id: string; name: string };
type ProjectOption = { id: string; name: string };

function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normChecklist(c: unknown): Checklist {
  if (c && typeof c === "object" && "verifiedWorker" in c) {
    const o = c as Record<string, unknown>;
    return {
      verifiedWorker: !!o.verifiedWorker,
      verifiedAmount: !!o.verifiedAmount,
      verifiedAllocation: !!o.verifiedAllocation,
      verifiedAttachment: !!o.verifiedAttachment,
    };
  }
  return { verifiedWorker: false, verifiedAmount: false, verifiedAllocation: false, verifiedAttachment: false };
}

function normSplits(s: unknown): ProjectSplit[] {
  if (!Array.isArray(s)) return [];
  return s.map((x) => ({
    projectId: typeof (x as { projectId?: string }).projectId === "string" ? (x as { projectId: string }).projectId : "",
    amount: safeNumber((x as { amount?: unknown }).amount),
  }));
}

export default function LaborInvoiceDetailClient() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string | undefined;
  const [invoice, setInvoice] = React.useState<InvoiceState | null>(null);
  const [workers, setWorkers] = React.useState<WorkerOption[]>([]);
  const [projects, setProjects] = React.useState<ProjectOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

  const refresh = React.useCallback(async () => {
    if (!id || !supabase) return;
    setLoading(true);
    setError(null);
    const [
      { data: invData, error: invErr },
      { data: workerData },
      { data: projectData },
    ] = await Promise.all([
      supabase.from("labor_invoices").select("*").eq("id", id).maybeSingle(),
      supabase.from("workers").select("id,name").order("created_at", { ascending: false }).limit(500),
      supabase.from("projects").select("id,name").order("created_at", { ascending: false }).limit(500),
    ]);
    if (invErr) {
      setError(invErr.message);
      setInvoice(null);
    } else if (invData) {
      const row = invData as { id: string; invoice_no: string; worker_id: string; invoice_date: string; amount?: unknown; memo?: string | null; status: string; project_splits?: unknown; checklist?: unknown };
      setInvoice({
        id: row.id,
        invoiceNo: row.invoice_no,
        workerId: row.worker_id,
        invoiceDate: row.invoice_date,
        amount: safeNumber(row.amount),
        memo: row.memo ?? null,
        status: row.status as LaborInvoiceStatus,
        projectSplits: normSplits(row.project_splits),
        checklist: normChecklist(row.checklist),
        attachments: [],
      });
    } else {
      setInvoice(null);
    }
    setWorkers((workerData ?? []).map((w) => ({ id: (w as { id: string }).id, name: (w as { name: string }).name ?? "" })));
    setProjects((projectData ?? []).map((p) => ({ id: (p as { id: string }).id, name: (p as { name: string }).name ?? "" })));
    setLoading(false);
  }, [id, supabase]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateInvoice = React.useCallback(
    async (patch: {
      worker_id?: string;
      invoice_date?: string;
      amount?: number;
      memo?: string | null;
      status?: string;
      project_splits?: ProjectSplit[];
      checklist?: Checklist;
    }) => {
      if (!supabase || !id) return;
      const payload = { ...patch };
      if (patch.status === "confirmed") {
        (payload as Record<string, unknown>).confirmed_at = new Date().toISOString();
      }
      const { error: upErr } = await supabase.from("labor_invoices").update(payload).eq("id", id);
      if (upErr) setError(upErr.message);
      await refresh();
    },
    [id, supabase, refresh]
  );

  if (!id) {
    return (
      <div className="mx-auto max-w-[900px] flex flex-col gap-6 p-6">
        <p className="text-muted-foreground">Invalid invoice id.</p>
        <Button variant="outline" className="rounded-lg w-fit" onClick={() => router.push("/labor/invoices")}>
          Back to list
        </Button>
      </div>
    );
  }

  if (loading && !invoice) {
    return (
      <div className="mx-auto max-w-[1100px] flex flex-col gap-6 p-6">
        <Link href="/labor/invoices" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="mx-auto max-w-[900px] flex flex-col gap-6 p-6">
        <p className="text-muted-foreground">Labor invoice not found.</p>
        <Button variant="outline" className="rounded-lg w-fit" onClick={() => router.push("/labor/invoices")}>
          Back to list
        </Button>
      </div>
    );
  }

  const isReadOnly = invoice.status === "confirmed" || invoice.status === "void";
  const splitTotal = invoice.projectSplits.reduce((sum, s) => sum + s.amount, 0);
  const remaining = invoice.amount - splitTotal;
  const isRemainingZero = Math.abs(remaining) <= 0.005;
  const allChecked =
    invoice.checklist.verifiedWorker &&
    invoice.checklist.verifiedAmount &&
    invoice.checklist.verifiedAllocation &&
    invoice.checklist.verifiedAttachment;
  const validSplitRows = invoice.projectSplits.every((s) => !!s.projectId && s.amount > 0);
  const canConfirm = invoice.status !== "void" && invoice.status !== "confirmed" && invoice.amount > 0 && isRemainingZero && allChecked && validSplitRows;

  const handleHeaderSave = (patch: { workerId?: string; invoiceDate?: string; amount?: number; memo?: string }) => {
    const up: { worker_id?: string; invoice_date?: string; amount?: number; memo?: string | null } = {};
    if (patch.workerId !== undefined) up.worker_id = patch.workerId;
    if (patch.invoiceDate !== undefined) up.invoice_date = patch.invoiceDate;
    if (patch.amount !== undefined) up.amount = patch.amount;
    if (patch.memo !== undefined) up.memo = patch.memo || null;
    updateInvoice(up);
  };

  const handleSaveDraft = () => {
    updateInvoice({ status: "draft" });
    setMessage("Saved as draft.");
  };

  const handleMarkReviewed = () => {
    updateInvoice({ status: "reviewed" });
    setMessage("Invoice marked reviewed.");
  };

  const handleSplitChange = (idx: number, patch: { projectId?: string; amount?: number }) => {
    const next = invoice.projectSplits.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    updateInvoice({ project_splits: next });
  };

  const handleSplitAdd = () => {
    updateInvoice({ project_splits: [...invoice.projectSplits, { projectId: "", amount: 0 }] });
  };

  const handleSplitRemove = (idx: number) => {
    updateInvoice({ project_splits: invoice.projectSplits.filter((_, i) => i !== idx) });
  };

  const handleChecklist = (patch: Partial<Checklist>) => {
    updateInvoice({ checklist: { ...invoice.checklist, ...patch } });
  };

  const handleConfirm = () => {
    if (!canConfirm) return;
    updateInvoice({ status: "confirmed", checklist: invoice.checklist });
    setMessage("Invoice confirmed.");
  };

  const handleVoid = () => {
    if (!window.confirm("Void this invoice?")) return;
    updateInvoice({ status: "void" });
    setMessage("Invoice voided.");
  };

  return (
    <div className="mx-auto max-w-[1100px] flex flex-col gap-6 p-6">
      <div className="flex items-center gap-4">
        <Link href="/labor/invoices" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-lg border border-zinc-200/60 dark:border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {message}
        </div>
      ) : null}

      <Card className="rounded-2xl border border-zinc-200/60 dark:border-border p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Invoice #</p>
            <p className="text-lg font-semibold text-foreground">{invoice.invoiceNo}</p>
          </div>
          <span className="inline-flex rounded-full px-2 py-0.5 text-xs bg-zinc-200/70 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{invoice.status}</span>
        </div>
        <div className="mb-5 flex flex-wrap gap-2">
          <Button className="rounded-lg" onClick={handleSaveDraft} disabled={isReadOnly}>Save</Button>
          <Button variant="outline" className="rounded-lg" onClick={handleMarkReviewed} disabled={isReadOnly}>Mark Reviewed</Button>
          <Button className="rounded-lg" onClick={handleConfirm} disabled={!canConfirm}>Confirm</Button>
          <Button variant="outline" className="rounded-lg" onClick={handleVoid} disabled={invoice.status === "void"}>Void</Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Worker</label>
            <select
              value={invoice.workerId}
              onChange={(e) => handleHeaderSave({ workerId: e.target.value })}
              disabled={isReadOnly}
              className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm"
            >
              {workers.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Date</label>
            <Input type="date" value={invoice.invoiceDate} onChange={(e) => handleHeaderSave({ invoiceDate: e.target.value })} className="rounded-lg" disabled={isReadOnly} />
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Amount</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={invoice.amount}
              onChange={(e) => handleHeaderSave({ amount: Number(e.target.value) || 0 })}
              disabled={isReadOnly}
              className="rounded-lg"
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Status</label>
            <div className="h-10 flex items-center">
              <span className="inline-flex rounded-full px-2 py-0.5 text-xs bg-zinc-200/70 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{invoice.status}</span>
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-1.5">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Memo</label>
          <textarea
            value={invoice.memo ?? ""}
            onChange={(e) => handleHeaderSave({ memo: e.target.value })}
            disabled={isReadOnly}
            className="min-h-[88px] rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
          />
        </div>
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          Do not confirm invoice if the same labor is already confirmed via daily entries.
        </p>
      </Card>

      <Card className="rounded-2xl border border-zinc-200/60 dark:border-border p-6">
        <h2 className="text-sm font-semibold text-foreground mb-3">Attachments</h2>
        <Button variant="outline" className="rounded-lg" disabled={isReadOnly}>
          <Plus className="h-4 w-4 mr-2" />
          Add Attachment
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">Attachment storage not yet configured.</p>
        {invoice.attachments.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No attachments.</p>
        ) : null}
      </Card>

      <Card className="rounded-2xl border border-zinc-200/60 dark:border-border p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Split Allocation</h2>
          <Button size="sm" variant="outline" className="rounded-lg h-8" onClick={handleSplitAdd} disabled={isReadOnly}>+ Add line</Button>
        </div>
        <div className="mt-4 space-y-3">
          {invoice.projectSplits.map((split, idx) => (
            <div key={`${split.projectId}-${idx}`} className="grid grid-cols-1 sm:grid-cols-[1fr_160px_auto] gap-2 items-center">
              <select
                value={split.projectId}
                onChange={(e) => handleSplitChange(idx, { projectId: e.target.value })}
                disabled={isReadOnly}
                className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={split.amount}
                onChange={(e) => handleSplitChange(idx, { amount: Number(e.target.value) || 0 })}
                disabled={isReadOnly}
                className="rounded-lg text-right tabular-nums"
              />
              <Button size="sm" variant="outline" className="rounded-lg h-10" onClick={() => handleSplitRemove(idx)} disabled={isReadOnly}>Remove</Button>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Split Total: {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(splitTotal)}
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Remaining:{" "}
          <span className={isRemainingZero ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-amber-600 dark:text-amber-400 font-medium"}>
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(remaining)}
          </span>
        </p>
      </Card>

      <Card className="rounded-2xl border border-zinc-200/60 dark:border-border p-6">
        <h2 className="text-sm font-semibold text-foreground mb-3">Review Checklist</h2>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={invoice.checklist.verifiedWorker} onChange={(e) => handleChecklist({ verifiedWorker: e.target.checked })} disabled={isReadOnly} />
            Verified worker
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={invoice.checklist.verifiedAmount} onChange={(e) => handleChecklist({ verifiedAmount: e.target.checked })} disabled={isReadOnly} />
            Verified amount
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={invoice.checklist.verifiedAllocation} onChange={(e) => handleChecklist({ verifiedAllocation: e.target.checked })} disabled={isReadOnly} />
            Verified allocation
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={invoice.checklist.verifiedAttachment} onChange={(e) => handleChecklist({ verifiedAttachment: e.target.checked })} disabled={isReadOnly} />
            Verified attachment
          </label>
        </div>
        <div className="mt-4">
          <Button onClick={handleConfirm} disabled={!canConfirm} className="rounded-lg">
            Confirm
          </Button>
          {!canConfirm ? (
            <p className="text-xs text-muted-foreground mt-2">Confirm requires Remaining = 0 and all checklist items checked.</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
