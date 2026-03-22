"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LaborEntryWithJoins } from "@/lib/daily-labor-db";
import { updateLaborEntry } from "@/lib/data";

export type LaborSession = "morning" | "afternoon" | "full_day";

function sessionFromFlags(morning: unknown, afternoon: unknown): LaborSession {
  const m = morning === true;
  const a = afternoon === true;
  if (m && a) return "full_day";
  if (m && !a) return "morning";
  if (!m && a) return "afternoon";
  return "full_day";
}

export function sessionTag(session: LaborSession): string {
  if (session === "morning") return "🌅";
  if (session === "afternoon") return "🌇";
  return "🟩";
}

export function sessionLabel(session: LaborSession): string {
  if (session === "morning") return "Morning";
  if (session === "afternoon") return "Afternoon";
  return "Full Day";
}

export function EditEntryModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: LaborEntryWithJoins | null;
  projects: Array<{ id: string; name: string }>;
  onSaved: () => void;
}) {
  const { open, onOpenChange, entry, projects, onSaved } = props;
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [projectId, setProjectId] = React.useState<string>("");
  const [session, setSession] = React.useState<LaborSession>("full_day");
  const [costAmount, setCostAmount] = React.useState<string>("");
  const [hours, setHours] = React.useState<string>("");
  const [notes, setNotes] = React.useState<string>("");

  React.useEffect(() => {
    if (!open || !entry) return;
    setProjectId(entry.project_id ?? "");
    setSession(sessionFromFlags((entry as any).morning, (entry as any).afternoon));
    setCostAmount(String(entry.cost_amount != null ? Number(entry.cost_amount) : 0));
    setHours(String(entry.hours != null ? Number(entry.hours) : 0));
    setNotes(entry.notes ?? "");
    setError(null);
  }, [open, entry]);

  const handleSave = async () => {
    if (!entry) return;
    const amt = Number(costAmount);
    if (!Number.isFinite(amt) || amt < 0) {
      setError("Enter a valid cost amount.");
      return;
    }
    const hrs = Number(hours);
    if (!Number.isFinite(hrs) || hrs < 0) {
      setError("Enter valid hours.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateLaborEntry(entry.id, {
        project_id: projectId || null,
        session,
        cost_amount: amt,
        hours: hrs,
        notes: notes.trim() || null,
      });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border/60 p-0 sm:p-6 max-sm:h-[100dvh] max-sm:w-[100vw] max-sm:max-w-none max-sm:rounded-none">
        <DialogHeader className="px-6 pt-6 pb-4 max-sm:px-4 max-sm:pt-4 max-sm:pb-3 border-b border-border/60">
          <DialogTitle className="text-base font-semibold">Edit Entry</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-4 max-sm:px-4 max-sm:py-3 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Worker</label>
            <Input value={entry?.worker_name ?? "—"} readOnly className="h-9" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">—</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Work Date</label>
            <Input value={entry?.work_date ?? ""} readOnly className="h-9 tabular-nums" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Session</label>
            <select
              value={session}
              onChange={(e) => setSession(e.target.value as LaborSession)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="full_day">Full Day</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Cost Amount</label>
              <Input
                value={costAmount}
                onChange={(e) => setCostAmount(e.target.value)}
                className="h-9 tabular-nums"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Hours</label>
              <Input
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="h-9 tabular-nums"
                inputMode="decimal"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-9"
              placeholder="Optional"
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter className="px-6 pb-6 max-sm:px-4 max-sm:pb-4 border-t border-border/60 pt-4">
          <Button
            variant="outline"
            size="sm"
            className="rounded-sm"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="rounded-sm bg-[#111111] text-white hover:bg-[#111111]/90"
            onClick={handleSave}
            disabled={busy}
          >
            {busy ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
