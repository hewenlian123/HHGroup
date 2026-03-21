"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getLaborInvoices, getWorkers, deleteLaborInvoice, voidLaborInvoice, type LaborInvoice } from "@/lib/data";
import { FilterBar } from "@/components/filter-bar";
import { StatusBadge } from "@/components/status-badge";

export default function LaborInvoicesPage() {
  const [rows, setRows] = React.useState<LaborInvoice[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<"" | LaborInvoice["status"]>("");
  const [fromDate, setFromDate] = React.useState("");
  const [toDate, setToDate] = React.useState("");
  const [workers, setWorkers] = React.useState<Awaited<ReturnType<typeof getWorkers>>>([]);

  React.useEffect(() => {
    let cancelled = false;
    getLaborInvoices().then((list) => {
      if (!cancelled) setRows(list);
    });
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    getWorkers().then((list) => {
      if (!cancelled) setWorkers(list);
    });
    return () => { cancelled = true; };
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

  const handleDelete = async (id: string) => {
    const target = rows.find((r) => r.id === id);
    if (!target) return;
    if (target.status === "confirmed") {
      setMessage("Confirmed invoice cannot be deleted. Void it instead.");
      return;
    }
    await deleteLaborInvoice(id);
    setMessage("Invoice deleted.");
    await refresh();
  };

  const handleVoid = async (id: string) => {
    if (!window.confirm("Void this invoice?")) return;
    const updated = await voidLaborInvoice(id);
    setMessage(updated ? "Invoice voided." : "Void failed.");
    await refresh();
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
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Labor Invoices"
        subtitle="Worker invoices/receipts with attachment and project split review."
        actions={
          <Link href="/labor/invoices/new">
            <Button size="sm" className="rounded-sm">
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
          className="h-10 rounded-sm"
        />
        <Select value={status} onChange={(e) => setStatus(e.target.value as "" | LaborInvoice["status"])}>
          <option value="">All status</option>
          <option value="draft">Draft</option>
          <option value="reviewed">Reviewed</option>
          <option value="confirmed">Confirmed</option>
          <option value="void">Void</option>
        </Select>
        <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-10 rounded-sm" />
        <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-10 rounded-sm" />
      </FilterBar>
      {message ? (
        <p className="border-b border-[#EBEBE9] pb-3 text-sm text-muted-foreground dark:border-border">{message}</p>
      ) : null}
      <div className="overflow-hidden rounded-sm border border-[#EBEBE9] dark:border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#EBEBE9] bg-[#F7F7F5] dark:border-border/60 dark:bg-muted/30">
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Invoice #</th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Worker</th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Date</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Amount</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Split Projects</th>
                <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Status</th>
                <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  className="group border-b border-[#EBEBE9]/80 transition-colors hover:bg-[#F7F7F5] dark:border-border/40 dark:hover:bg-muted/20"
                >
                  <td className="py-3 px-4 font-medium text-foreground">{row.invoiceNo}</td>
                  <td className="py-3 px-4">{workersMap.get(row.workerId) ?? "Unknown worker"}</td>
                  <td className="py-3 px-4 tabular-nums">{row.invoiceDate}</td>
                  <td className="py-3 px-4 text-right tabular-nums">
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(row.amount)}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums">{row.projectSplits.length}</td>
                  <td className="py-3 px-4"><StatusBadge status={row.status} /></td>
                  <td className="py-3 px-4">
                    <div className="flex justify-end gap-2">
                      <Link href={`/labor/invoices/${row.id}`}>
                        <Button size="sm" variant="outline" className="h-8 rounded-sm">
                          View/Edit
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-sm"
                        onClick={() => handleVoid(row.id)}
                        disabled={row.status === "void"}
                      >
                        Void
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 rounded-sm" onClick={() => handleDelete(row.id)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td className="py-8 px-4 text-center text-muted-foreground" colSpan={7}>
                    No labor invoices yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
