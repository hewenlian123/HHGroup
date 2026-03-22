"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AttachmentPreviewDialog } from "@/components/attachment-preview-dialog";
import {
  getLaborInvoice,
  updateLaborInvoice,
  confirmLaborInvoice,
  markLaborInvoiceReviewed,
  voidLaborInvoice,
  addLaborInvoiceAttachment,
  deleteLaborInvoiceAttachment,
  getWorkers,
  getProjects,
  type LaborInvoice,
  type Attachment,
} from "@/lib/data";
import { ArrowLeft, Download, Eye, Plus, Trash2 } from "lucide-react";

function makeAttachment(file: File): Attachment {
  return {
    id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    url: URL.createObjectURL(file),
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

export default function LaborInvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string | undefined;
  const [invoice, setInvoice] = React.useState<LaborInvoice | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = React.useState<Attachment | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [workers, setWorkers] = React.useState<Awaited<ReturnType<typeof getWorkers>>>([]);
  const [projects, setProjects] = React.useState<Awaited<ReturnType<typeof getProjects>>>([]);

  const refresh = React.useCallback(async () => {
    if (!id) return;
    const inv = await getLaborInvoice(id);
    setInvoice(inv ?? null);
  }, [id]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([getWorkers(), getProjects()]).then(([w, p]) => {
      if (!cancelled) {
        setWorkers(w);
        setProjects(p);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const reloadLookups = React.useCallback(async () => {
    const [w, p] = await Promise.all([getWorkers(), getProjects()]);
    setWorkers(w);
    setProjects(p);
  }, []);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
      void reloadLookups();
    }, [refresh, reloadLookups]),
    [refresh, reloadLookups]
  );

  if (!id || !invoice) {
    return (
      <div className="mx-auto max-w-[900px] flex flex-col gap-6 p-6">
        <p className="text-muted-foreground">Labor invoice not found.</p>
        <Button
          variant="outline"
          className="rounded-lg w-fit"
          onClick={() => router.push("/labor/invoices")}
        >
          Back to list
        </Button>
      </div>
    );
  }

  const isReadOnly = invoice.status === "confirmed" || invoice.status === "void";
  const splitTotal = invoice.projectSplits.reduce((sum, split) => sum + split.amount, 0);
  const remaining = invoice.amount - splitTotal;
  const isRemainingZero = Math.abs(remaining) <= 0.005;
  const allChecked =
    invoice.checklist.verifiedWorker &&
    invoice.checklist.verifiedAmount &&
    invoice.checklist.verifiedAllocation &&
    invoice.checklist.verifiedAttachment;
  const validSplitRows = invoice.projectSplits.every((s) => !!s.projectId && s.amount > 0);
  const canConfirm =
    invoice.status !== "void" &&
    invoice.status !== "confirmed" &&
    invoice.amount > 0 &&
    isRemainingZero &&
    allChecked &&
    validSplitRows;

  const handleHeaderSave = (
    patch: Partial<Pick<LaborInvoice, "workerId" | "invoiceDate" | "amount" | "memo">>
  ) => {
    updateLaborInvoice(invoice.id, patch);
    refresh();
  };

  const handleSaveDraft = () => {
    updateLaborInvoice(invoice.id, { status: "draft" });
    setMessage("Saved as draft.");
    refresh();
  };

  const handleMarkReviewed = () => {
    markLaborInvoiceReviewed(invoice.id);
    setMessage("Invoice marked reviewed.");
    refresh();
  };

  const handleSplitChange = (idx: number, patch: { projectId?: string; amount?: number }) => {
    const next = invoice.projectSplits.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    updateLaborInvoice(invoice.id, { projectSplits: next });
    refresh();
  };

  const handleSplitAdd = () => {
    updateLaborInvoice(invoice.id, {
      projectSplits: [...invoice.projectSplits, { projectId: "", amount: 0 }],
    });
    refresh();
  };

  const handleSplitRemove = (idx: number) => {
    updateLaborInvoice(invoice.id, {
      projectSplits: invoice.projectSplits.filter((_, i) => i !== idx),
    });
    refresh();
  };

  const handleChecklist = (patch: Partial<LaborInvoice["checklist"]>) => {
    updateLaborInvoice(invoice.id, {
      checklist: { ...invoice.checklist, ...patch },
    });
    refresh();
  };

  const handleConfirm = () => {
    if (!canConfirm) return;
    const next = confirmLaborInvoice(invoice.id);
    if (!next) {
      setMessage("Confirm blocked. Ensure checklist is complete and splits match amount.");
      return;
    }
    setMessage("Invoice confirmed.");
    refresh();
  };

  const handleVoid = () => {
    if (!window.confirm("Void this invoice?")) return;
    voidLaborInvoice(invoice.id);
    setMessage("Invoice voided.");
    refresh();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    for (let i = 0; i < files.length; i++) {
      addLaborInvoiceAttachment(invoice.id, makeAttachment(files[i]));
    }
    e.target.value = "";
    refresh();
  };

  const handleDeleteAttachment = (att: Attachment) => {
    if (att.url.startsWith("blob:")) URL.revokeObjectURL(att.url);
    deleteLaborInvoiceAttachment(invoice.id, att.id);
    refresh();
  };

  return (
    <div className="mx-auto max-w-[1100px] flex flex-col gap-6 p-6">
      <div className="flex items-center gap-4">
        <Link
          href="/labor/invoices"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </div>

      {message ? (
        <p className="border-b border-[#EBEBE9] pb-3 text-sm text-muted-foreground dark:border-border">
          {message}
        </p>
      ) : null}

      <section className="border-b border-[#EBEBE9] pb-6 dark:border-border">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Invoice #
            </p>
            <p className="text-lg font-semibold text-foreground">{invoice.invoiceNo}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/50" />
            {invoice.status}
          </span>
        </div>
        <div className="mb-5 flex flex-wrap gap-2">
          <Button size="sm" className="rounded-sm" onClick={handleSaveDraft} disabled={isReadOnly}>
            Save
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-sm"
            onClick={handleMarkReviewed}
            disabled={isReadOnly}
          >
            Mark Reviewed
          </Button>
          <Button size="sm" className="rounded-sm" onClick={handleConfirm} disabled={!canConfirm}>
            Confirm
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-sm"
            onClick={handleVoid}
            disabled={invoice.status === "void"}
          >
            Void
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Worker
            </label>
            <Select
              value={invoice.workerId}
              onChange={(e) => handleHeaderSave({ workerId: e.target.value })}
              disabled={isReadOnly}
            >
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Date
            </label>
            <Input
              type="date"
              value={invoice.invoiceDate}
              onChange={(e) => handleHeaderSave({ invoiceDate: e.target.value })}
              className="rounded-sm"
              disabled={isReadOnly}
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
              value={invoice.amount}
              onChange={(e) => handleHeaderSave({ amount: Number(e.target.value) || 0 })}
              disabled={isReadOnly}
              className="rounded-sm"
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Status
            </label>
            <div className="flex h-10 items-center">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/50" />
                {invoice.status}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-1.5">
          <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Memo
          </label>
          <textarea
            value={invoice.memo ?? ""}
            onChange={(e) => handleHeaderSave({ memo: e.target.value })}
            disabled={isReadOnly}
            className="min-h-[88px] rounded-sm border border-[#EBEBE9] bg-background px-3 py-2 text-sm dark:border-border"
          />
        </div>
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          Do not confirm invoice if the same labor is already confirmed via daily entries.
        </p>
      </section>

      <section className="border-b border-[#EBEBE9] pb-6 dark:border-border">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Attachments</h2>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          variant="outline"
          size="sm"
          className="rounded-sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isReadOnly}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Attachment
        </Button>
        <ul className="mt-3 space-y-2">
          {invoice.attachments.map((att) => (
            <li
              key={att.id}
              className="flex items-center gap-2 border border-[#EBEBE9] p-3 dark:border-border"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{att.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {att.size > 1024 ? `${(att.size / 1024).toFixed(1)} KB` : `${att.size} B`}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => {
                  setPreviewAttachment(att);
                  setPreviewOpen(true);
                }}
                aria-label="Preview"
              >
                <Eye className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = att.url;
                  a.download = att.fileName;
                  a.click();
                }}
                aria-label="Download"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive"
                onClick={() => handleDeleteAttachment(att)}
                aria-label="Delete"
                disabled={isReadOnly}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-b border-[#EBEBE9] pb-6 dark:border-border">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Split Allocation</h2>
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-sm"
            onClick={handleSplitAdd}
            disabled={isReadOnly}
          >
            + Add line
          </Button>
        </div>
        <div className="mt-4 space-y-3">
          {invoice.projectSplits.map((split, idx) => (
            <div
              key={`${split.projectId}-${idx}`}
              className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_160px_auto]"
            >
              <Select
                value={split.projectId}
                onChange={(e) => handleSplitChange(idx, { projectId: e.target.value })}
                disabled={isReadOnly}
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={split.amount}
                onChange={(e) => handleSplitChange(idx, { amount: Number(e.target.value) || 0 })}
                disabled={isReadOnly}
                className="rounded-sm text-right tabular-nums"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-10 rounded-sm"
                onClick={() => handleSplitRemove(idx)}
                disabled={isReadOnly}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Split Total:{" "}
          {new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 2,
          }).format(splitTotal)}
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Remaining:{" "}
          <span
            className={
              isRemainingZero
                ? "font-medium text-emerald-600 dark:text-emerald-400"
                : "font-medium text-amber-600 dark:text-amber-400"
            }
          >
            {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 2,
            }).format(remaining)}
          </span>
        </p>
      </section>

      <section className="pb-2">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Review Checklist</h2>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={invoice.checklist.verifiedWorker}
              onChange={(e) => handleChecklist({ verifiedWorker: e.target.checked })}
              disabled={isReadOnly}
            />
            Verified worker
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={invoice.checklist.verifiedAmount}
              onChange={(e) => handleChecklist({ verifiedAmount: e.target.checked })}
              disabled={isReadOnly}
            />
            Verified amount
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={invoice.checklist.verifiedAllocation}
              onChange={(e) => handleChecklist({ verifiedAllocation: e.target.checked })}
              disabled={isReadOnly}
            />
            Verified allocation
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={invoice.checklist.verifiedAttachment}
              onChange={(e) => handleChecklist({ verifiedAttachment: e.target.checked })}
              disabled={isReadOnly}
            />
            Verified attachment
          </label>
        </div>
        <div className="mt-4">
          <Button size="sm" className="rounded-sm" onClick={handleConfirm} disabled={!canConfirm}>
            Confirm
          </Button>
          {!canConfirm ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Confirm requires Remaining = 0 and all checklist items checked.
            </p>
          ) : null}
        </div>
      </section>

      <AttachmentPreviewDialog
        attachment={previewAttachment}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </div>
  );
}
