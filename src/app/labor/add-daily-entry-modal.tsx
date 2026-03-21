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
import { fetchCached } from "@/lib/client-data-cache";
import { VirtualScrollList } from "@/components/ui/virtual-scroll-list";
import { cn } from "@/lib/utils";

/** Above this, window the worker list so mobile scroll stays smooth. */
const WORKER_LIST_VIRTUAL_THRESHOLD = 32;
const WORKER_ROW_ESTIMATE_PX = 56;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

const OT_MULTIPLIER = 1.5;

type Sel = { morning: boolean; afternoon: boolean; otHours: number };

function computeTotalPay(dailyRate: number, morning: boolean, afternoon: boolean, otHours: number): number {
  const base = morning && afternoon ? dailyRate : morning || afternoon ? dailyRate / 2 : 0;
  const otPay = Math.max(0, otHours) * (dailyRate / 8) * OT_MULTIPLIER;
  return base + otPay;
}

const defaultSel = (): Sel => ({ morning: false, afternoon: false, otHours: 0 });

const AddDailyEntryWorkerRow = React.memo(function AddDailyEntryWorkerRow({
  worker,
  morning,
  afternoon,
  otHours,
  disabled,
  toggleMorning,
  toggleAfternoon,
  commitOtHours,
}: {
  worker: LaborWorker;
  morning: boolean;
  afternoon: boolean;
  otHours: number;
  disabled: boolean;
  toggleMorning: (id: string) => void;
  toggleAfternoon: (id: string) => void;
  commitOtHours: (id: string, value: number) => void;
}) {
  const [otDraft, setOtDraft] = React.useState(() => (otHours === 0 ? "" : String(otHours)));
  const otDraftRef = React.useRef(otDraft);
  otDraftRef.current = otDraft;
  const otRafRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    setOtDraft(otHours === 0 ? "" : String(otHours));
  }, [otHours]);

  const onAm = React.useCallback(() => toggleMorning(worker.id), [toggleMorning, worker.id]);
  const onPm = React.useCallback(() => toggleAfternoon(worker.id), [toggleAfternoon, worker.id]);

  const scheduleOtCommit = React.useCallback(() => {
    if (otRafRef.current != null) cancelAnimationFrame(otRafRef.current);
    otRafRef.current = requestAnimationFrame(() => {
      otRafRef.current = null;
      const raw = otDraftRef.current;
      const n = parseFloat(raw);
      const v = Number.isFinite(n) ? Math.max(0, n) : 0;
      commitOtHours(worker.id, v);
    });
  }, [commitOtHours, worker.id]);

  React.useEffect(
    () => () => {
      if (otRafRef.current != null) cancelAnimationFrame(otRafRef.current);
    },
    []
  );

  const rate = worker.dailyRate != null && Number(worker.dailyRate) >= 0 ? Number(worker.dailyRate) : 0;
  const otParsed = parseFloat(otDraft);
  const otLive = Number.isFinite(otParsed) ? Math.max(0, otParsed) : 0;
  const total = computeTotalPay(rate, morning, afternoon, otLive);

  return (
    <div
      className={cn(
        "flex border-b border-border/30 [&>div]:py-2 [&>div]:min-w-0",
        disabled && "opacity-60"
      )}
      role="row"
    >
      <div className="flex-[2] pl-0 pr-2 min-w-0">
        <span className="font-medium truncate block" title={worker.name}>
          {worker.name}
        </span>
        {disabled ? <span className="block text-xs text-muted-foreground">Already has entry</span> : null}
      </div>
      <div className="flex-1 text-muted-foreground whitespace-nowrap text-xs sm:text-sm pr-1 shrink-0">
        ${Math.round(rate)}/d
      </div>
      <div className="flex-1 flex justify-center shrink-0 w-[52px] sm:w-14">
        <Button
          type="button"
          size="sm"
          variant={morning ? "default" : "outline"}
          className="h-8 rounded-sm min-w-[44px] w-full max-w-[52px] sm:min-w-[44px] sm:max-w-none"
          onClick={onAm}
          disabled={disabled}
        >
          AM
        </Button>
      </div>
      <div className="flex-1 flex justify-center shrink-0 w-[52px] sm:w-14">
        <Button
          type="button"
          size="sm"
          variant={afternoon ? "default" : "outline"}
          className="h-8 rounded-sm min-w-[44px] w-full max-w-[52px] sm:min-w-[44px] sm:max-w-none"
          onClick={onPm}
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
          value={otDraft}
          onChange={(e) => {
            const v = e.target.value;
            setOtDraft(v);
            scheduleOtCommit();
          }}
          onBlur={() => {
            if (otRafRef.current != null) {
              cancelAnimationFrame(otRafRef.current);
              otRafRef.current = null;
            }
            const n = parseFloat(otDraftRef.current);
            const v = Number.isFinite(n) ? Math.max(0, n) : 0;
            commitOtHours(worker.id, v);
            setOtDraft(v === 0 ? "" : String(v));
          }}
          disabled={disabled}
          className="h-8 w-full min-w-0 text-center text-sm tabular-nums"
        />
      </div>
      <div className="flex-1 text-right text-muted-foreground tabular-nums text-xs sm:text-sm pl-1 shrink-0">
        {morning || afternoon || otLive > 0 ? `$${total.toFixed(2)}` : "—"}
      </div>
    </div>
  );
});

