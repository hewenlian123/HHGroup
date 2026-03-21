"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterBar } from "@/components/filter-bar";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
import { DeleteRowAction } from "@/components/base";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createBrowserClient } from "@/lib/supabase";
import {
  listTableAmountCellClassName,
  listTablePrimaryCellClassName,
  listTableRowClassName,
} from "@/lib/list-table-interaction";
import { cn } from "@/lib/utils";

type LaborInvoiceStatus = "draft" | "reviewed" | "confirmed" | "void";

type LaborInvoiceRow = {
  id: string;
  invoice_no: string;
  worker_id: string;
  invoice_date: string;
  amount: number;
  project_splits: { projectId: string; amount: number }[];
  status: LaborInvoiceStatus;
};

type WorkerOption = { id: string; name: string };

function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isMissingTableError(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "42P01";
}

export default function LaborInvoicesListClient() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [invoices, setInvoices] = React.useState<LaborInvoiceRow[]>([]);
  const [workers, setWorkers] = React.useState<WorkerOption[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<"" | LaborInvoiceStatus>("");
  const [fromDate, setFromDate] = React.useState("");
  const [toDate, setToDate] = React.useState("");
  const [voidConfirmId, setVoidConfirmId] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

  const refresh = React.useCallback(async () => {
    if (!supabase) {
      setInvoices([]);
      setWorkers([]);
      setLoading(false);
      setError(configured ? "Supabase client unavailable." : "Supabase is not configured.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    setVoidConfirmId(null);

    const [
      { data: invData, error: invErr },
      { data: workerData, error: workerErr },
    ] = await Promise.all([
      supabase.from("labor_invoices").select("id,invoice_no,worker_id,invoice_date,amount,project_splits,status").order("created_at", { ascending: false }).limit(500),
      supabase.from("workers").select("id,name").order("created_at", { ascending: false }).limit(500),
    ]);

    if (invErr) {
      if (isMissingTableError(invErr)) setInvoices([]);
      else setError(invErr.message);
    } else {
      setInvoices((invData ?? []).map((r) => {
        const row = r as { id: string; invoice_no: string; worker_id: string; invoice_date: string; amount?: unknown; project_splits?: { projectId?: string; amount?: number }[]; status: string };
        const splits = Array.isArray(row.project_splits)
          ? row.project_splits.map((s) => ({ projectId: s.projectId ?? "", amount: Number.isFinite(s.amount) ? Number(s.amount) : 0 }))
          : [];
        return {
          id: row.id,
          invoice_no: row.invoice_no,
          worker_id: row.worker_id,
          invoice_date: row.invoice_date,
          amount: safeNumber(row.amount),
          project_splits: splits,
          status: row.status as LaborInvoiceStatus,
        };
      }));
    }

    if (workerErr) {
      if (!isMissingTableError(workerErr)) setError((e) => e ?? workerErr.message);
      setWorkers([]);
    } else {
      setWorkers((workerData ?? []).map((w) => ({ id: (w as { id: string }).id, name: (w as { name: string }).name ?? "" })));
    }
    setLoading(false);
  }, [supabase, configured]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
    [refresh]
  );

  const workersMap = React.useMemo(() => new Map(workers.map((w) => [w.id, w.name])), [workers]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((r) => {
      if (status && r.status !== status) return false;
      if (fromDate && r.invoice_date < fromDate) return false;
      if (toDate && r.invoice_date > toDate) return false;
      if (!q) return true;
      const workerName = (workersMap.get(r.worker_id) ?? "").toLowerCase();
      return (r.invoice_no ?? "").toLowerCase().includes(q) || workerName.includes(q);
    });
  }, [invoices, search, status, fromDate, toDate, workersMap]);

  const handleDelete = React.useCallback(
    async (id: string) => {
      const row = invoices.find((r) => r.id === id);
      if (!row) return;
      if (row.status === "confirmed") {
        setMessage("Confirmed invoice cannot be deleted. Void it instead.");
        return;
      }
      if (!supabase) return;
      setError(null);
      let snapshot: LaborInvoiceRow[] | undefined;
      setInvoices((inv) => {
        snapshot = inv;
        return inv.filter((r) => r.id !== id);
      });
      setBusyId(id);
      const { error: delErr } = await supabase.from("labor_invoices").delete().eq("id", id);
      if (delErr) {
        setError(delErr.message);
        if (snapshot) setInvoices(snapshot);
      } else setMessage("Invoice deleted.");
      setBusyId(null);
    },
    [invoices, supabase]
  );

  const handleVoid = React.useCallback(
    async (id: string) => {
      if (!supabase) return;
      setBusyId(id);
      setError(null);
      setInvoices((inv) => inv.map((r) => (r.id === id ? { ...r, status: "void" as const } : r)));
      const { error: updateErr } = await supabase.from("labor_invoices").update({ status: "void" }).eq("id", id);
      if (updateErr) {
        setError(updateErr.message);
        void refresh();
      } else setMessage("Invoice voided.");
      setVoidConfirmId(null);
      setBusyId(null);
    },
    [supabase, refresh]
  );

  return (
    <div className="page-container page-stack py-6">
      <PageHeader
        title="Labor Invoices"
        subtitle="Worker invoices/receipts with attachment and project split review."
        actions={
          <Link href="/labor/invoices/new" className="w-full sm:w-auto block sm:inline-block">
            <Button size="sm" className="w-full sm:w-auto">+ New Invoice</Button>
          </Link>
        }
      />
      <FilterBar>
        <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground">Search</p>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Invoice # or worker" />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground">Status</p>
            <Select value={status} onChange={(e) => setStatus(e.target.value as "" | LaborInvoiceStatus)}>
              <option value="">All status</option>
              <option value="draft">Draft</option>
              <option value="reviewed">Reviewed</option>
              <option value="confirmed">Confirmed</option>
              <option value="void">Void</option>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground">From</p>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-400 dark:text-muted-foreground">To</p>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </div>
      </FilterBar>
      {message ? (
        <div className="rounded-lg border border-[#EBEBE9] dark:border-border bg-background px-3 py-2 text-sm text-muted-foreground">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-border/60 bg-background px-4 py-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : null}
      <Card className="overflow-hidden p-0">
        <div className="table-responsive">
          <table className="w-full min-w-[560px] text-sm md:min-w-0">
            <thead>
              <tr className="border-b border-[#EBEBE9] dark:border-border/60 bg-[#F7F7F5] dark:bg-muted/30">
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
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7}>
                      <Skeleton className="h-12 w-full" />
                    </td>
                  </tr>
                ))
              ) : (
                <>
                  {filtered.map((row) => (
                    <tr
                      key={row.id}
                      className={cn(listTableRowClassName, "border-b border-[#EBEBE9]/80 dark:border-border/30")}
                      onClick={() => router.push(`/labor/invoices/${row.id}`)}
                    >
                      <td className="py-3 px-4 font-medium text-foreground">
                        <span className={cn(listTablePrimaryCellClassName, "hover:underline")}>{row.invoice_no}</span>
                      </td>
                      <td className="py-3 px-4">{workersMap.get(row.worker_id) ?? "Unknown worker"}</td>
                      <td className="py-3 px-4 tabular-nums text-muted-foreground">{row.invoice_date}</td>
                      <td className={cn("py-3 px-4 text-right tabular-nums", listTableAmountCellClassName)}>
                        {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(row.amount)}
                      </td>
                      <td className={cn("py-3 px-4 text-right tabular-nums", listTableAmountCellClassName)}>{row.project_splits?.length ?? 0}</td>
                      <td className="py-3 px-4">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center justify-end gap-1">
                          <DeleteRowAction
                            disabled={row.status === "confirmed" || !!busyId}
                            busy={busyId === row.id}
                            title="Delete this labor invoice?"
                            onDelete={() => handleDelete(row.id)}
                          />
                          <RowActionsMenu
                            appearance="list"
                            ariaLabel={`Actions for ${row.invoice_no}`}
                            actions={[
                              { label: "View", onClick: () => { void router.push(`/labor/invoices/${row.id}`); } },
                              ...(row.status !== "void"
                                ? [{ label: "Void", onClick: () => setVoidConfirmId(row.id), disabled: !!busyId, destructive: true }]
                                : []),
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && !loading ? (
                    <tr>
                      <td className="py-8 px-4 text-center text-muted-foreground" colSpan={7}>
                        {configured ? "No labor invoices yet." : "Supabase is not configured."}
                      </td>
                    </tr>
                  ) : null}
                </>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!voidConfirmId} onOpenChange={(open) => !open && setVoidConfirmId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Void invoice</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This cannot be undone.</p>
          <DialogFooter className="gap-2 pt-3 border-t border-border/60">
            <Button variant="ghost" size="sm" onClick={() => setVoidConfirmId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!!busyId}
              onClick={async () => {
                if (!voidConfirmId) return;
                await handleVoid(voidConfirmId);
                setVoidConfirmId(null);
              }}
            >
              Void
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
