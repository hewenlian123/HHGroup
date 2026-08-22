"use client";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NeoFieldLabel, NeoInput, NeoPanel, NeoTable, StatusBadge } from "@/components/base";
import { Button } from "@/components/ui/button";
import { tableRawTdClass, tableRawThClass } from "@/components/ui/table";
import type { SubcontractPaymentScheduleRow, SubcontractWithSubcontractor } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  addPaymentScheduleItemAction,
  createApBillFromScheduleAction,
  updateSubcontractStatusAction,
} from "./actions";

const STATUSES: Array<SubcontractWithSubcontractor["status"]> = [
  "Draft",
  "Active",
  "Completed",
  "Cancelled",
];

export function SubcontractDetailClient({
  projectId,
  subcontract,
}: {
  projectId: string;
  subcontract: SubcontractWithSubcontractor;
}) {
  const router = useRouter();
  const [status, setStatus] = React.useState(subcontract.status ?? "Draft");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => setStatus(subcontract.status ?? "Draft"), [subcontract.status]);

  useOnAppSync(
    React.useCallback(() => {
      syncRouterNonBlocking(router);
    }, [router]),
    [router]
  );

  const handleChange = async (next: SubcontractWithSubcontractor["status"]) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await updateSubcontractStatusAction(projectId, subcontract.id, next);
    if (res.ok) {
      setStatus(next);
      syncRouterNonBlocking(router);
    } else {
      setError(res.error ?? "Failed to update status.");
    }
    setBusy(false);
  };

  const allowedTransitions = (cur: SubcontractWithSubcontractor["status"]) => {
    if (cur === "Draft") return ["Draft", "Active"] as const;
    if (cur === "Active") return ["Active", "Completed", "Cancelled"] as const;
    return [cur] as const;
  };

  const options = allowedTransitions(status);
  const optionsSet = React.useMemo(
    () => new Set<string>(options as unknown as string[]),
    [options]
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-hh-metadata text-[var(--hh-text-secondary)]">Status</span>
      <select
        value={status}
        onChange={(e) => handleChange(e.target.value as SubcontractWithSubcontractor["status"])}
        disabled={busy || options.length <= 1}
        className="h-8 rounded border border-input bg-transparent px-2 text-hh-metadata"
      >
        {STATUSES.filter((s) => optionsSet.has(s)).map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <Button asChild variant="outline" size="sm" className="h-8">
        <Link href={`/projects/${projectId}/subcontracts/${subcontract.id}/bills`}>Bills</Link>
      </Button>
      {error ? <span className="text-hh-metadata text-[var(--hh-danger)]">{error}</span> : null}
    </div>
  );
}

