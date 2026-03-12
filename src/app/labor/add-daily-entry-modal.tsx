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
  getLaborEntriesByProjectAndDate,
  insertDailyLaborEntriesAmPm,
  type LaborWorker,
  type DailyLaborRowInput,
} from "@/lib/data";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

type WorkerSelection = {
  workerId: string;
  morning: boolean;
  afternoon: boolean;
};

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
          }))
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open || !projectId || !workDate) {
      setDisabledWorkerIds(new Set());
      return;
    }
    let cancelled = false;
    getLaborEntriesByProjectAndDate(projectId, workDate).then((entries) => {
      if (!cancelled) {
        const ids = new Set(entries.map((e) => e.workerId));
        setDisabledWorkerIds(ids);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, workDate]);

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
      <DialogContent className="max-w-md border-border/60 rounded-lg gap-4 p-5 max-h-[90vh] flex flex-col">
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
              Workers with an existing entry for this project and date are
              disabled.
            </p>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 border-b border-border/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="text-left py-2 text-xs font-medium text-muted-foreground">
                    Worker
                  </th>
                  <th className="text-right py-2 text-xs font-medium text-muted-foreground w-32">
                    AM / PM
                  </th>
                </tr>
              </thead>
              <tbody>
                {workers.map((worker) => {
                  const sel = selections.find((s) => s.workerId === worker.id);
                  const disabled = disabledWorkerIds.has(worker.id);
                  return (
                    <tr
                      key={worker.id}
                      className={
                        disabled
                          ? "border-b border-border/30 opacity-60"
                          : "border-b border-border/30"
                      }
                    >
                      <td className="py-2 pr-2">
                        <span className="font-medium">{worker.name}</span>
                        {disabled ? (
                          <span className="block text-xs text-muted-foreground">
                            Already has entry
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant={sel?.morning ? "default" : "outline"}
                            className="h-8 rounded-sm min-w-[52px]"
                            onClick={() => toggleMorning(worker.id)}
                            disabled={disabled}
                          >
                            AM
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={sel?.afternoon ? "default" : "outline"}
                            className="h-8 rounded-sm min-w-[52px]"
                            onClick={() => toggleAfternoon(worker.id)}
                            disabled={disabled}
                          >
                            PM
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
