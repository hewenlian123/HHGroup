"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { addSubcontractAction } from "./actions";

type Subcontractor = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  projectId: string;
  subcontractors: Subcontractor[];
};

export function AddSubcontractModal({
  open,
  onOpenChange,
  onSuccess,
  projectId,
  subcontractors,
}: Props) {
  const [subcontractorId, setSubcontractorId] = React.useState("");
  const [costCode, setCostCode] = React.useState("");
  const [contractAmount, setContractAmount] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const reset = React.useCallback(() => {
    setSubcontractorId("");
    setCostCode("");
    setContractAmount("");
    setDescription("");
    setStartDate("");
    setEndDate("");
    setError(null);
  }, []);

  React.useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subcontractorId.trim()) {
      setError("Subcontractor is required.");
      return;
    }
    const amount = parseFloat(contractAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a valid contract amount.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await addSubcontractAction({
        project_id: projectId,
        subcontractor_id: subcontractorId,
        cost_code: costCode.trim() || null,
        contract_amount: amount,
        description: description.trim() || null,
        start_date: startDate.trim() || null,
        end_date: endDate.trim() || null,
      });
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add subcontract.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-border/60 p-5 rounded-md gap-4">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Add Subcontract</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Subcontractor (required)
            </label>
            <select
              value={subcontractorId}
              onChange={(e) => setSubcontractorId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              required
            >
              <option value="">Select subcontractor</option>
              {subcontractors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Cost Code</label>
            <Input
              value={costCode}
              onChange={(e) => setCostCode(e.target.value)}
              placeholder="Cost code"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Contract Amount (required)
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={contractAmount}
              onChange={(e) => setContractAmount(e.target.value)}
              className="h-9 text-sm tabular-nums"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Start Date</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">End Date</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-9 items-center rounded-md border border-input bg-foreground px-3 text-sm text-background hover:bg-foreground/90 disabled:opacity-50"
            >
              <SubmitSpinner loading={busy} className="mr-2" />
              {busy ? "Saving…" : "Add Subcontract"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
