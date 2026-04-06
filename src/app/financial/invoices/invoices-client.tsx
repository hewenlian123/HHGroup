"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { FilterBar } from "@/components/filter-bar";
import { StatusBadge } from "@/components/status-badge";
import { DataTable, type Column } from "@/components/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase";
import { getInvoicesWithDerivedPaged } from "@/lib/data";
import { deleteInvoiceAction } from "./actions";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
import {
  Dialog,
  DialogContent,
  DialogDestructiveStrip,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Search } from "lucide-react";
import { Pagination } from "@/components/ui/pagination";
import { FILTER_CONTROL_CLASS } from "@/lib/native-field-classes";

type InvoiceStatus = "Draft" | "Sent" | "Partially Paid" | "Paid" | "Void";

type InvoiceRow = {
  id: string;
  invoice_no: string;
  project_id: string | null;
  client_name: string;
  issue_date: string;
  due_date: string;
  status: InvoiceStatus;
  total: number | null;
  /** Derived from invoice_payments, not stored. */
  paidTotal?: number;
  /** Derived from invoice_payments, not stored. */
  balanceDue?: number;
  projects?: { id: string; name: string } | null;
};

type ProjectOption = { id: string; name: string };

const STATUS_OPTIONS: { value: "" | InvoiceStatus; label: string }[] = [
  { value: "", label: "All" },
  { value: "Draft", label: "Draft" },
  { value: "Sent", label: "Sent" },
  { value: "Partially Paid", label: "Partially Paid" },
  { value: "Paid", label: "Paid" },
  { value: "Void", label: "Void" },
];

function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function isMissingTableError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "42P01";
}

