"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { SubcontractBillRow } from "@/lib/data";
import {
  deleteSubcontractBillDraftAction,
  recordSubcontractPaymentAction,
  updateSubcontractBillAction,
  voidSubcontractBillAction,
} from "./actions";

export function BillRowActions({
  projectId,
  subcontractId,
  bill,
}: {
  projectId: string;
  subcontractId: string;
  bill: SubcontractBillRow;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [payOpen, setPayOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [billDate, setBillDate] = React.useState(bill.bill_date);
  const [dueDate, setDueDate] = React.useState(bill.due_date ?? "");
  const [amount, setAmount] = React.useState(String(bill.amount ?? 0));
  const [description, setDescription] = React.useState(bill.description ?? "");

  const [paymentDate, setPaymentDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [paymentAmount, setPaymentAmount] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState("");
  const [paymentNote, setPaymentNote] = React.useState("");

  React.useEffect(() => {
    setBillDate(bill.bill_date);
    setDueDate(bill.due_date ?? "");
    setAmount(String(bill.amount ?? 0));
    setDescription(bill.description ?? "");
  }, [bill.amount, bill.bill_date, bill.description, bill.due_date]);

  const isDraft = bill.status === "Pending";
  const isApproved = bill.status === "Approved";

  const handleEditSave = async () => {
    if (busy) return;
    const num = parseFloat(amount);
    if (!Number.isFinite(num) || num < 0) {
      setError("Enter a valid amount.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await updateSubcontractBillAction(projectId, subcontractId, bill.id, {
      bill_date: billDate,
      due_date: dueDate.trim() || null,
      amount: num,
      description: description.trim() || null,
    });
    if (res.ok) {
      setEditOpen(false);
      router.refresh();
    } else {
      setError(res.error ?? "Failed to update.");
    }
    setBusy(false);
  };

  const handleDelete = async () => {
    if (busy) return;
    if (!window.confirm("Delete this bill?")) return;
    setBusy(true);
    setError(null);
    const res = await deleteSubcontractBillDraftAction(projectId, subcontractId, bill.id);
    if (res.ok) router.refresh();
    else setError(res.error ?? "Failed to delete.");
    setBusy(false);
  };

  const handleVoid = async () => {
    if (busy) return;
    if (!window.confirm("Void this bill?")) return;
    setBusy(true);
    setError(null);
    const res = await voidSubcontractBillAction(projectId, subcontractId, bill.id);
    if (res.ok) router.refresh();
    else setError(res.error ?? "Failed to void.");
    setBusy(false);
  };

  const handleRecordPayment = async () => {
    if (busy) return;
    const num = parseFloat(paymentAmount);
    if (!Number.isFinite(num) || num <= 0) {
      setError("Enter a valid payment amount.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await recordSubcontractPaymentAction(projectId, subcontractId, {
      subcontract_id: subcontractId,
      bill_id: bill.id,
      payment_date: paymentDate,
      amount: num,
      method: paymentMethod.trim() || null,
      note: paymentNote.trim() || null,
    });
    if (res.ok) {
      setPayOpen(false);
      setPaymentAmount("");
      setPaymentMethod("");
      setPaymentNote("");
      router.refresh();
    } else {
      setError(res.error ?? "Failed to record payment.");
    }
    setBusy(false);
  };

  return (
    <div className="flex items-center justify-end gap-2">
      {isDraft ? (
        <>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditOpen(true)}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600" onClick={handleDelete} disabled={busy}>
            Delete
          </Button>
        </>
      ) : null}
      {isApproved ? (
        <>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPayOpen(true)}>
            Record payment
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={handleVoid} disabled={busy}>
            Void
          </Button>
        </>
      ) : null}
      {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit bill</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Bill date</label>
              <Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} className="mt-1 h-9" required />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Due date</label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1 h-9" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Amount</label>
              <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 h-9" required />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 h-9" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleEditSave} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Payment date</label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="mt-1 h-9" required />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Amount</label>
              <Input type="number" step="0.01" min="0" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="mt-1 h-9" required />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Method</label>
              <Input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="mt-1 h-9" placeholder="e.g. ACH, Check" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Note</label>
              <Input value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} className="mt-1 h-9" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setPayOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleRecordPayment} disabled={busy}>
              {busy ? "Saving…" : "Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

