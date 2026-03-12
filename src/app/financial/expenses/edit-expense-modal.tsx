"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { updateExpenseForReview, getExpenseTotal, type Expense } from "@/lib/data";
import { useToast } from "@/components/toast/toast-provider";

type ProjectOption = { id: string; name: string | null };
type WorkerOption = { id: string; name: string };

type Props = {
  expense: Expense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  workers: WorkerOption[];
  categories: string[];
  onSuccess: () => void;
};

export function EditExpenseModal({ expense, open, onOpenChange, projects, workers, categories, onSuccess }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = React.useState(false);
  const [vendorName, setVendorName] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [projectId, setProjectId] = React.useState<string | null>(null);
  const [workerId, setWorkerId] = React.useState<string | null>(null);
  const [category, setCategory] = React.useState("Other");
  const [notes, setNotes] = React.useState("");
  const [status, setStatus] = React.useState<"pending" | "needs_review" | "approved" | "reimbursed">("needs_review");

  React.useEffect(() => {
    if (expense) {
      setVendorName(expense.vendorName ?? "");
      setAmount(String(getExpenseTotal(expense)));
      setProjectId(expense.lines[0]?.projectId ?? null);
      setWorkerId(expense.workerId ?? null);
      setCategory(expense.lines[0]?.category ?? "Other");
      setNotes(expense.notes ?? "");
      setStatus((expense.status as "pending" | "needs_review" | "approved" | "reimbursed") ?? "needs_review");
    }
  }, [expense]);

  const handleSave = async () => {
    if (!expense) return;
    setSaving(true);
    try {
      const numAmount = parseFloat(amount);
      if (Number.isNaN(numAmount) || numAmount < 0) {
        toast({ title: "Invalid amount", variant: "error" });
        return;
      }
      await updateExpenseForReview(expense.id, {
        vendorName: vendorName.trim() || undefined,
        amount: numAmount,
        projectId: projectId || null,
        workerId: workerId || null,
        category: category || "Other",
        notes: notes.trim() || undefined,
        status,
      });
      toast({ title: "Expense updated", variant: "success" });
      onSuccess();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Update failed", description: e instanceof Error ? e.message : "Unknown error", variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border/60">
        <DialogHeader className="border-b border-border/60 pb-2">
          <DialogTitle className="text-base font-medium">Edit Expense</DialogTitle>
        </DialogHeader>
        {expense ? (
          <div className="space-y-3 py-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Vendor</label>
              <Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} className="mt-1 h-9" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 h-9 tabular-nums" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Project</label>
              <select
                value={projectId ?? ""}
                onChange={(e) => setProjectId(e.target.value || null)}
                className="mt-1 h-9 w-full rounded border border-input bg-transparent px-2 text-sm"
              >
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name ?? p.id}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Worker</label>
              <select
                value={workerId ?? ""}
                onChange={(e) => setWorkerId(e.target.value || null)}
                className="mt-1 h-9 w-full rounded border border-input bg-transparent px-2 text-sm"
              >
                <option value="">—</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 h-9 w-full rounded border border-input bg-transparent px-2 text-sm"
              >
                {["Other", ...categories].filter((c, i, a) => a.indexOf(c) === i).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 h-9" placeholder="Optional" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "pending" | "needs_review" | "approved" | "reimbursed")}
                className="mt-1 h-9 w-full rounded border border-input bg-transparent px-2 text-sm"
              >
                <option value="pending">Pending</option>
                <option value="needs_review">Needs Review</option>
                <option value="approved">Approved</option>
                <option value="reimbursed">Reimbursed</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" className="h-8" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button size="sm" className="h-8" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
