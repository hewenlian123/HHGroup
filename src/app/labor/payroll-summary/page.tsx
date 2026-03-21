"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  getPayrollSummary,
  getDailyWorkEntriesForWorker,
  totalPayForEntry,
  type PayrollSummaryRow,
  type DailyWorkEntry,
} from "@/lib/data";

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDefaultRange(): { from: string; to: string } {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const from = `${y}-${m}-01`;
  const lastDay = new Date(y, d.getMonth() + 1, 0).getDate();
  const to = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

export default function PayrollSummaryPage() {
  const defaults = React.useMemo(getDefaultRange, []);
  const [fromDate, setFromDate] = React.useState(defaults.from);
  const [toDate, setToDate] = React.useState(defaults.to);
  const [rows, setRows] = React.useState<PayrollSummaryRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [detailWorkerId, setDetailWorkerId] = React.useState<string | null>(null);
  const [detailEntries, setDetailEntries] = React.useState<(DailyWorkEntry & { projectName?: string })[]>([]);

  const load = React.useCallback(async () => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    setError(null);
    try {
      const list = await getPayrollSummary(fromDate, toDate);
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payroll summary.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  React.useEffect(() => {
    load();
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  const openWorkerDetail = async (workerId: string) => {
    setDetailWorkerId(workerId);
    try {
      const entries = await getDailyWorkEntriesForWorker(workerId, fromDate, toDate);
      setDetailEntries(entries);
    } catch {
      setDetailEntries([]);
    }
  };

  const totalDays = rows.reduce((s, r) => s + r.daysWorked, 0);
  const totalOt = rows.reduce((s, r) => s + r.otTotal, 0);
  const totalPay = rows.reduce((s, r) => s + r.totalPay, 0);

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Payroll Summary"
        subtitle="Summarize labor entries by worker for a date range."
        actions={
          <Link href="/labor" className="text-sm text-muted-foreground hover:text-foreground">
            Labor
          </Link>
        }
      />
      <div className="flex flex-wrap items-center gap-3 border-b border-border/60 pb-3">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">From</label>
        <Input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="h-9 w-[152px] rounded-md"
        />
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">To</label>
        <Input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="h-9 w-[152px] rounded-md"
        />
      </div>
      {error ? (
        <p className="py-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      <div className="overflow-x-auto border-b border-border/60">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Worker</th>
              <th className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Days Worked</th>
              <th className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">OT Total</th>
              <th className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Total Pay</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="border-b border-border/40">
                <td colSpan={4} className="py-6 px-4 text-center text-muted-foreground text-xs">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr className="border-b border-border/40">
                <td colSpan={4} className="py-6 px-4 text-center text-muted-foreground text-xs">
                  No labor entries for this range.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.workerId} className="border-b border-border/40 hover:bg-muted/10">
                  <td className="py-2 px-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 font-medium -ml-2 text-foreground"
                      onClick={() => openWorkerDetail(r.workerId)}
                    >
                      {r.workerName}
                    </Button>
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums">{r.daysWorked}</td>
                  <td className="py-2 px-4 text-right tabular-nums">${fmtUsd(r.otTotal)}</td>
                  <td className="py-2 px-4 text-right tabular-nums font-medium">${fmtUsd(r.totalPay)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-border/60 font-medium">
              <td className="py-2 px-4">Total</td>
              <td className="py-2 px-4 text-right tabular-nums">{totalDays}</td>
              <td className="py-2 px-4 text-right tabular-nums">${fmtUsd(totalOt)}</td>
              <td className="py-2 px-4 text-right tabular-nums">${fmtUsd(totalPay)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {detailWorkerId && (
        <div className="border-t border-border/60 pt-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-foreground">
              {rows.find((r) => r.workerId === detailWorkerId)?.workerName ?? "Worker"} — Detail
            </h2>
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setDetailWorkerId(null)}>
              Close
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Project</th>
                  <th className="text-left py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Day Type</th>
                  <th className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">OT</th>
                  <th className="text-right py-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider tabular-nums">Pay</th>
                </tr>
              </thead>
              <tbody>
                {detailEntries.length === 0 ? (
                  <tr className="border-b border-border/40">
                    <td colSpan={5} className="py-4 px-4 text-center text-muted-foreground text-xs">
                      No entries.
                    </td>
                  </tr>
                ) : (
                  detailEntries.map((e) => (
                    <tr key={e.id} className="border-b border-border/40">
                      <td className="py-2 px-4 tabular-nums">{e.workDate}</td>
                      <td className="py-2 px-4 text-muted-foreground">{e.projectName ?? e.projectId ?? "—"}</td>
                      <td className="py-2 px-4 capitalize">{e.dayType.replace("_", " ")}</td>
                      <td className="py-2 px-4 text-right tabular-nums">${fmtUsd(e.otAmount)}</td>
                      <td className="py-2 px-4 text-right tabular-nums font-medium">${fmtUsd(totalPayForEntry(e))}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
