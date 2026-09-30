"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import {
  getLaborInvoices,
  getWorkers,
  deleteLaborInvoice,
  voidLaborInvoice,
  type LaborInvoice,
} from "@/lib/data";
import { FilterBar } from "@/components/filter-bar";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/formatters";
import { formatOverviewMoney } from "@/lib/financial/project-overview-display";
import { ConfirmDialog } from "@/components/base";
import { sectionCardClass } from "@/components/ui/section-card";
import { cn } from "@/lib/utils";

export default function LaborInvoicesPage() {
  const [rows, setRows] = React.useState<LaborInvoice[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<"" | LaborInvoice["status"]>("");
  const [fromDate, setFromDate] = React.useState("");
  const [toDate, setToDate] = React.useState("");
  const [workers, setWorkers] = React.useState<Awaited<ReturnType<typeof getWorkers>>>([]);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [confirmAction, setConfirmAction] = React.useState<{
    id: string;
    kind: "delete" | "void";
  } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    getLaborInvoices().then((list) => {
      if (!cancelled) setRows(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    getWorkers().then((list) => {
      if (!cancelled) setWorkers(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const workersMap = React.useMemo(() => new Map(workers.map((w) => [w.id, w.name])), [workers]);

  const refresh = React.useCallback(async () => {
    const list = await getLaborInvoices();
    setRows(list);
  }, []);

  const reloadWorkers = React.useCallback(async () => {
    const list = await getWorkers();
    setWorkers(list);
  }, []);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
      void reloadWorkers();
    }, [refresh, reloadWorkers]),
    [refresh, reloadWorkers]
  );

  const handleDelete = async () => {
    if (!confirmAction || confirmAction.kind !== "delete") return;
    const id = confirmAction.id;
    const target = rows.find((r) => r.id === id);
    if (!target) return;
    if (target.status === "confirmed") {
      setMessage("Confirmed invoice cannot be deleted. Void it instead.");
      return;
    }
    const prev = rows;
    setBusyId(id);
    setRows((list) => list.filter((row) => row.id !== id));
    try {
      await deleteLaborInvoice(id);
      setMessage("Invoice deleted.");
    } catch (cause) {
      setRows(prev);
      throw cause instanceof Error ? cause : new Error("Delete failed.");
    } finally {
      setBusyId(null);
    }
  };

  const handleVoid = async () => {
    if (!confirmAction || confirmAction.kind !== "void") return;
    const id = confirmAction.id;
    const prev = rows;
    setBusyId(id);
    setRows((list) => list.map((row) => (row.id === id ? { ...row, status: "void" } : row)));
    try {
      const updated = await voidLaborInvoice(id);
      if (!updated) {
        setRows(prev);
        throw new Error("Void failed.");
      }
      setMessage("Invoice voided.");
    } catch (cause) {
      setRows(prev);
      throw cause instanceof Error ? cause : new Error("Void failed.");
    } finally {
      setBusyId(null);
    }
  };

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status && r.status !== status) return false;
      if (fromDate && r.invoiceDate < fromDate) return false;
      if (toDate && r.invoiceDate > toDate) return false;
      if (!q) return true;
      const workerName = (workersMap.get(r.workerId) ?? "").toLowerCase();
      return r.invoiceNo.toLowerCase().includes(q) || workerName.includes(q);
    });
  }, [rows, search, status, fromDate, toDate, workersMap]);

  return (
    <div className="hh-list-frame page-stack py-3 md:py-6">
      <PageHeader
        variant="workspace"
        title="Labor Invoices"
        subtitle="Worker invoices/receipts with attachment and project split review."
        actions={
          <Link href="/labor/invoices/new">
            <Button size="sm" className="rounded-hh-compact">
              + New Invoice
            </Button>
          </Link>
        }
      />
      <FilterBar className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search invoice # or worker"
          className="h-10 rounded-hh-compact"
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as "" | LaborInvoice["status"])}
        >
          <option value="">All status</option>
          <option value="draft">Draft</option>
          <option value="reviewed">Reviewed</option>
          <option value="confirmed">Confirmed</option>
          <option value="void">Void</option>
        </Select>
        <Input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="h-10 rounded-hh-compact"
        />
        <Input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="h-10 rounded-hh-compact"
        />
      </FilterBar>
      {message ? (
        <p className="border-b border-[var(--hh-line)] pb-3 text-sm text-[var(--hh-muted)]">
          {message}
        </p>
      ) : null}
      <div className={cn(sectionCardClass, "overflow-x-auto")}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--hh-line)] bg-[var(--hh-l0-canvas)]">
                <th className="px-4 py-3 text-left text-hh-table-header font-medium uppercase tracking-normal text-[var(--hh-muted)]">
                  Invoice #
                </th>
                <th className="px-4 py-3 text-left text-hh-table-header font-medium uppercase tracking-normal text-[var(--hh-muted)]">
                  Worker
                </th>
                <th className="px-4 py-3 text-left text-hh-table-header font-medium uppercase tracking-normal text-[var(--hh-muted)]">
                  Date
                </th>
                <th className="px-4 py-3 text-right text-hh-table-header font-medium uppercase tracking-normal text-[var(--hh-muted)]">
                  Amount
                </th>
                <th className="px-4 py-3 text-right text-hh-table-header font-medium uppercase tracking-normal text-[var(--hh-muted)]">
                  Split Projects
                </th>
                <th className="px-4 py-3 text-left text-hh-table-header font-medium uppercase tracking-normal text-[var(--hh-muted)]">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-hh-table-header font-medium uppercase tracking-normal text-[var(--hh-muted)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  className="group border-b border-[var(--hh-line)] bg-[var(--hh-surface)] transition-colors last:border-b-0 hover:bg-[var(--hh-l3-hover)]"
                >
                  <td className="px-4 py-3 font-medium text-[var(--hh-ink)]">{row.invoiceNo}</td>
                  <td className="py-3 px-4">{workersMap.get(row.workerId) ?? "Unknown worker"}</td>
                  <td className="hh-fin px-4 py-3 tracking-normal text-[var(--hh-muted)]">
                    {formatDate(row.invoiceDate)}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums">
                    {formatOverviewMoney(row.amount)}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums">{row.projectSplits.length}</td>
                  <td className="py-3 px-4">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex justify-end gap-2">
                      <Link href={`/labor/invoices/${row.id}`}>
                        <Button size="sm" variant="outline" className="h-8 rounded-hh-compact">
                          View/Edit
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-hh-compact"
                        onClick={() => setConfirmAction({ id: row.id, kind: "void" })}
                        disabled={row.status === "void" || busyId === row.id}
                      >
                        {busyId === row.id ? "Working..." : "Void"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-hh-compact"
                        onClick={() => setConfirmAction({ id: row.id, kind: "delete" })}
                        disabled={busyId === row.id}
                      >
                        {busyId === row.id ? "Working..." : "Delete"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-[var(--hh-muted)]" colSpan={7}>
                    No labor invoices yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      <ConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        title={confirmAction?.kind === "void" ? "Void labor invoice?" : "Delete labor invoice?"}
        description={
          confirmAction?.kind === "void"
            ? "Void this labor invoice? Its financial history will remain visible."
            : "Delete this draft labor invoice? This cannot be undone."
        }
        confirmLabel={confirmAction?.kind === "void" ? "Void" : "Delete"}
        destructive
        loading={!!busyId}
        onConfirm={confirmAction?.kind === "void" ? handleVoid : handleDelete}
      />
    </div>
  );
}
