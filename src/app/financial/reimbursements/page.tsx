"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getExpenses,
  getWorkers,
  getExpenseTotal,
  markWorkerExpensesReimbursed,
  type Expense,
} from "@/lib/data";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/components/toast/toast-provider";

type WorkerRow = { id: string; name: string };

type WorkerReimbursementRow = {
  workerId: string;
  workerName: string;
  totalPending: number;
  totalApproved: number;
  totalOwed: number;
  expenses: Expense[];
};

function buildReimbursementRows(
  expenses: Expense[],
  workerNameById: Map<string, string>
): WorkerReimbursementRow[] {
  const byWorker = new Map<string, Expense[]>();
  for (const e of expenses) {
    const wid = e.workerId ?? "";
    if (!wid) continue;
    if (!byWorker.has(wid)) byWorker.set(wid, []);
    byWorker.get(wid)!.push(e);
  }
  const rows: WorkerReimbursementRow[] = [];
  for (const [workerId, list] of Array.from(byWorker.entries())) {
    let totalNeedsReview = 0;
    let totalApproved = 0;
    for (const exp of list) {
      const amt = getExpenseTotal(exp);
      if (exp.status === "needs_review") totalNeedsReview += amt;
      else if (exp.status === "approved") totalApproved += amt;
    }
    const totalOwed = totalNeedsReview + totalApproved;
    rows.push({
      workerId,
      workerName: workerNameById.get(workerId) ?? workerId,
      totalPending: totalNeedsReview,
      totalApproved,
      totalOwed,
      expenses: list,
    });
  }
  rows.sort((a, b) => b.totalOwed - a.totalOwed);
  return rows;
}

export default function WorkerReimbursementsPage() {
  return (
    <React.Suspense fallback={<div className="page-container py-6" />}>
      <WorkerReimbursementsPageInner />
    </React.Suspense>
  );
}

function WorkerReimbursementsPageInner() {
  const { toast } = useToast();
  const [expenses, setExpenses] = React.useState<Expense[]>([]);
  const [workers, setWorkers] = React.useState<WorkerRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [detailWorker, setDetailWorker] = React.useState<WorkerReimbursementRow | null>(null);
  const [markingWorkerId, setMarkingWorkerId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const [expList, workerList] = await Promise.all([getExpenses(), getWorkers()]);
    setExpenses(expList);
    setWorkers(workerList as WorkerRow[]);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  const workerNameById = React.useMemo(
    () => new Map(workers.map((w) => [w.id, w.name])),
    [workers]
  );
  const rows = React.useMemo(
    () => buildReimbursementRows(expenses, workerNameById),
    [expenses, workerNameById]
  );
  const hasOwed = rows.some((r) => r.totalOwed > 0);

  const handleMarkReimbursed = async (workerId: string) => {
    setMarkingWorkerId(workerId);
    try {
      const count = await markWorkerExpensesReimbursed(workerId);
      await load();
      setDetailWorker((prev) => (prev?.workerId === workerId ? null : prev));
      toast({
        title: "Marked as reimbursed",
        description: count ? `${count} expense(s) updated.` : "No expenses to update.",
        variant: "success",
      });
    } catch (e) {
      toast({
        title: "Failed",
        description: e instanceof Error ? e.message : "Could not update expenses.",
        variant: "error",
      });
    } finally {
      setMarkingWorkerId(null);
    }
  };

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Worker Reimbursements"
        description="Expenses grouped by worker. Pending + approved = total owed."
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !hasOwed && rows.length === 0 ? (
        <EmptyState
          title="No worker expenses"
          description="Expenses with a worker assigned will appear here."
          icon={null}
        />
      ) : (
        <section className="border-b border-border/60">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/60 hover:bg-transparent">
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                    Worker
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right tabular-nums">
                    Needs Review
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right tabular-nums">
                    Approved
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right tabular-nums">
                    Total Owed
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right w-[140px]">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.workerId} className="border-b border-border/30">
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 font-medium text-foreground -ml-2"
                        onClick={() => setDetailWorker(row)}
                      >
                        {row.workerName}
                      </Button>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      ${row.totalPending.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      ${row.totalApproved.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      ${row.totalOwed.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={row.totalOwed <= 0 || !!markingWorkerId}
                        onClick={() => handleMarkReimbursed(row.workerId)}
                      >
                        {markingWorkerId === row.workerId ? "Updating…" : "Mark as Reimbursed"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <Dialog open={!!detailWorker} onOpenChange={(open) => !open && setDetailWorker(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl border-border/60 p-0 gap-0 overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-2">
            <DialogTitle className="text-sm font-medium">
              {detailWorker ? detailWorker.workerName : ""} — Expenses
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto">
            {detailWorker && (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-border/60 hover:bg-transparent">
                        <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                          Date
                        </TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                          Vendor
                        </TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right tabular-nums">
                          Amount
                        </TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">
                          Status
                        </TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-muted-foreground text-right w-16" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailWorker.expenses.map((exp) => (
                        <TableRow key={exp.id} className="border-b border-border/30">
                          <TableCell className="tabular-nums text-foreground">{exp.date}</TableCell>
                          <TableCell className="text-foreground">{exp.vendorName}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            ${getExpenseTotal(exp).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm capitalize">
                            {exp.status ?? "pending"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button asChild variant="ghost" size="sm" className="h-7">
                              <Link href={`/financial/expenses/${exp.id}`}>View</Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="border-t border-border/60 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Total owed:{" "}
                    <span className="font-medium text-foreground">
                      ${detailWorker.totalOwed.toLocaleString()}
                    </span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={detailWorker.totalOwed <= 0 || !!markingWorkerId}
                    onClick={() => handleMarkReimbursed(detailWorker.workerId)}
                  >
                    {markingWorkerId === detailWorker.workerId ? "Updating…" : "Mark as Reimbursed"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