export function SubcontractPaymentScheduleClient({
  projectId,
  subcontractId,
  subcontractorId,
  scheduleItems,
}: {
  projectId: string;
  subcontractId: string;
  subcontractorId: string;
  scheduleItems: SubcontractPaymentScheduleRow[];
}) {
  const router = useRouter();
  const [items, setItems] = React.useState(scheduleItems);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [creatingId, setCreatingId] = React.useState<string | null>(null);
  const [createdBillIds, setCreatedBillIds] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => setItems(scheduleItems), [scheduleItems]);

  const sortItems = React.useCallback((nextItems: SubcontractPaymentScheduleRow[]) => {
    return [...nextItems].sort((a, b) => {
      const dueA = a.due_date ?? "";
      const dueB = b.due_date ?? "";
      if (dueA !== dueB) return dueA.localeCompare(dueB);
      return (a.created_at ?? "").localeCompare(b.created_at ?? "");
    });
  }, []);

  const handleAddSchedule = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!title.trim()) {
      setError("Schedule title is required.");
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Schedule amount must be greater than 0.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await addPaymentScheduleItemAction({
      projectId,
      subcontractId,
      subcontractorId,
      title,
      description,
      amount: parsedAmount,
      dueDate,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? "Failed to add schedule item.");
      return;
    }
    if (result.item) {
      setItems((prev) =>
        sortItems([...prev.filter((item) => item.id !== result.item!.id), result.item!])
      );
    }
    setTitle("");
    setDescription("");
    setAmount("");
    setDueDate("");
    syncRouterNonBlocking(router);
  };

  const handleCreateBill = async (scheduleId: string) => {
    setCreatingId(scheduleId);
    setError(null);
    const result = await createApBillFromScheduleAction({
      projectId,
      subcontractId,
      scheduleId,
    });
    setCreatingId(null);
    if (!result.ok || !result.billId) {
      setError(result.error ?? "Failed to create AP bill.");
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        item.id === scheduleId
          ? { ...item, status: "billed" as const, ap_bill_id: result.billId! }
          : item
      )
    );
    setCreatedBillIds((prev) => ({ ...prev, [scheduleId]: result.billId! }));
    syncRouterNonBlocking(router);
  };

  return (
    <NeoPanel title="Payment Schedule" bodyClassName="p-0">
      <form
        onSubmit={handleAddSchedule}
        className="grid gap-3 border-b border-[var(--hh-border)] p-4 md:grid-cols-[1.3fr_1fr_0.8fr_0.8fr_auto]"
      >
        <div className="min-w-0 space-y-1.5">
          <NeoFieldLabel required>Title</NeoFieldLabel>
          <NeoInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Deposit, rough-in, final"
            className="h-10 rounded-hh-standard"
            required
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <NeoFieldLabel>Description</NeoFieldLabel>
          <NeoInput
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="h-10 rounded-hh-standard"
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <NeoFieldLabel required>Amount</NeoFieldLabel>
          <NeoInput
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="neo-amount h-10 rounded-hh-standard tabular-nums"
            required
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <NeoFieldLabel>Due date</NeoFieldLabel>
          <NeoInput
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="h-10 rounded-hh-standard tabular-nums"
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" size="sm" className="min-h-10 w-full" disabled={submitting}>
            {submitting ? "Adding..." : "Add"}
          </Button>
        </div>
        {error ? (
          <p className="rounded-hh-standard border border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] px-3 py-2 text-hh-metadata font-medium text-[var(--hh-danger)] md:col-span-5">
            {error}
          </p>
        ) : null}
      </form>

      {items.length === 0 ? (
        <p className="px-4 py-6 text-hh-body text-[var(--hh-text-secondary)]">
          No payment schedule items yet.
        </p>
      ) : (
        <NeoTable className="rounded-none border-0 shadow-none" tableClassName="min-w-[760px]">
          <thead>
            <tr>
              <th className={tableRawThClass}>Title</th>
              <th className={cn(tableRawThClass, "text-right tabular-nums")}>Amount</th>
              <th className={tableRawThClass}>Due</th>
              <th className={tableRawThClass}>Status</th>
              <th className={cn(tableRawThClass, "text-right")}>Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const billId = item.ap_bill_id ?? createdBillIds[item.id] ?? null;
              return (
                <tr key={item.id} className="border-b border-[var(--hh-border)] last:border-b-0">
                  <td className={cn(tableRawTdClass, "max-w-[260px]")}>
                    <span className="block truncate font-medium text-[var(--hh-text-primary)]">
                      {item.title}
                    </span>
                    {item.description ? (
                      <span className="mt-0.5 block truncate text-hh-metadata text-[var(--hh-text-secondary)]">
                        {item.description}
                      </span>
                    ) : null}
                  </td>
                  <td className={cn(tableRawTdClass, "text-right tabular-nums")}>
                    {formatCurrency(item.amount)}
                  </td>
                  <td className={tableRawTdClass}>{formatDate(item.due_date)}</td>
                  <td className={tableRawTdClass}>
                    <StatusBadge
                      label={billId ? "Billed" : item.status}
                      variant={billId ? "success" : "muted"}
                    />
                  </td>
                  <td className={cn(tableRawTdClass, "text-right")}>
                    {billId ? (
                      <Button asChild variant="outline" size="sm" className="h-8">
                        <Link href={`/bills/${billId}`}>View AP Bill</Link>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={creatingId === item.id}
                        onClick={() => void handleCreateBill(item.id)}
                      >
                        {creatingId === item.id ? "Creating..." : "Create AP Bill"}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </NeoTable>
      )}
    </NeoPanel>
  );
}
