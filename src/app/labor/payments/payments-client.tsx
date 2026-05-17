"use client";

import * as React from "react";
import { startTransition } from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/filter-bar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
import { DeleteRowAction } from "@/components/base";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { amountClass, TYPO } from "@/lib/typography";
import { cn } from "@/lib/utils";
import { formatLedgerDate, LEDGER_DATE_CLASS } from "@/lib/ledger-date";

type PayRunRow = {
  workerId: string;
  workerName: string;
  confirmedDailyTotal: number;
  confirmedInvoiceTotal: number;
  confirmedTotal: number;
  paidTotal: number;
  balance: number;
  payments: Array<{
    id: string;
    paymentDate: string;
    amount: number;
    method: string;
    memo?: string;
  }>;
};

function last7DaysStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().slice(0, 10);
}

export default function LaborPaymentsClient() {
  const [startDate, setStartDate] = React.useState(last7DaysStart);
  const [endDate, setEndDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [projectId, setProjectId] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<PayRunRow[]>([]);
  const [projects, setProjects] = React.useState<Array<{ id: string; name: string }>>([]);
  const [paymentMethods, setPaymentMethods] = React.useState<string[]>(["ACH"]);
  const [expandedWorkerId, setExpandedWorkerId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const [modalWorkerId, setModalWorkerId] = React.useState<string | null>(null);
  const [paymentDate, setPaymentDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = React.useState(0);
  const [method, setMethod] = React.useState("ACH");
  const [memo, setMemo] = React.useState("");
  const [modalWarning, setModalWarning] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [backgroundRefreshing, setBackgroundRefreshing] = React.useState(false);

  const refresh = React.useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;
      if (!silent) setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ startDate, endDate });
        if (projectId.trim()) params.set("projectId", projectId.trim());
        const response = await fetch(`/api/labor/payments?${params.toString()}`, {
          cache: "no-store",
        });
        const body = (await response.json().catch(() => ({}))) as {
          message?: string;
          rows?: PayRunRow[];
          projects?: Array<{ id: string; name: string }>;
          paymentMethods?: string[];
        };
        if (!response.ok) throw new Error(body.message ?? "Failed to load labor payments.");
        setRows(body.rows ?? []);
        setProjects(body.projects ?? []);
        setPaymentMethods(body.paymentMethods?.length ? body.paymentMethods : ["ACH"]);
      } catch (e) {
        setRows([]);
        setError(e instanceof Error ? e.message : "Failed to load labor payments.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [startDate, endDate, projectId]
  );

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
    [refresh]
  );

  React.useEffect(() => {
    if (!method && paymentMethods[0]) setMethod(paymentMethods[0]);
  }, [method, paymentMethods]);

  const openModal = (workerId: string, balance: number) => {
    setModalWorkerId(workerId);
    setAmount(Math.max(0, balance));
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setMemo("");
    setModalWarning(null);
  };

  const savePayment = async () => {
    if (!modalWorkerId || !method || busy) return;
    if (amount <= 0) {
      setModalWarning("Amount must be greater than 0.");
      return;
    }
    const worker = rows.find((r) => r.workerId === modalWorkerId);
    if (!worker) return;
    const appliedAmount = Math.min(amount, worker.balance);
    if (amount > worker.balance)
      setModalWarning("Amount exceeded balance. Applied amount was clamped to balance.");

    setBusy(true);
    setError(null);
    const response = await fetch("/api/labor/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workerId: modalWorkerId,
        paymentDate,
        amount: appliedAmount,
        method,
        memo,
        startDate,
        endDate,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) {
      setError(body.message ?? "Failed to record labor payment.");
      setBusy(false);
      return;
    }
    startTransition(() => {
      setMessage("Payment recorded.");
      setModalWorkerId(null);
    });
    setBusy(false);
    setBackgroundRefreshing(true);
    void refresh({ silent: true }).finally(() => setBackgroundRefreshing(false));
  };

  const deletePayment = async (paymentId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const prevRows = rows;
    setRows((prev) =>
      prev.map((r) => {
        const idx = r.payments.findIndex((p) => p.id === paymentId);
        if (idx < 0) return r;
        const newPayments = r.payments.filter((p) => p.id !== paymentId);
        const newPaid = newPayments.reduce((s, p) => s + p.amount, 0);
        return {
          ...r,
          payments: newPayments,
          paidTotal: newPaid,
          balance: Math.max(0, r.confirmedTotal - newPaid),
        };
      })
    );
    const response = await fetch(`/api/labor/payments?id=${encodeURIComponent(paymentId)}`, {
      method: "DELETE",
    });
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) {
      setError(body.message ?? "Failed to delete labor payment.");
      setRows(prevRows);
    }
    setBusy(false);
  };

  const { kpiTotalDue, kpiTotalPaid, kpiOutstanding } = React.useMemo(() => {
    let due = 0;
    let paid = 0;
    let out = 0;
    for (const r of rows) {
      due += r.confirmedTotal;
      paid += r.paidTotal;
      out += r.balance;
    }
    return { kpiTotalDue: due, kpiTotalPaid: paid, kpiOutstanding: out };
  }, [rows]);
  const modalWorker = rows.find((r) => r.workerId === modalWorkerId);

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Labor Payments"
        description="Weekly pay run summary from confirmed labor only."
      />

      {error ? (
        <div className="rounded-lg border border-border/60 bg-background px-4 py-3">
          <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
        </div>
      ) : null}

      <FilterBar>
        <div className="grid w-full gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <p className={TYPO.sectionLabel}>Start</p>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <p className={TYPO.sectionLabel}>End</p>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <p className={TYPO.sectionLabel}>Project</p>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </FilterBar>

      <Card className="overflow-hidden p-0">
        <div className="grid divide-y divide-[#E5E7EB] sm:grid-cols-3 sm:divide-y-0 sm:divide-x dark:divide-border/60">
          <div className="p-5">
            <p className={TYPO.kpiLabel}>Total Due</p>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-24" />
            ) : (
              <p className={cn("mt-1 text-lg", amountClass("neutral"))}>
                {formatCurrency(kpiTotalDue)}
              </p>
            )}
          </div>
          <div className="p-5">
            <p className={TYPO.kpiLabel}>Total Paid</p>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-24" />
            ) : (
              <p className={cn("mt-1 text-lg", amountClass("income"))}>
                {formatCurrency(kpiTotalPaid)}
              </p>
            )}
          </div>
          <div className="p-5">
            <p className={TYPO.kpiLabel}>Outstanding</p>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-24" />
            ) : (
              <p
                className={cn(
                  "mt-1 text-lg",
                  amountClass(kpiOutstanding > 0 ? "expense" : "neutral")
                )}
              >
                {formatCurrency(kpiOutstanding)}
              </p>
            )}
          </div>
        </div>
      </Card>

      {message ? (
        <div className="rounded-lg border border-gray-100 dark:border-border bg-background px-3 py-2 text-sm text-muted-foreground">
          {message}
        </div>
      ) : null}
      {backgroundRefreshing ? (
        <p className="text-xs text-muted-foreground" role="status">
          Updating pay run totals…
        </p>
      ) : null}

      <div className="airtable-table-wrap airtable-table-wrap--ruled">
        <div className="airtable-table-scroll">
          <table className="w-full min-w-[520px] text-sm md:min-w-0">
            <thead>
              <tr>
                <th className={cn("h-8 px-3 text-left align-middle", TYPO.tableHeader)}>Worker</th>
                <th className={cn("h-8 px-3 text-right align-middle", TYPO.tableHeader)}>
                  Confirmed Total
                </th>
                <th className={cn("h-8 px-3 text-right align-middle", TYPO.tableHeader)}>
                  Paid Total
                </th>
                <th className={cn("h-8 px-3 text-right align-middle", TYPO.tableHeader)}>
                  Balance
                </th>
                <th className={cn("h-8 px-3 text-left align-middle", TYPO.tableHeader)}>Status</th>
                <th className={cn("h-8 px-3 text-right align-middle", TYPO.tableHeader)}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="h-11 min-h-[44px] px-3 py-0" colSpan={6}>
                      <Skeleton className="h-10 w-full" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    className="h-11 min-h-[44px] px-3 py-0 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    No data yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <React.Fragment key={row.workerId}>
                    <tr className={listTableRowStaticClassName}>
                      <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px] font-medium text-foreground">
                        <button
                          type="button"
                          className="hover:underline text-left"
                          onClick={() =>
                            setExpandedWorkerId((prev) =>
                              prev === row.workerId ? null : row.workerId
                            )
                          }
                        >
                          {row.workerName}
                        </button>
                      </td>
                      <td
                        className={cn(
                          "h-11 min-h-[44px] px-3 py-0 text-right align-middle",
                          amountClass("neutral")
                        )}
                      >
                        {formatCurrency(row.confirmedTotal)}
                      </td>
                      <td
                        className={cn(
                          "h-11 min-h-[44px] px-3 py-0 text-right align-middle",
                          amountClass("income")
                        )}
                      >
                        {formatCurrency(row.paidTotal)}
                      </td>
                      <td
                        className={cn(
                          "h-11 min-h-[44px] px-3 py-0 text-right align-middle",
                          amountClass(row.balance > 0 ? "expense" : "neutral")
                        )}
                      >
                        {formatCurrency(row.balance)}
                      </td>
                      <td className="h-11 min-h-[44px] px-3 py-0 align-middle text-[13px]">
                        <span
                          className={
                            row.balance > 0 ? "hh-pill-warning text-xs" : "hh-pill-success text-xs"
                          }
                        >
                          {row.balance > 0 ? "Outstanding" : "Paid"}
                        </span>
                      </td>
                      <td className="h-11 min-h-[44px] px-3 py-0 text-right align-middle text-[13px]">
                        <RowActionsMenu
                          appearance="list"
                          ariaLabel={`Actions for ${row.workerName}`}
                          actions={[
                            {
                              label: expandedWorkerId === row.workerId ? "Hide History" : "History",
                              onClick: () =>
                                setExpandedWorkerId((prev) =>
                                  prev === row.workerId ? null : row.workerId
                                ),
                            },
                            {
                              label: "Record Payment",
                              onClick: () => openModal(row.workerId, row.balance),
                              disabled: row.balance <= 0 || busy,
                            },
                          ]}
                        />
                      </td>
                    </tr>
                    {expandedWorkerId === row.workerId ? (
                      <tr className="bg-[#F9FAFB] dark:bg-muted/20">
                        <td
                          className="min-h-[44px] px-3 py-3 text-xs text-muted-foreground"
                          colSpan={6}
                        >
                          <div className="space-y-3">
                            <div className="border-b border-gray-100 dark:border-border pb-3">
                              <p className={cn("mb-1", TYPO.sectionLabel)}>Pay Run Source</p>
                              <div className="space-y-1">
                                <div className="flex justify-between gap-4">
                                  <span>Daily confirmed</span>
                                  <span className={amountClass("neutral")}>
                                    {formatCurrency(row.confirmedDailyTotal)}
                                  </span>
                                </div>
                                <div className="flex justify-between gap-4 font-medium text-foreground pt-1 border-t border-gray-100 dark:border-border">
                                  <span>Confirmed total</span>
                                  <span className={amountClass("neutral")}>
                                    {formatCurrency(row.confirmedTotal)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div>
                              <p className={cn("mb-1", TYPO.sectionLabel)}>Payment History</p>
                              {row.payments.length === 0 ? (
                                <span>No payments in selected range.</span>
                              ) : (
                                <ul className="space-y-1">
                                  {row.payments.map((p) => (
                                    <li
                                      key={p.id}
                                      className="flex justify-between gap-4 items-center"
                                    >
                                      <span>
                                        <span className={LEDGER_DATE_CLASS}>
                                          {formatLedgerDate(p.paymentDate)}
                                        </span>{" "}
                                        • {p.method} {p.memo ? `• ${p.memo}` : ""}
                                      </span>
                                      <span className={amountClass("income")}>
                                        {formatCurrency(p.amount)}
                                      </span>
                                      <DeleteRowAction
                                        title="Delete this labor payment?"
                                        description="Removes this pay run record from the selected date range."
                                        disabled={busy}
                                        busy={busy}
                                        onDelete={() => deletePayment(p.id)}
                                      />
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalWorkerId ? (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm p-4 flex items-center justify-center">
          <Card className="w-full max-w-[560px] p-6">
            <h3 className="text-base font-semibold text-foreground">
              Record Payment — {modalWorker?.workerName ?? "Worker"}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Applied range: {formatDate(startDate)} to {formatDate(endDate)}
            </p>
            <div className="mt-4 grid gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Date
                </label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Amount
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value) || 0)}
                  className="mt-1 text-right tabular-nums"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Method
                </label>
                <Select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="mt-1 w-full"
                >
                  {paymentMethods.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Memo (optional)
                </label>
                <Input
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="Memo"
                  className="mt-1"
                />
              </div>
              {modalWarning ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">{modalWarning}</p>
              ) : null}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModalWorkerId(null)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={savePayment} disabled={amount <= 0 || busy}>
                <SubmitSpinner loading={busy} className="mr-2" />
                {busy ? "Recording…" : "Save Payment"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
