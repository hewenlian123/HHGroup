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
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import type { LaborEntryWithJoins } from "@/lib/daily-labor-db";
import { formatCurrency } from "@/lib/formatters";
import {
  parseLaborOvertimeAmountFromNotes,
  parseLaborOvertimeHoursFromNotes,
  stripLaborOvertimeHoursFromNotes,
} from "@/lib/labor-overtime-notes";
import { ChevronDown } from "lucide-react";

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

function baseAmountFromStoredTotal(storedTotal: number, overtimeAmount: number): number {
  const total = Math.max(0, Number(storedTotal) || 0);
  const overtime = Math.max(0, Number(overtimeAmount) || 0);
  if (overtime <= 0) return total;
  return total > overtime ? total - overtime : total;
}

function basePayForSession(session: LaborSession, dailyRate: number, fallback: number): number {
  if (!Number.isFinite(dailyRate) || dailyRate <= 0) return fallback;
  return session === "full_day" ? dailyRate : dailyRate / 2;
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
  const [workDate, setWorkDate] = React.useState<string>("");
  const [session, setSession] = React.useState<LaborSession>("full_day");
  const [costAmount, setCostAmount] = React.useState<string>("");
  const [hours, setHours] = React.useState<string>("");
  const [overtimeHours, setOvertimeHours] = React.useState<string>("");
  const [overtimeAmount, setOvertimeAmount] = React.useState<string>("");
  const [notes, setNotes] = React.useState<string>("");
  const [advancedOpen, setAdvancedOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open || !entry) return;
    setProjectId(entry.project_id ?? "");
    setWorkDate(entry.work_date?.slice(0, 10) ?? "");
    const flags = entry as LaborEntryWithJoins & { morning?: unknown; afternoon?: unknown };
    const entrySession = sessionFromFlags(flags.morning, flags.afternoon);
    const entryOvertimeHours =
      entry.overtime_hours ?? parseLaborOvertimeHoursFromNotes(entry.notes);
    const entryOvertimeAmount =
      entry.overtime_amount ?? parseLaborOvertimeAmountFromNotes(entry.notes);
    setSession(entrySession);
    const storedTotal = entry.cost_amount != null ? Number(entry.cost_amount) : 0;
    const baseAmount = baseAmountFromStoredTotal(storedTotal, Number(entryOvertimeAmount || 0));
    setCostAmount(String(baseAmount));
    setHours(String(entry.hours != null ? Number(entry.hours) : 0));
    setOvertimeHours(String(entryOvertimeHours));
    setOvertimeAmount(String(entryOvertimeAmount));
    setNotes(stripLaborOvertimeHoursFromNotes(entry.notes));
    setAdvancedOpen(false);
    setError(null);
  }, [open, entry]);

  const dailyRate = Number(entry?.daily_rate_snapshot ?? NaN);
  const basePay = Math.max(0, Number(costAmount) || 0);
  const overtimeFixedPay = Math.max(0, Number(overtimeAmount) || 0);
  const totalPay = basePay + overtimeFixedPay;
  const rateSummary = Number.isFinite(dailyRate)
    ? formatCurrency(dailyRate)
    : formatCurrency(entry?.cost_amount ?? null);
  const basePaySummary = formatCurrency(basePay);
  const overtimePaySummary = formatCurrency(overtimeFixedPay);
  const totalPaySummary = formatCurrency(totalPay);

  const handleSave = async () => {
    if (!entry) return;
    if (!workDate) {
      setError("Choose a valid work date.");
      return;
    }
    const amt = Number(costAmount);
    if (!Number.isFinite(amt) || amt < 0) {
      setError("Enter a valid base pay.");
      return;
    }
    const hrs = Number(hours);
    if (!Number.isFinite(hrs) || hrs < 0) {
      setError("Enter valid hours.");
      return;
    }
    const ot = Number(overtimeHours || 0);
    const otAmount = Number(overtimeAmount || 0);
    if (!Number.isFinite(ot) || ot < 0) {
      setError("Enter valid overtime hours.");
      return;
    }
    if (!Number.isFinite(otAmount) || otAmount < 0) {
      setError("Enter a valid overtime fixed amount.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/labor/entries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "session-entry",
          id: entry.id,
          workerId: entry.worker_id,
          workDate,
          projectId: projectId || null,
          session,
          costAmount: amt,
          hours: hrs,
          overtimeHours: ot,
          overtimeAmount: otAmount,
          notes: notes.trim() || null,
        }),
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message ?? "Failed to update.");
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
      <DialogContent className="flex max-h-[calc(100dvh-24px)] flex-col overflow-hidden border-border/60 p-0 sm:max-w-[520px] sm:p-0 max-sm:h-[100dvh] max-sm:w-[100vw] max-sm:max-w-none max-sm:rounded-none">
        <DialogHeader className="border-b border-border/60 px-6 pb-4 pt-6 max-sm:px-4 max-sm:pb-3 max-sm:pt-4">
          <DialogTitle className="text-base font-semibold">Edit Entry</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4 max-sm:px-4 max-sm:py-3">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Worker</label>
            <Input value={entry?.worker_name ?? "—"} readOnly className="h-9 bg-muted/30" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="h-9 w-full rounded-hh-compact border border-input bg-transparent px-3 text-sm"
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
            <Input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              className="h-9 tabular-nums"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Session</label>
            <select
              data-testid="labor-edit-session"
              value={session}
              onChange={(e) => {
                const nextSession = e.target.value as LaborSession;
                setSession(nextSession);
                setCostAmount(String(basePayForSession(nextSession, dailyRate, basePay)));
              }}
              className="h-9 w-full rounded-hh-compact border border-input bg-transparent px-3 text-sm"
            >
              <option value="full_day">Full Day</option>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
            </select>
          </div>
          <div className="rounded-hh-standard border border-border/60 bg-muted/20 px-3 py-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-hh-status font-medium uppercase tracking-normal text-muted-foreground">
                  Base Pay
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
                  {basePaySummary}
                </p>
              </div>
              <div className="text-center">
                <p className="text-hh-status font-medium uppercase tracking-normal text-muted-foreground">
                  Overtime
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
                  {overtimePaySummary}
                </p>
              </div>
              <div className="text-right">
                <p className="text-hh-status font-medium uppercase tracking-normal text-muted-foreground">
                  Total
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
                  {totalPaySummary}
                </p>
              </div>
            </div>
            <p className="mt-2 text-hh-status leading-4 text-muted-foreground">
              Daily rate: {rateSummary}. Overtime is added on top of the base session pay.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 rounded-hh-standard border border-border/60 bg-muted/10 p-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Overtime Hours</label>
              <Input
                aria-label="Overtime Hours"
                value={overtimeHours}
                onChange={(e) => setOvertimeHours(e.target.value)}
                className="h-9 tabular-nums"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Overtime Fixed Amount
              </label>
              <Input
                aria-label="Overtime Fixed Amount"
                value={overtimeAmount}
                onChange={(e) => setOvertimeAmount(e.target.value)}
                className="h-9 tabular-nums"
                inputMode="decimal"
              />
            </div>
            <p className="text-hh-status leading-4 text-muted-foreground sm:col-span-2">
              Overtime is tracked separately. Fixed amount is entered manually.
            </p>
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
          <div className="rounded-hh-standard border border-border/60">
            <button
              type="button"
              data-testid="labor-edit-advanced-toggle"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((value) => !value)}
              className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/25"
            >
              Advanced
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${
                  advancedOpen ? "rotate-180" : ""
                }`}
                aria-hidden
              />
            </button>
            {advancedOpen ? (
              <div className="grid grid-cols-1 gap-3 border-t border-border/60 p-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Override Base Pay
                  </label>
                  <Input
                    aria-label="Override Base Pay"
                    value={costAmount}
                    onChange={(e) => setCostAmount(e.target.value)}
                    className="h-9 tabular-nums"
                    inputMode="decimal"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Raw Hours</label>
                  <Input
                    aria-label="Raw Hours"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    className="h-9 tabular-nums"
                    inputMode="decimal"
                  />
                </div>
              </div>
            ) : null}
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter className="shrink-0 border-t border-border/60 px-6 pb-6 pt-4 max-sm:px-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom,1rem))]">
          <Button
            variant="outline"
            size="sm"
            className="rounded-hh-compact"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="rounded-hh-compact bg-[var(--hh-action-primary)] text-[var(--hh-action-primary-foreground)] hover:bg-[var(--hh-action-primary)]"
            onClick={handleSave}
            disabled={busy}
          >
            <SubmitSpinner loading={busy} className="mr-2" />
            {busy ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
