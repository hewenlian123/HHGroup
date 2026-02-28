"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AttachmentPreviewDialog } from "@/components/attachment-preview-dialog";
import {
  addPaymentMethod,
  createLaborPayment,
  deleteLaborPayment,
  getLaborPayRunRows,
  getPaymentMethods,
  getProjects,
  type Attachment,
} from "@/lib/data";
import { Download, Eye } from "lucide-react";

function makeAttachment(file: File): Attachment {
  return {
    id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    fileName: file.name,
    mimeType: file.type,
    url: URL.createObjectURL(file),
    size: file.size,
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

function last7DaysStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
}

export default function LaborPaymentsPage() {
  const [startDate, setStartDate] = React.useState(last7DaysStart);
  const [endDate, setEndDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [projectId, setProjectId] = React.useState("");
  const [rows, setRows] = React.useState(() => getLaborPayRunRows(last7DaysStart(), new Date().toISOString().slice(0, 10)));
  const [expandedWorkerId, setExpandedWorkerId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const [modalWorkerId, setModalWorkerId] = React.useState<string | null>(null);
  const [paymentDate, setPaymentDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = React.useState(0);
  const [method, setMethod] = React.useState("");
  const [memo, setMemo] = React.useState("");
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [methodQuickAdd, setMethodQuickAdd] = React.useState("");
  const [modalWarning, setModalWarning] = React.useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = React.useState<Attachment | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const paymentMethods = getPaymentMethods();
  const projects = getProjects();

  React.useEffect(() => {
    setRows(getLaborPayRunRows(startDate, endDate, projectId || undefined));
  }, [startDate, endDate, projectId]);

  React.useEffect(() => {
    if (!method && paymentMethods[0]) setMethod(paymentMethods[0]);
  }, [method, paymentMethods]);

  const refresh = React.useCallback(() => {
    setRows(getLaborPayRunRows(startDate, endDate, projectId || undefined));
  }, [startDate, endDate, projectId]);

  const openModal = (workerId: string, balance: number) => {
    setModalWorkerId(workerId);
    setAmount(Math.max(0, balance));
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setMemo("");
    setAttachments([]);
    setMethodQuickAdd("");
    setModalWarning(null);
  };

  const savePayment = () => {
    if (!modalWorkerId || !method) return;
    if (amount <= 0) {
      setModalWarning("Amount must be greater than 0.");
      return;
    }
    const worker = rows.find((r) => r.workerId === modalWorkerId);
    if (!worker) return;
    const appliedAmount = Math.min(amount, worker.balance);
    if (amount > worker.balance) setModalWarning("Amount exceeded balance. Applied amount was clamped to balance.");
    createLaborPayment({
      workerId: modalWorkerId,
      paymentDate,
      amount: appliedAmount,
      method,
      memo: memo.trim() || undefined,
      attachments,
      appliedRange: { startDate, endDate },
    });
    setModalWorkerId(null);
    setMessage("Payment recorded.");
    refresh();
  };

  const modalWorker = rows.find((r) => r.workerId === modalWorkerId);
  const kpiTotalDue = rows.reduce((sum, r) => sum + r.confirmedTotal, 0);
  const kpiTotalPaid = rows.reduce((sum, r) => sum + r.paidTotal, 0);
  const kpiOutstanding = rows.reduce((sum, r) => sum + r.balance, 0);

  return (
    <div className="page-container page-stack py-6">
      <PageHeader title="Labor Payments" description="Weekly pay run summary from confirmed labor only." />

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

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="rounded-xl border border-zinc-200/60 dark:border-border p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Due</p>
          <p className="text-lg font-semibold tabular-nums mt-1">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(kpiTotalDue)}
          </p>
        </Card>
        <Card className="rounded-xl border border-zinc-200/60 dark:border-border p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Paid</p>
          <p className="text-lg font-semibold tabular-nums mt-1">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(kpiTotalPaid)}
          </p>
        </Card>
        <Card className="rounded-xl border border-zinc-200/60 dark:border-border p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Outstanding</p>
          <p className="text-lg font-semibold tabular-nums mt-1">
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(kpiOutstanding)}
          </p>
        </Card>
      </div>

      {message ? (
        <div className="rounded-lg border border-zinc-200/60 dark:border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {message}
        </div>
      ) : null}

      <Card className="rounded-2xl border border-zinc-200/60 dark:border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Worker</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Confirmed Total</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Paid Total</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Balance</th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <React.Fragment key={row.workerId}>
                  <tr className="border-b border-zinc-100/50 dark:border-border/30">
                    <td className="py-3 px-4 font-medium text-foreground">
                      <button type="button" className="hover:underline" onClick={() => setExpandedWorkerId((prev) => (prev === row.workerId ? null : row.workerId))}>
                        {row.workerName}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums">
                      {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(row.confirmedTotal)}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums">
                      {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(row.paidTotal)}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums">
                      {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(row.balance)}
                    </td>
                    <td className="py-3 px-4">
                      <span className={row.balance > 0 ? "inline-flex rounded-full px-2 py-0.5 text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "inline-flex rounded-full px-2 py-0.5 text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"}>
                        {row.balance > 0 ? "Outstanding" : "Paid"}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" className="rounded-lg h-8" onClick={() => setExpandedWorkerId((prev) => (prev === row.workerId ? null : row.workerId))}>
                          {expandedWorkerId === row.workerId ? "Hide History" : "History"}
                        </Button>
                        <Button size="sm" className="rounded-lg h-8" onClick={() => openModal(row.workerId, row.balance)} disabled={row.balance <= 0}>
                          Record Payment
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {expandedWorkerId === row.workerId ? (
                    <tr className="border-b border-zinc-100/50 dark:border-border/30 bg-muted/20">
                      <td className="py-3 px-4 text-xs text-muted-foreground" colSpan={6}>
                        <div className="space-y-3">
                          <div className="rounded-lg border border-zinc-200/60 dark:border-border px-3 py-2 bg-background/60">
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Pay Run Source</p>
                            <div className="space-y-1">
                              <div className="flex justify-between gap-4">
                                <span>Daily confirmed</span>
                                <span className="tabular-nums">
                                  {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(row.confirmedDailyTotal)}
                                </span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span>Invoice confirmed</span>
                                <span className="tabular-nums">
                                  {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(row.confirmedInvoiceTotal)}
                                </span>
                              </div>
                              <div className="flex justify-between gap-4 font-medium text-foreground pt-1 border-t border-zinc-200/60 dark:border-border">
                                <span>Confirmed total</span>
                                <span className="tabular-nums">
                                  {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(row.confirmedTotal)}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div>
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Payment History</p>
                            {row.payments.length === 0 ? (
                              <span>No payments in selected range.</span>
                            ) : (
                              <ul className="space-y-1">
                                {row.payments.map((p) => (
                                  <li key={p.id} className="flex justify-between gap-4">
                                    <span>{p.paymentDate} • {p.method} {p.memo ? `• ${p.memo}` : ""}</span>
                                    <span className="tabular-nums">
                                      {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(p.amount)}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      {p.attachments.length ? (
                                        <>
                                          <button
                                            type="button"
                                            className="text-muted-foreground hover:text-foreground"
                                            onClick={() => {
                                              setPreviewAttachment(p.attachments[0]);
                                              setPreviewOpen(true);
                                            }}
                                            aria-label="Preview attachment"
                                          >
                                            <Eye className="h-3.5 w-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            className="text-muted-foreground hover:text-foreground"
                                            onClick={() => {
                                              const a = document.createElement("a");
                                              a.href = p.attachments[0].url;
                                              a.download = p.attachments[0].fileName;
                                              a.click();
                                            }}
                                            aria-label="Download attachment"
                                          >
                                            <Download className="h-3.5 w-3.5" />
                                          </button>
                                        </>
                                      ) : (
                                        <span className="text-[11px]">No attachments</span>
                                      )}
                                      <button
                                        type="button"
                                        className="text-destructive hover:underline text-[11px]"
                                        onClick={() => {
                                          if (!window.confirm("Delete this payment?")) return;
                                          deleteLaborPayment(p.id);
                                          refresh();
                                        }}
                                      >
                                        Delete
                                      </button>
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {modalWorkerId ? (
        <div className="fixed inset-0 z-50 bg-black/40 p-4 flex items-center justify-center">
          <Card className="w-full max-w-[560px] rounded-2xl border border-zinc-200/60 dark:border-border p-6">
            <h3 className="text-base font-semibold text-foreground">Record Payment — {modalWorker?.workerName ?? "Worker"}</h3>
            <p className="text-xs text-muted-foreground mt-1">Applied range: {startDate} to {endDate}</p>
            <div className="mt-4 grid gap-3">
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="rounded-lg" />
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} className="rounded-lg text-right tabular-nums" />
              <select value={method} onChange={(e) => setMethod(e.target.value)} className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm">
                {paymentMethods.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <Input value={methodQuickAdd} onChange={(e) => setMethodQuickAdd(e.target.value)} placeholder="Quick add payment method" className="rounded-lg" />
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-lg"
                  onClick={() => {
                    const added = addPaymentMethod(methodQuickAdd);
                    if (!added) return;
                    setMethod(added);
                    setMethodQuickAdd("");
                  }}
                >
                  Add
                </Button>
              </div>
              <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Memo (optional)" className="rounded-lg" />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = e.target.files;
                  if (!files?.length) return;
                  const added: Attachment[] = [];
                  for (let i = 0; i < files.length; i++) added.push(makeAttachment(files[i]));
                  setAttachments((prev) => [...prev, ...added]);
                  e.target.value = "";
                }}
              />
              <Button variant="outline" className="rounded-lg" onClick={() => fileInputRef.current?.click()}>
                Add Attachment
              </Button>
              {attachments.length ? (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {attachments.map((a) => (
                    <li key={a.id} className="flex justify-between">
                      <span className="truncate">{a.fileName}</span>
                      <span className="flex items-center gap-2">
                        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => { setPreviewAttachment(a); setPreviewOpen(true); }}>
                          Preview
                        </button>
                        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => {
                          const link = document.createElement("a");
                          link.href = a.url;
                          link.download = a.fileName;
                          link.click();
                        }}>
                          Download
                        </button>
                        <button type="button" className="text-amber-700 dark:text-amber-400" onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}>
                          Remove
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {modalWarning ? <p className="text-xs text-amber-600 dark:text-amber-400">{modalWarning}</p> : null}
              {modalWorker && amount > 0 && Math.abs(Math.min(amount, modalWorker.balance) - modalWorker.balance) < 0.005 ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">Will mark as Paid</p>
              ) : null}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" className="rounded-lg" onClick={() => setModalWorkerId(null)}>Cancel</Button>
              <Button className="rounded-lg" onClick={savePayment} disabled={amount <= 0}>Save Payment</Button>
            </div>
          </Card>
        </div>
      ) : null}

      <AttachmentPreviewDialog attachment={previewAttachment} open={previewOpen} onOpenChange={setPreviewOpen} />
    </div>
  );
}
