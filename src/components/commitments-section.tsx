"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getCommitments,
  createCommitment,
  updateCommitment,
  deleteCommitment,
  getVendors,
  type Commitment,
  type CommitmentType,
  type CommitmentStatus,
  type ExpenseAttachment,
} from "@/lib/data";
import { AttachmentPreviewDialog } from "@/components/attachment-preview-dialog";
import { Download, Eye, Pencil, Plus, Trash2, Camera } from "lucide-react";
import { cn } from "@/lib/utils";

function makeAttachment(file: File): ExpenseAttachment {
  const url = URL.createObjectURL(file);
  return {
    id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    url,
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

function formatMoney(n: number): string {
  return `$${Math.abs(n).toLocaleString()}`;
}

export function CommitmentsSection({
  projectId,
  actualSpent,
  budgetCostBaseline,
}: {
  projectId: string;
  actualSpent: number;
  budgetCostBaseline: number;
}) {
  const [rows, setRows] = React.useState<Commitment[]>([]);
  const [vendors, setVendors] = React.useState<string[]>([]);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Commitment | null>(null);
  const [previewAttachment, setPreviewAttachment] = React.useState<ExpenseAttachment | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);

  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [vendorName, setVendorName] = React.useState("");
  const [type, setType] = React.useState<CommitmentType>("PO");
  const [amount, setAmount] = React.useState("");
  const [status, setStatus] = React.useState<CommitmentStatus>("Open");
  const [notes, setNotes] = React.useState("");
  const [attachments, setAttachments] = React.useState<ExpenseAttachment[]>([]);
  const uploadRef = React.useRef<HTMLInputElement>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const [list, v] = await Promise.all([getCommitments(projectId), getVendors(true)]);
      if (cancelled) return;
      setRows(list);
      setVendors(v);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const refresh = React.useCallback(async () => {
    const list = await getCommitments(projectId);
    setRows(list);
  }, [projectId]);

  const resetForm = React.useCallback(() => {
    setDate(new Date().toISOString().slice(0, 10));
    setVendorName("");
    setType("PO");
    setAmount("");
    setStatus("Open");
    setNotes("");
    setAttachments([]);
    setEditing(null);
  }, []);

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (row: Commitment) => {
    setEditing(row);
    setDate(row.date);
    setVendorName(row.vendorName);
    setType(row.type);
    setAmount(String(row.amount));
    setStatus(row.status);
    setNotes(row.notes ?? "");
    setAttachments([...(row.attachments ?? [])]);
    setOpen(true);
  };

  const handleDelete = async (row: Commitment) => {
    await deleteCommitment(row.id);
    await refresh();
  };

  const handleSave = async () => {
    const parsedAmount = parseFloat(amount);
    if (!date || !vendorName.trim() || Number.isNaN(parsedAmount) || parsedAmount < 0) return;
    if (editing) {
      await updateCommitment(editing.id, {
        date,
        vendorName: vendorName.trim(),
        type,
        amount: parsedAmount,
        status,
        notes: notes.trim() || undefined,
        attachments,
      });
    } else {
      await createCommitment({
        projectId,
        date,
        vendorName: vendorName.trim(),
        type,
        amount: parsedAmount,
        status,
        notes: notes.trim() || undefined,
        attachments,
      });
    }
    setOpen(false);
    resetForm();
    await refresh();
  };

  const handleUploadFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const next: ExpenseAttachment[] = [];
    for (let i = 0; i < files.length; i++) next.push(makeAttachment(files[i]));
    setAttachments((prev) => [...prev, ...next]);
  };

  const totalCommitted = rows.filter((r) => r.status === "Open").reduce((s, r) => s + r.amount, 0);
  const totalCost = actualSpent + totalCommitted;
  const remainingBudget = budgetCostBaseline - totalCost;

  return (
    <section>
      <Card className="overflow-hidden p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Committed Cost</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Open commitments are tracked separately from spent cost (internal only).
            </p>
          </div>
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Commitment
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="rounded-md border border-border/60 bg-background px-3 py-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Total Committed
            </p>
            <p className="text-base font-semibold tabular-nums text-amber-700 dark:text-amber-400">
              {formatMoney(totalCommitted)}
            </p>
          </div>
          <div className="rounded-md border border-border/60 bg-background px-3 py-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Total Spent
            </p>
            <p className="text-base font-semibold tabular-nums text-foreground">
              {formatMoney(actualSpent)}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200/60 dark:border-border bg-card px-3 py-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Cost</p>
            <p className="text-base font-semibold tabular-nums text-foreground">
              {formatMoney(totalCost)}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200/60 dark:border-border bg-card px-3 py-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Remaining Budget
            </p>
            <p
              className={cn(
                "text-base font-semibold tabular-nums",
                remainingBudget < 0 ? "text-red-600 dark:text-red-400" : "text-foreground"
              )}
            >
              {remainingBudget < 0 ? "−" : ""}
              {formatMoney(remainingBudget)}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-zinc-200/60 dark:border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200/40 dark:border-border/60 bg-muted/30">
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Date
                </th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Vendor
                </th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Type
                </th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">
                  Amount
                </th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Status
                </th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Notes
                </th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Attachment
                </th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-muted-foreground">
                    No commitments yet
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-zinc-100/50 dark:border-border/30">
                    <td className="py-3 px-4 tabular-nums">{row.date}</td>
                    <td className="py-3 px-4 font-medium text-foreground">{row.vendorName}</td>
                    <td className="py-3 px-4 text-muted-foreground">{row.type}</td>
                    <td className="py-3 px-4 text-right tabular-nums font-medium">
                      {formatMoney(row.amount)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={cn(
                          "inline-block text-xs font-medium px-2 py-1 rounded",
                          row.status === "Open"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400"
                            : "bg-[#DCFCE7] text-[#166534] dark:bg-emerald-900/40 dark:text-emerald-400"
                        )}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td
                      className="py-3 px-4 text-muted-foreground max-w-[220px] truncate"
                      title={row.notes ?? undefined}
                    >
                      {row.notes ?? "—"}
                    </td>
                    <td className="py-3 px-4">
                      {row.attachments?.length ? (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="btn-outline-ghost h-8"
                            onClick={() => {
                              setPreviewAttachment(row.attachments[0]);
                              setPreviewOpen(true);
                            }}
                            title="Preview"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="btn-outline-ghost h-8"
                            onClick={() => {
                              const att = row.attachments[0];
                              const a = document.createElement("a");
                              a.href = att.url;
                              a.download = att.fileName;
                              a.click();
                            }}
                            title="Download"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <span className="text-xs text-muted-foreground">
                            {row.attachments.length}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="btn-outline-ghost h-8"
                          onClick={() => openEdit(row)}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="btn-outline-ghost h-8 text-red-600 hover:text-red-700"
                          onClick={() => handleDelete(row)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <Card className="p-6 w-full max-w-xl mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-foreground mb-4">
              {editing ? "Edit Commitment" : "New Commitment"}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Date
                </label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Vendor
                </label>
                <Input
                  list="commitment-vendors"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  className="mt-1"
                  placeholder="Vendor"
                />
                <datalist id="commitment-vendors">
                  {vendors.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Type
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as CommitmentType)}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  <option value="PO">PO</option>
                  <option value="Subcontract">Subcontract</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Amount
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1 rounded-lg"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as CommitmentStatus)}
                  className="mt-1 flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm"
                >
                  <option value="Open">Open</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Notes
                </label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 rounded-lg"
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Attachment
              </label>
              <input
                ref={uploadRef}
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleUploadFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  handleUploadFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <div className="mt-1 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => uploadRef.current?.click()}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Upload
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => cameraRef.current?.click()}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Camera
                </Button>
              </div>
              {attachments.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {attachments.map((att) => (
                    <li
                      key={att.id}
                      className="flex items-center justify-between text-xs border rounded px-2 py-1 border-zinc-200/60 dark:border-border"
                    >
                      <span className="truncate max-w-[260px]">{att.fileName}</span>
                      <button
                        type="button"
                        className="text-red-600 hover:underline"
                        onClick={() =>
                          setAttachments((prev) => prev.filter((a) => a.id !== att.id))
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex gap-2 mt-6">
              <Button
                className="rounded-lg"
                onClick={handleSave}
                disabled={!vendorName.trim() || !amount}
              >
                Save
              </Button>
              <Button variant="outline" className="rounded-lg" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}

      <AttachmentPreviewDialog
        attachment={previewAttachment}
        open={previewOpen}
        onOpenChange={(v) => {
          setPreviewOpen(v);
          if (!v) setPreviewAttachment(null);
        }}
      />
    </section>
  );
}