export function InvoicesClient() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [invoices, setInvoices] = React.useState<InvoiceRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [projects, setProjects] = React.useState<ProjectOption[]>([]);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"" | InvoiceStatus>("");
  const [projectFilter, setProjectFilter] = React.useState("");
  const [page, setPage] = React.useState(1);
  const pageSize = 20;
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
      setProjects([]);
      setLoading(false);
      setError(configured ? "Supabase client unavailable." : "Supabase is not configured.");
      return;
    }

    setLoading(true);
    setError(null);
    setVoidConfirmId(null);

    try {
      const [{ rows: list, total: totalCount }, { data: projectData, error: projectError }] =
        await Promise.all([
          getInvoicesWithDerivedPaged({
            page,
            pageSize,
            status: statusFilter || undefined,
            projectId: projectFilter || undefined,
            search: search.trim() || undefined,
          }),
          supabase
            .from("projects")
            .select("id,name")
            .order("created_at", { ascending: false })
            .limit(500),
        ]);
      const projectMap = new Map(
        ((projectData ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name])
      );
      const normalized: InvoiceRow[] = list.map((inv) => ({
        id: inv.id,
        invoice_no: inv.invoiceNo,
        project_id: inv.projectId || null,
        client_name: inv.clientName,
        issue_date: inv.issueDate,
        due_date: inv.dueDate,
        status: inv.status as InvoiceStatus,
        total: inv.total,
        paidTotal: inv.paidTotal,
        balanceDue: inv.balanceDue,
        projects: inv.projectId
          ? { id: inv.projectId, name: projectMap.get(inv.projectId) ?? "" }
          : null,
      }));
      setInvoices(normalized);
      setTotal(totalCount ?? normalized.length);

      if (projectError) {
        if (!isMissingTableError(projectError)) setError((prev) => prev ?? projectError.message);
        setProjects([]);
      } else {
        setProjects((projectData ?? []) as ProjectOption[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load invoices.");
    } finally {
      setLoading(false);
    }
  }, [supabase, configured, page, pageSize, statusFilter, projectFilter, search]);

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
    setPage(1);
  }, [search, statusFilter, projectFilter]);

  const columns = React.useMemo<Column<InvoiceRow>[]>(() => {
    return [
      {
        key: "invoice_no",
        header: "Invoice #",
        render: (row) => <span className="font-medium text-foreground">{row.invoice_no}</span>,
      },
      {
        key: "project",
        header: "Project",
        render: (row) => <span className="text-muted-foreground">{row.projects?.name ?? "—"}</span>,
      },
      { key: "client_name", header: "Client" },
      { key: "issue_date", header: "Issue", className: "tabular-nums text-muted-foreground" },
      { key: "due_date", header: "Due", className: "tabular-nums text-muted-foreground" },
      {
        key: "total",
        header: "Total",
        align: "right",
        className: "tabular-nums font-medium",
        render: (row) => money(safeNumber(row.total)),
      },
      {
        key: "paidTotal",
        header: "Paid",
        align: "right",
        className: "tabular-nums text-hh-profit-positive dark:text-hh-profit-positive",
        render: (row) => money(safeNumber(row.paidTotal)),
      },
      {
        key: "balanceDue",
        header: "Balance",
        align: "right",
        className: "tabular-nums font-medium",
        render: (row) => money(safeNumber(row.balanceDue)),
      },
      { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
      {
        key: "actions",
        header: "",
        align: "right",
        className: "w-10",
        render: (row) => {
          const isBusy = busyId === row.id;
          const canDelete = row.status === "Draft" || row.status === "Void";
          return (
            <RowActionsMenu
              appearance="list"
              ariaLabel={`Actions for ${row.invoice_no}`}
              actions={[
                { label: "View", onClick: () => router.push(`/financial/invoices/${row.id}`) },
                { label: "Edit", onClick: () => router.push(`/financial/invoices/${row.id}`) },
                {
                  label: "Delete",
                  onClick: async () => {
                    if (!canDelete || isBusy) return;
                    if (!window.confirm(`Delete invoice "${row.invoice_no}"?`)) return;
                    setBusyId(row.id);
                    setError(null);
                    const result = await deleteInvoiceAction(row.id);
                    if (result.error) setError(result.error);
                    await refresh();
                    setBusyId(null);
                  },
                  destructive: true,
                  disabled: !canDelete || isBusy,
                },
              ]}
            />
          );
        },
      },
    ];
  }, [busyId, refresh, router]);

  return (
    <div className="page-container page-stack">
      <PageHeader
        title="Invoices"
        subtitle="Create and manage invoices. Record payments and track AR."
        actions={
          <Button asChild size="sm">
            <Link href="/financial/invoices/new">
              <Plus className="h-4 w-4 mr-2" />
              New Invoice
            </Link>
          </Button>
        }
      />

      <FilterBar>
        <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1 sm:col-span-2 lg:col-span-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#9CA3AF] dark:text-muted-foreground">
              Search
            </p>
            <div className="relative w-full max-w-[240px]">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]"
                strokeWidth={1.75}
                aria-hidden
              />
              <Input
                placeholder="Invoice #, client, project…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(FILTER_CONTROL_CLASS, "pl-9")}
              />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#9CA3AF] dark:text-muted-foreground">
              Status
            </p>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "" | InvoiceStatus)}
              className={FILTER_CONTROL_CLASS}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#9CA3AF] dark:text-muted-foreground">
              Project
            </p>
            <Select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className={FILTER_CONTROL_CLASS}
            >
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

      {error ? (
        <div className="rounded-lg border border-border/60 bg-background px-4 py-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <Skeleton key={idx} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <>
          <DataTable<InvoiceRow>
            columns={columns}
            data={invoices}
            keyExtractor={(r) => r.id}
            emptyText={configured ? "No data yet." : "Supabase is not configured."}
            onRowClick={(r) => router.push(`/financial/invoices/${r.id}`)}
            primaryColumnKey="invoice_no"
            amountColumnKeys={["total", "paidTotal", "balanceDue"]}
          />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            className="pt-4"
          />
        </>
      )}

      <Dialog open={!!voidConfirmId} onOpenChange={(open) => !open && setVoidConfirmId(null)}>
        <DialogContent className="max-w-[360px] gap-0 overflow-hidden p-0 sm:max-w-[360px]">
          <DialogDestructiveStrip />
          <div className="space-y-4 px-8 pb-8 pt-6">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle>Void invoice</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-[#9CA3AF]">
              This cannot be undone. The invoice will be marked as Void.
            </p>
            <DialogFooter className="mt-0 border-0 bg-transparent p-0 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="border-[0.5px] border-gray-300 bg-white"
                onClick={() => setVoidConfirmId(null)}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="btn-outline-destructive"
                disabled={!!busyId}
                onClick={async () => {
                  if (!voidConfirmId || !supabase) return;
                  setBusyId(voidConfirmId);
                  setError(null);
                  const { error: updateError } = await supabase
                    .from("invoices")
                    .update({ status: "Void" })
                    .eq("id", voidConfirmId);
                  if (updateError) setError(updateError.message);
                  await refresh();
                  setBusyId(null);
                  setVoidConfirmId(null);
                }}
              >
                Void
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
