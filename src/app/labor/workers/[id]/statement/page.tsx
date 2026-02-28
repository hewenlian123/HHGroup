"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AttachmentPreviewDialog } from "@/components/attachment-preview-dialog";
import {
  getProjects,
  getWorkerById,
  getWorkerEarningsAllocations,
  getWorkerLaborInvoices,
  getWorkerPayments,
  type Attachment,
} from "@/lib/data";

function last7DaysStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
}

export default function WorkerStatementPage() {
  const params = useParams();
  const id = params?.id as string | undefined;
  const worker = id ? getWorkerById(id) : null;
  const [startDate, setStartDate] = React.useState(last7DaysStart);
  const [endDate, setEndDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [projectId, setProjectId] = React.useState("");
  const [previewAttachment, setPreviewAttachment] = React.useState<Attachment | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);

  const projects = getProjects();
  const earningsRows = React.useMemo(
    () => (id ? getWorkerEarningsAllocations(id, startDate, endDate, projectId || undefined) : []),
    [id, startDate, endDate, projectId]
  );
  const payments = React.useMemo(() => (id ? getWorkerPayments(id, startDate, endDate) : []), [id, startDate, endDate]);
  const invoices = React.useMemo(() => (id ? getWorkerLaborInvoices(id, startDate, endDate) : []), [id, startDate, endDate]);

  if (!id || !worker) {
    return (
      <div className="mx-auto max-w-[1080px] p-6">
        <p className="text-muted-foreground">Worker not found.</p>
      </div>
    );
  }

  const earningsTotal = earningsRows.reduce((s, r) => s + r.amount, 0);
  const paidTotal = payments.reduce((s, p) => s + p.amount, 0);
  const balance = Math.max(0, earningsTotal - paidTotal);

  return (
    <div className="mx-auto max-w-[1180px] flex flex-col gap-6 p-6">
      <PageHeader title="Worker Statement" description="Confirmed earnings, payment history, and balance." />

      <div className="grid gap-3 sm:grid-cols-3">
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-lg" />
        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-lg" />
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div className="flex justify-end gap-2">
        <Link href={`/labor/workers/${id}/statement/print?start=${startDate}&end=${endDate}&project=${projectId}`}>
          <Button className="rounded-lg">Print Statement</Button>
        </Link>
      </div>

      <Card className="rounded-2xl border border-zinc-200/60 dark:border-border p-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">HH Group</p>
        <h2 className="text-xl font-semibold text-foreground mt-1">Worker Statement</h2>
        <p className="text-sm text-muted-foreground mt-2">
          {worker.name} {worker.trade ? `• ${worker.trade}` : ""} {worker.phone ? `• ${worker.phone}` : ""}
        </p>
        <p className="text-sm text-muted-foreground">Period: {startDate} to {endDate}</p>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="rounded-xl border border-zinc-200/60 dark:border-border p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Earnings</p>
          <p className="text-lg font-semibold tabular-nums mt-1">${earningsTotal.toLocaleString()}</p>
        </Card>
        <Card className="rounded-xl border border-zinc-200/60 dark:border-border p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Paid</p>
          <p className="text-lg font-semibold tabular-nums mt-1">${paidTotal.toLocaleString()}</p>
        </Card>
        <Card className="rounded-xl border border-zinc-200/60 dark:border-border p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Balance</p>
          <p className="text-lg font-semibold tabular-nums mt-1">${balance.toLocaleString()}</p>
        </Card>
      </div>

      <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200/60 dark:border-border">
          <h3 className="text-sm font-semibold text-foreground">Earnings Detail (Confirmed)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Date</th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Project</th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Shift</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Amount</th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {earningsRows.map((r, idx) => (
                <tr key={`${r.date}-${r.projectId}-${r.shift}-${idx}`} className="border-b border-zinc-100/50 dark:border-border/30">
                  <td className="py-3 px-4 tabular-nums">{r.date}</td>
                  <td className="py-3 px-4">{r.projectName}</td>
                  <td className="py-3 px-4">{r.shift}</td>
                  <td className="py-3 px-4 text-right tabular-nums">${r.amount.toLocaleString()}</td>
                  <td className="py-3 px-4 text-muted-foreground">{r.notes ?? "—"}</td>
                </tr>
              ))}
              {earningsRows.length === 0 ? (
                <tr>
                  <td className="py-8 px-4 text-center text-muted-foreground" colSpan={5}>No confirmed earnings in selected range.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200/60 dark:border-border">
          <h3 className="text-sm font-semibold text-foreground">Payments</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Payment Date</th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Method</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Amount</th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Memo</th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Attachments</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-zinc-100/50 dark:border-border/30">
                  <td className="py-3 px-4 tabular-nums">{p.paymentDate}</td>
                  <td className="py-3 px-4">{p.method}</td>
                  <td className="py-3 px-4 text-right tabular-nums">${p.amount.toLocaleString()}</td>
                  <td className="py-3 px-4 text-muted-foreground">{p.memo ?? "—"}</td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2 flex-wrap">
                      {p.attachments.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          className="text-xs px-2 py-1 rounded-md border border-zinc-200/60 dark:border-border hover:bg-muted"
                          onClick={() => {
                            setPreviewAttachment(a);
                            setPreviewOpen(true);
                          }}
                        >
                          {a.fileName}
                        </button>
                      ))}
                      {p.attachments.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : null}
                    </div>
                  </td>
                </tr>
              ))}
              {payments.length === 0 ? (
                <tr>
                  <td className="py-8 px-4 text-center text-muted-foreground" colSpan={5}>No payments in selected range.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200/60 dark:border-border">
          <h3 className="text-sm font-semibold text-foreground">Worker Invoices / Receipts</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Invoice #</th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Date</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Amount</th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Attachments</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-zinc-100/50 dark:border-border/30">
                  <td className="py-3 px-4">{inv.invoiceNo}</td>
                  <td className="py-3 px-4 tabular-nums">{inv.invoiceDate}</td>
                  <td className="py-3 px-4 text-right tabular-nums">${inv.amount.toLocaleString()}</td>
                  <td className="py-3 px-4">{inv.status}</td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2 flex-wrap">
                      {inv.attachments.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          className="text-xs px-2 py-1 rounded-md border border-zinc-200/60 dark:border-border hover:bg-muted"
                          onClick={() => {
                            setPreviewAttachment(a);
                            setPreviewOpen(true);
                          }}
                        >
                          {a.fileName}
                        </button>
                      ))}
                      {inv.attachments.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : null}
                    </div>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 ? (
                <tr>
                  <td className="py-8 px-4 text-center text-muted-foreground" colSpan={5}>No invoices/receipts in selected range.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <AttachmentPreviewDialog attachment={previewAttachment} open={previewOpen} onOpenChange={setPreviewOpen} />
    </div>
  );
}
