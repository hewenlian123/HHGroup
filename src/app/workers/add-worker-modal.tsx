"use client";

import * as React from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import {
  NeoFieldLabel,
  NeoFormGrid,
  NeoInput,
  NeoModal,
  NeoSelect,
  neoFormErrorClassName,
  neoFormFieldClassName,
} from "@/components/base";
import { createWorkerAction } from "./actions";
import type { WorkerStatus, WorkerRow } from "@/lib/workers-db";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (worker: WorkerRow) => void;
};

export function AddWorkerModal({ open, onOpenChange, onSuccess }: Props) {
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [trade, setTrade] = React.useState("");
  const [dailyRate, setDailyRate] = React.useState("");
  const [defaultOtRate, setDefaultOtRate] = React.useState("");
  const [status, setStatus] = React.useState<WorkerStatus>("Active");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const fieldIdPrefix = React.useId().replace(/:/g, "");
  const formId = `${fieldIdPrefix}-add-worker-form`;

  const reset = React.useCallback(() => {
    setName("");
    setPhone("");
    setTrade("");
    setDailyRate("");
    setDefaultOtRate("");
    setStatus("Active");
    setNotes("");
    setError(null);
  }, []);

  React.useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await createWorkerAction({
        name: name.trim(),
        phone: phone.trim() || null,
        trade: trade.trim() || null,
        daily_rate: Number(dailyRate) || 0,
        default_ot_rate: Number(defaultOtRate) || 0,
        status,
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        setError(res.error ?? "Failed to add worker.");
        return;
      }
      onOpenChange(false);
      onSuccess(res.worker);
      const detailPath = `/workers/${encodeURIComponent(res.worker.id)}`;
      window.location.assign(detailPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add worker.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <NeoModal
        title="Add Worker"
        description="Create a worker profile with the current daily rate used by labor entries."
        className="max-w-[480px]"
        bodyClassName="space-y-3"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              className="min-h-10 rounded-md"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" form={formId} disabled={busy} className="min-h-10 rounded-md">
              <SubmitSpinner loading={busy} className="mr-2" />
              {busy ? "Saving..." : "Add Worker"}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={handleSubmit} className="grid gap-3">
          <div className={neoFormFieldClassName}>
            <NeoFieldLabel htmlFor={`${fieldIdPrefix}-name`} required>
              Name
            </NeoFieldLabel>
            <NeoInput
              id={`${fieldIdPrefix}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Worker name"
              required
              disabled={busy}
            />
          </div>
          <NeoFormGrid>
            <div className={neoFormFieldClassName}>
              <NeoFieldLabel htmlFor={`${fieldIdPrefix}-phone`}>Phone</NeoFieldLabel>
              <NeoInput
                id={`${fieldIdPrefix}-phone`}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone"
                disabled={busy}
              />
            </div>
            <div className={neoFormFieldClassName}>
              <NeoFieldLabel htmlFor={`${fieldIdPrefix}-trade`}>Trade</NeoFieldLabel>
              <NeoInput
                id={`${fieldIdPrefix}-trade`}
                value={trade}
                onChange={(e) => setTrade(e.target.value)}
                placeholder="Trade"
                disabled={busy}
              />
            </div>
          </NeoFormGrid>
          <NeoFormGrid>
            <div className={neoFormFieldClassName}>
              <NeoFieldLabel htmlFor={`${fieldIdPrefix}-daily-rate`}>Daily Rate</NeoFieldLabel>
              <NeoInput
                id={`${fieldIdPrefix}-daily-rate`}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={dailyRate}
                onChange={(e) => setDailyRate(e.target.value)}
                placeholder="0"
                disabled={busy}
              />
            </div>
            <div className={neoFormFieldClassName}>
              <NeoFieldLabel htmlFor={`${fieldIdPrefix}-default-ot-rate`}>
                Default OT Rate
              </NeoFieldLabel>
              <NeoInput
                id={`${fieldIdPrefix}-default-ot-rate`}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={defaultOtRate}
                onChange={(e) => setDefaultOtRate(e.target.value)}
                placeholder="0"
                disabled={busy}
              />
            </div>
          </NeoFormGrid>
          <div className={neoFormFieldClassName}>
            <NeoFieldLabel htmlFor={`${fieldIdPrefix}-status`}>Status</NeoFieldLabel>
            <NeoSelect
              id={`${fieldIdPrefix}-status`}
              value={status}
              onChange={(e) => setStatus(e.target.value as WorkerStatus)}
              disabled={busy}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </NeoSelect>
          </div>
          <div className={neoFormFieldClassName}>
            <NeoFieldLabel htmlFor={`${fieldIdPrefix}-notes`}>Notes</NeoFieldLabel>
            <NeoInput
              id={`${fieldIdPrefix}-notes`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes"
              disabled={busy}
            />
          </div>
          {error ? <p className={neoFormErrorClassName}>{error}</p> : null}
        </form>
      </NeoModal>
    </Dialog>
  );
}
