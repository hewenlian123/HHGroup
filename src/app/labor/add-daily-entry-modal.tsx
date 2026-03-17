"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getProjects,
  getLaborWorkers,
  getFullDayLaborEntriesByDate,
  insertDailyLaborEntriesAmPm,
  type LaborWorker,
  type DailyLaborRowInput,
} from "@/lib/data";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

const OT_MULTIPLIER = 1.5;

type WorkerSelection = {
  workerId: string;
  morning: boolean;
  afternoon: boolean;
  otHours: number;
};

function computeTotalPay(dailyRate: number, morning: boolean, afternoon: boolean, otHours: number): number {
  const base = morning && afternoon ? dailyRate : (morning || afternoon ? dailyRate / 2 : 0);
  const otPay = Math.max(0, otHours) * (dailyRate / 8) * OT_MULTIPLIER;
  return base + otPay;
}

export function AddDailyEntryModal({ open, onOpenChange, onSuccess }: Props) {
  const [projectId, setProjectId] = React.useState("");
  const [workDate, setWorkDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [projects, setProjects] = React.useState<{ id: string; name: string }[]>(
    []
  );
  const [workers, setWorkers] = React.useState<LaborWorker[]>([]);
  const [selections, setSelections] = React.useState<WorkerSelection[]>([]);
  const [disabledWorkerIds, setDisabledWorkerIds] = React.useState<Set<string>>(
    new Set()
  );
  const [notes, setNotes] = React.useState("");
  const [costCode, setCostCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([getProjects(), getLaborWorkers()]).then(([p, w]) => {
      if (!cancelled) {
        setProjects(p);
        setWorkers(w);
        setSelections(
          w.map((worker) => ({
            workerId: worker.id,
            morning: false,
            afternoon: false,
            otHours: 0,
          }))
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open || !workDate) {
      setDisabledWorkerIds(new Set());
      return;
    }
    let cancelled = false;
    getFullDayLaborEntriesByDate(workDate)
      .then((entries) => {
        if (!cancelled) {
          const ids = new Set(entries.map((e) => e.workerId));
          setDisabledWorkerIds(ids);
        }
      })
      .catch(() => {
        if (!cancelled) setDisabledWorkerIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [open, workDate]);

  const toggleMorning = (workerId: string) => {
    if (disabledWorkerIds.has(workerId)) return;
    setSelections((prev) =>
      prev.map((s) =>
        s.workerId === workerId ? { ...s, morning: !s.morning } : s
      )
    );
  };

  const toggleAfternoon = (workerId: string) => {
    if (disabledWorkerIds.has(workerId)) return;
    setSelections((prev) =>
      prev.map((s) =>
        s.workerId === workerId ? { ...s, afternoon: !s.afternoon } : s
      )
    );
  };

  const setOtHours = (workerId: string, value: number) => {
    setSelections((prev) =>
      prev.map((s) =>
        s.workerId === workerId ? { ...s, otHours: Math.max(0, value) } : s
      )
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !workDate) {
      setError("Project and date are required.");
      return;
    }
    const toSave = selections.filter((s) => s.morning || s.afternoon);
    if (toSave.length === 0) {
      setError("Select at least one worker with AM or PM.");
      return;
    }
    const rows: DailyLaborRowInput[] = toSave.map((s) => ({
      workerId: s.workerId,
      morning: s.morning,
      afternoon: s.afternoon,
      otHours: s.otHours,
    }));
    setError(null);
    setBusy(true);
    try {
      await insertDailyLaborEntriesAmPm(projectId, workDate, rows, {
        notes: notes.trim() || undefined,
        costCode: costCode.trim() || undefined,
      });
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save entries.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-border/60 rounded-lg gap-4 p-5 max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Add Daily Entry
          </DialogTitle>
        </DialogHeader>
        <form
          id="add-daily-form"
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 overflow-hidden flex-1 min-h-0"
        >
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Project
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              required
            >
              <option value="">Select project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Date
            </label>
            <Input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              className="h-9 text-sm"
              required
            />
          </div>
          <div className="border-b border-border/60 pb-2">
            <p className="text-xs text-muted-foreground mb-2">
              Workers who have completed a full day (AM+PM) on this date are
              disabled across all projects.
            </p>
          </div>
          <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0 border-b border-border/60 min-w-0">
            <div className="text-sm w-full min-w-0">
              {/* Flex-based header: Worker flex-2, others flex-1 to avoid clipping on small screens */}
              <div
                className="flex border-b border-border/60 shrink-0 text-xs font-medium text-muted-foreground [&>div]:py-2 [&>div]:min-w-0"
                role="row"
              >
                <div className="flex-[2] pl-0 pr-2 text-left overflow-visible">
                  <span className="truncate block" title="Worker">Worker</span>
                </div>
                <div className="flex-1 text-left whitespace-nowrap pr-1">Rate</div>
                <div className="flex-1 text-center shrink-0 w-[52px] sm:w-14">AM</div>
                <div className="flex-1 text-center shrink-0 w-[52px] sm:w-14">PM</div>
                <div className="flex-1 text-center shrink-0 w-12 sm:w-14">OT</div>
                <div className="flex-1 text-right whitespace-nowrap pl-1">Total</div>
              </div>
              {workers.map((worker) => {
                const sel = selections.find((s) => s.workerId === worker.id);
                const disabled = disabledWorkerIds.has(worker.id);
                const rate = worker.dailyRate != null && Number(worker.dailyRate) >= 0 ? Number(worker.dailyRate) : 0;
                const total = sel
                  ? computeTotalPay(rate, sel.morning, sel.afternoon, sel.otHours)
                  : 0;
                return (
                  <div
                    key={worker.id}
                    className={cn(
                      "flex border-b border-border/30 [&>div]:py-2 [&>div]:min-w-0",
                      disabled && "opacity-60"
                    )}
                    role="row"
                  >
                    <div className="flex-[2] pl-0 pr-2 min-w-0">
                      <span className="font-medium truncate block" title={worker.name}>{worker.name}</span>
                      {disabled ? (
                        <span className="block text-xs text-muted-foreground">Already has entry</span>
                      ) : null}
                    </div>
                    <div className="flex-1 text-muted-foreground whitespace-nowrap text-xs sm:text-sm pr-1 shrink-0">
                      ${Math.round(rate)}/d
                    </div>
                    <div className="flex-1 flex justify-center shrink-0 w-[52px] sm:w-14">
                      <Button
                        type="button"
                        size="sm"
                        variant={sel?.morning ? "default" : "outline"}
                        className="h-8 rounded-sm min-w-[44px] w-full max-w-[52px] sm:min-w-[44px] sm:max-w-none"
                        onClick={() => toggleMorning(worker.id)}
                        disabled={disabled}
                      >
                        AM
                      </Button>
                    </div>
                    <div className="flex-1 flex justify-center shrink-0 w-[52px] sm:w-14">
                      <Button
                        type="button"
                        size="sm"
                        variant={sel?.afternoon ? "default" : "outline"}
                        className="h-8 rounded-sm min-w-[44px] w-full max-w-[52px] sm:min-w-[44px] sm:max-w-none"
                        onClick={() => toggleAfternoon(worker.id)}
                        disabled={disabled}
                      >
                        PM
                      </Button>
                    </div>
                    <div className="flex-1 px-1 shrink-0 w-12 sm:w-14">
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        value={sel?.otHours ?? 0}
                        onChange={(e) => setOtHours(worker.id, parseFloat(e.target.value) || 0)}
                        disabled={disabled}
                        className="h-8 w-full min-w-0 text-center text-sm tabular-nums"
                      />
                    </div>
                    <div className="flex-1 text-right text-muted-foreground tabular-nums text-xs sm:text-sm pl-1 shrink-0">
                      {((sel?.morning || sel?.afternoon) || ((sel?.otHours ?? 0) > 0))
                        ? `$${total.toFixed(2)}`
                        : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Cost code
              </label>
              <Input
                value={costCode}
                onChange={(e) => setCostCode(e.target.value)}
                placeholder="Optional"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-xs font-medium text-muted-foreground">
                Notes
              </label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
                className="h-9 text-sm"
              />
            </div>
          </div>
          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          ) : null}
        </form>
        <DialogFooter className="border-t border-border/60 pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="rounded-sm h-9"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-daily-form"
            size="sm"
            disabled={busy}
            className="rounded-sm h-9"
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
