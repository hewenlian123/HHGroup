"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterSelect } from "@/components/financial/filter-select";
import { clientReimbursementStatusLabel } from "@/lib/client-reimbursement";
import type { ClientReimbursementListRow } from "@/lib/client-reimbursement-db";
import { hawaiiTodayYmd } from "@/lib/hawaii-calendar-date";

type PaymentOption = {
  id: string;
  label: string;
  projectId: string | null;
};

function money(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function ClientReimbursementsClient({
  rows,
  outstanding,
  lockedProjectId,
  paymentsUnavailable,
  payments,
}: {
  rows: ClientReimbursementListRow[];
  outstanding: number;
  lockedProjectId?: string;
  paymentsUnavailable: boolean;
  payments: PaymentOption[];
}) {
  const router = useRouter();
  const [projectId, setProjectId] = React.useState(lockedProjectId ?? "");
  const [clientId, setClientId] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState<"pdf" | "settle" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reimbursedOn, setReimbursedOn] = React.useState(hawaiiTodayYmd());
  const [paymentId, setPaymentId] = React.useState("");

  const projects = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) map.set(row.projectId, row.projectName);
    return [...map.entries()];
  }, [rows]);
  const clients = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) map.set(row.clientId || row.clientName, row.clientName);
    return [...map.entries()];
  }, [rows]);

  const visible = rows.filter((row) => {
    if (projectId && row.projectId !== projectId) return false;
    if (clientId && (row.clientId || row.clientName) !== clientId) return false;
    if (status && row.status !== status) return false;
    return true;
  });
  const visibleOutstanding = visible
    .filter((row) => row.status === "not_requested" || row.status === "requested")
    .reduce((sum, row) => sum + row.amount, 0);
  const selectedRows = rows.filter((row) => selected.includes(row.lineId));
  const selectedTotal = selectedRows.reduce((sum, row) => sum + row.amount, 0);

  function toggle(lineId: string) {
    setSelected((current) =>
      current.includes(lineId) ? current.filter((id) => id !== lineId) : [...current, lineId]
    );
  }

  async function generate() {
    setBusy("pdf");
    setError(null);
    try {
      const response = await fetch("/api/financial/client-reimbursements/generate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineIds: selected }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message || "Could not generate the PDF.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "client-reimbursement.pdf";
      anchor.click();
      URL.revokeObjectURL(url);
      setSelected([]);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate the PDF.");
    } finally {
      setBusy(null);
    }
  }

  async function settle() {
    setBusy("settle");
    setError(null);
    try {
      const response = await fetch("/api/financial/client-reimbursements/settle", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineIds: selected,
          reimbursedOn,
          amount: selectedTotal,
          paymentId: paymentId || null,
        }),
      });
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || "Could not mark these reimbursed.");
      setSelected([]);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not mark these reimbursed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div data-testid="client-reimbursements-view" className="space-y-4 py-4">
      <PageHeader
        title="Client reimbursements"
        description="Expenses the project client should repay. Outstanding is not removed from job cost."
        actions={
          lockedProjectId ? (
            <Button variant="outline" asChild>
              <Link href={`/projects/${lockedProjectId}`}>Back to project</Link>
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link href="/financial/expenses">Expenses</Link>
            </Button>
          )
        }
      />
      <div className="flex flex-wrap gap-6 text-sm">
        <p>
          <span className="text-[var(--hh-text-secondary)]">Reimbursable outstanding </span>
          <span className="font-medium tabular-nums" data-testid="reimbursable-outstanding">
            {money(lockedProjectId ? outstanding : visibleOutstanding)}
          </span>
        </p>
        <p className="text-[var(--hh-text-secondary)]">
          This amount stays in project cost. A customer payment is the recovery and is not deducted
          again.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label="Filter by project"
          value={lockedProjectId ?? projectId}
          onValueChange={lockedProjectId ? () => undefined : setProjectId}
          options={[
            { value: "", label: "All projects" },
            ...projects.map(([id, name]) => ({ value: id, label: name })),
          ]}
        />
        <FilterSelect
          label="Filter by client"
          value={clientId}
          onValueChange={setClientId}
          options={[
            { value: "", label: "All clients" },
            ...clients.map(([id, name]) => ({ value: id, label: name })),
          ]}
        />
        <FilterSelect
          label="Filter by reimbursement status"
          value={status}
          onValueChange={setStatus}
          options={[
            { value: "", label: "All statuses" },
            { value: "not_requested", label: "Not requested" },
            { value: "requested", label: "Requested" },
            { value: "reimbursed", label: "Reimbursed" },
          ]}
        />
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-[var(--hh-text-secondary)]">
          No client-reimbursable expenses match these filters. Mark a line “Reimbursable by client”
          while reviewing an invoice.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--hh-border)]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-secondary)]">
              <tr>
                <th className="px-3 py-2" />
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.lineId} className="border-t border-[var(--hh-border)]">
                  <td className="px-3 py-2">
                    {row.status === "reimbursed" ? null : (
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.vendorName}`}
                        checked={selected.includes(row.lineId)}
                        onChange={() => toggle(row.lineId)}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">{row.expenseDate}</td>
                  <td className="px-3 py-2">
                    <Link href={`/financial/expenses/${row.expenseId}`} className="underline">
                      {row.vendorName}
                    </Link>
                    <div className="text-[var(--hh-text-secondary)]">{row.invoiceNumber}</div>
                  </td>
                  <td className="px-3 py-2">{row.projectName}</td>
                  <td className="px-3 py-2">{row.clientName}</td>
                  <td className="px-3 py-2">
                    {clientReimbursementStatusLabel(row.status)}
                    {row.requestedOn ? ` ${row.requestedOn}` : ""}
                    {row.requestNo ? ` · ${row.requestNo}` : ""}
                    {row.reimbursedOn ? ` ${row.reimbursedOn}` : ""}
                    {row.paymentId ? (
                      <>
                        {" "}
                        <Link href={`/financial/payments/${row.paymentId}`} className="underline">
                          Payment
                        </Link>
                      </>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <Button
          type="button"
          disabled={selected.length === 0 || busy !== null}
          onClick={() => void generate()}
        >
          {busy === "pdf" ? "Generating…" : "Generate reimbursement PDF"}
        </Button>
        <div className="space-y-1">
          <Label htmlFor="reimbursed-on">Reimbursed on</Label>
          <Input
            id="reimbursed-on"
            type="date"
            value={reimbursedOn}
            onChange={(event) => setReimbursedOn(event.target.value)}
          />
        </div>
        <div className="min-w-52 space-y-1">
          <Label htmlFor="reimbursement-payment">Customer payment</Label>
          <select
            id="reimbursement-payment"
            className="h-10 w-full rounded-md border border-[var(--hh-border)] bg-transparent px-2 text-sm"
            value={paymentId}
            onChange={(event) => setPaymentId(event.target.value)}
            disabled={paymentsUnavailable}
          >
            <option value="">No payment link</option>
            {payments.map((payment) => (
              <option key={payment.id} value={payment.id}>
                {payment.label}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={selected.length === 0 || busy !== null}
          onClick={() => void settle()}
        >
          {busy === "settle"
            ? "Saving…"
            : `Mark reimbursed ${selected.length ? money(selectedTotal) : ""}`}
        </Button>
      </div>
      {paymentsUnavailable ? (
        <p className="text-sm text-[var(--hh-warning)]">Customer payments could not be loaded.</p>
      ) : null}
      {error ? <p className="text-sm text-[var(--hh-danger)]">{error}</p> : null}
    </div>
  );
}