export function AddDailyEntryModal({ open, onOpenChange, onSuccess }: Props) {
  const [projectId, setProjectId] = React.useState("");
  const [workDate, setWorkDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [projects, setProjects] = React.useState<{ id: string; name: string }[]>([]);
  const [workers, setWorkers] = React.useState<LaborWorker[]>([]);
  const [selectionByWorkerId, setSelectionByWorkerId] = React.useState<Record<string, Sel>>({});
  const selectionRef = React.useRef(selectionByWorkerId);
  React.useEffect(() => {
    selectionRef.current = selectionByWorkerId;
  }, [selectionByWorkerId]);
  const [disabledWorkerIds, setDisabledWorkerIds] = React.useState<Set<string>>(new Set());
  const [notes, setNotes] = React.useState("");
  const [costCode, setCostCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      fetchCached("data:projects", getProjects),
      fetchCached("data:laborWorkers", getLaborWorkers),
    ]).then(([p, w]) => {
      if (cancelled) return;
      setProjects(p);
      setWorkers(w);
      setSelectionByWorkerId(
        Object.fromEntries(w.map((worker) => [worker.id, defaultSel()])) as Record<string, Sel>
      );
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
          setDisabledWorkerIds(new Set(entries.map((e) => e.workerId)));
        }
      })
      .catch(() => {
        if (!cancelled) setDisabledWorkerIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [open, workDate]);

  const toggleMorning = React.useCallback((workerId: string) => {
    if (disabledWorkerIds.has(workerId)) return;
    setSelectionByWorkerId((prev) => {
      const cur = prev[workerId] ?? defaultSel();
      return { ...prev, [workerId]: { ...cur, morning: !cur.morning } };
    });
  }, [disabledWorkerIds]);

  const toggleAfternoon = React.useCallback((workerId: string) => {
    if (disabledWorkerIds.has(workerId)) return;
    setSelectionByWorkerId((prev) => {
      const cur = prev[workerId] ?? defaultSel();
      return { ...prev, [workerId]: { ...cur, afternoon: !cur.afternoon } };
    });
  }, [disabledWorkerIds]);

  const commitOtHours = React.useCallback((workerId: string, value: number) => {
    setSelectionByWorkerId((prev) => {
      const cur = prev[workerId] ?? defaultSel();
      return { ...prev, [workerId]: { ...cur, otHours: value } };
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ae = document.activeElement;
    if (ae instanceof HTMLElement) ae.blur();
    // One frame so blur + pending rAF OT commits land before reading selections (~16ms)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const map = selectionRef.current;
    if (!projectId || !workDate) {
      setError("Project and date are required.");
      return;
    }
    const toSave: DailyLaborRowInput[] = [];
    for (const w of workers) {
      const s = map[w.id];
      if (!s || (!s.morning && !s.afternoon)) continue;
      toSave.push({
        workerId: w.id,
        morning: s.morning,
        afternoon: s.afternoon,
        otHours: s.otHours,
      });
    }
    if (toSave.length === 0) {
      setError("Select at least one worker with AM or PM.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await insertDailyLaborEntriesAmPm(projectId, workDate, toSave, {
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
          <DialogTitle className="text-base font-semibold">Add Daily Entry</DialogTitle>
        </DialogHeader>
        <form
          id="add-daily-form"
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 overflow-hidden flex-1 min-h-0"
        >
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Project</label>
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
            <label className="text-xs font-medium text-muted-foreground">Date</label>
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
              Workers who have completed a full day (AM+PM) on this date are disabled across all projects.
            </p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-x-auto border-b border-border/60 min-w-0">
            <div className="w-full min-w-0 shrink-0 text-sm">
              <div
                className="flex border-b border-border/60 text-xs font-medium text-muted-foreground [&>div]:min-w-0 [&>div]:py-2"
                role="row"
              >
                <div className="flex-[2] overflow-visible pl-0 pr-2 text-left">
                  <span className="block truncate" title="Worker">
                    Worker
                  </span>
                </div>
                <div className="flex-1 whitespace-nowrap pr-1 text-left">Rate</div>
                <div className="flex-1 shrink-0 text-center w-[52px] sm:w-14">AM</div>
                <div className="flex-1 shrink-0 text-center w-[52px] sm:w-14">PM</div>
                <div className="flex-1 shrink-0 text-center w-12 sm:w-14">OT</div>
                <div className="flex-1 whitespace-nowrap pl-1 text-right">Total</div>
              </div>
            </div>
            {workers.length > WORKER_LIST_VIRTUAL_THRESHOLD ? (
              <VirtualScrollList
                count={workers.length}
                estimateSize={WORKER_ROW_ESTIMATE_PX}
                className="min-h-[120px] max-h-[min(52vh,440px)] flex-1"
              >
                {(index) => {
                  const worker = workers[index];
                  if (!worker) return null;
                  const sel = selectionByWorkerId[worker.id] ?? defaultSel();
                  const disabled = disabledWorkerIds.has(worker.id);
                  return (
                    <AddDailyEntryWorkerRow
                      key={worker.id}
                      worker={worker}
                      morning={sel.morning}
                      afternoon={sel.afternoon}
                      otHours={sel.otHours}
                      disabled={disabled}
                      toggleMorning={toggleMorning}
                      toggleAfternoon={toggleAfternoon}
                      commitOtHours={commitOtHours}
                    />
                  );
                }}
              </VirtualScrollList>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto text-sm w-full min-w-0">
                {workers.map((worker) => {
                  const sel = selectionByWorkerId[worker.id] ?? defaultSel();
                  const disabled = disabledWorkerIds.has(worker.id);
                  return (
                    <AddDailyEntryWorkerRow
                      key={worker.id}
                      worker={worker}
                      morning={sel.morning}
                      afternoon={sel.afternoon}
                      otHours={sel.otHours}
                      disabled={disabled}
                      toggleMorning={toggleMorning}
                      toggleAfternoon={toggleAfternoon}
                      commitOtHours={commitOtHours}
                    />
                  );
                })}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Cost code</label>
              <Input
                value={costCode}
                onChange={(e) => setCostCode(e.target.value)}
                placeholder="Optional"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
                className="h-9 text-sm"
              />
            </div>
          </div>
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
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
          <Button type="submit" form="add-daily-form" size="sm" disabled={busy} className="rounded-sm h-9">
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
