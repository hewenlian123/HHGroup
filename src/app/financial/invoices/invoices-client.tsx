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
import { StatusBadge } from "@/components/status-badge";
import { DataTable, type Column } from "@/components/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase";
import { getInvoicesWithDerivedPaged } from "@/lib/data";
import { deleteInvoiceAction } from "./actions";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DeleteRowAction } from "@/components/base";
import { Plus } from "lucide-react";
import { Pagination } from "@/components/ui/pagination";

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

async function getNextInvoiceNo(supabase: NonNullable<ReturnType<typeof createBrowserClient>>): Promise<string> {
  const { data, error } = await supabase.from("invoices").select("invoice_no").order("created_at", { ascending: false }).limit(50);
  if (error) return `INV-${String(Date.now()).slice(-4)}`;
  const maxSeq =
    (data ?? []).reduce((max, row) => {
      const invNo = (row as { invoice_no?: string }).invoice_no ?? "";
      const m = /^INV-(\d+)$/.exec(invNo.trim());
      if (!m) return max;
      return Math.max(max, Number(m[1]));
    }, 0) || 0;
  return `INV-${String(maxSeq + 1).padStart(4, "0")}`;
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
      const [{ rows: list, total: totalCount }, { data: projectData, error: projectError }] = await Promise.all([
        getInvoicesWithDerivedPaged({
          page,
          pageSize,
          status: statusFilter || undefined,
          projectId: projectFilter || undefined,
          search: search.trim() || undefined,
        }),
        supabase.from("projects").select("id,name").order("created_at", { ascending: false }).limit(500),
      ]);
      const projectMap = new Map(((projectData ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
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
        projects: inv.projectId ? { id: inv.projectId, name: projectMap.get(inv.projectId) ?? "" } : null,
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
        render: (row) => (
          <Link href={`/financial/invoices/${row.id}`} className="font-medium text-primary hover:underline">
            {row.invoice_no}
          </Link>
        ),
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
        className: "tabular-nums text-emerald-600/90 dark:text-emerald-400/90",
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
          const actions = [
            { label: "View", onClick: () => router.push(`/financial/invoices/${row.id}`) },
            ...(row.status !== "Void" && row.status !== "Paid"
              ? [{ label: "Record Payment", onClick: () => router.push(`/financial/invoices/${row.id}?recordPayment=1`) }]
              : []),
            ...(row.status !== "Void"
              ? [
                  {
                    label: "Duplicate",
                    onClick: async () => {
                      if (!supabase) return;
                      setBusyId(row.id);
                      setError(null);
                      try {
                        const { data: inv, error: invError } = await supabase.from("invoices").select("*").eq("id", row.id).maybeSingle();
                        if (invError) throw invError;
                        if (!inv) throw new Error("Invoice not found.");
                        const { data: items, error: itemsError } = await supabase
                          .from("invoice_items")
                          .select("description,quantity,qty,unit_price")
                          .eq("invoice_id", row.id)
                          .order("created_at", { ascending: true });
                        if (itemsError && !isMissingTableError(itemsError)) throw itemsError;
                        const invoice_no = await getNextInvoiceNo(supabase);
                        const { data: created, error: createError } = await supabase
                          .from("invoices")
                          .insert({
                            invoice_no,
                            project_id: (inv as { project_id: string | null }).project_id,
                            customer_id: (inv as { customer_id?: string | null }).customer_id ?? null,
                            client_name: (inv as { client_name: string }).client_name,
                            issue_date: new Date().toISOString().slice(0, 10),
                            due_date: (inv as { due_date: string }).due_date,
                            status: "Draft",
                            notes: (inv as { notes?: string | null }).notes ?? null,
                            tax_pct: safeNumber((inv as { tax_pct?: number | null }).tax_pct ?? 0),
                          })
                          .select("id")
                          .single();
                        if (createError) throw createError;
                        const newId = (created as { id: string }).id;
                        const itemRows = (items ?? []).map((it) => ({
                          invoice_id: newId,
                          description: (it as { description?: string }).description ?? "",
                          quantity: safeNumber((it as { quantity?: number; qty?: number }).quantity ?? (it as { qty?: number }).qty ?? 1),
                          unit_price: safeNumber((it as { unit_price?: number }).unit_price ?? 0),
                        }));
                        if (itemRows.length > 0) {
                          const { error: insertItemsError } = await supabase.from("invoice_items").insert(itemRows);
                          if (insertItemsError) throw insertItemsError;
                        }
                        // Defer navigation so dropdown can unmount first and avoid React removeChild error
                        setTimeout(() => router.push(`/financial/invoices/${newId}`), 0);
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Failed to duplicate invoice.");
                      } finally {
                        setBusyId(null);
                      }
                    },
                    disabled: isBusy,
                  },
                ]
              : []),
            ...(row.status !== "Void" ? [{ label: "Void", onClick: () => setVoidConfirmId(row.id), disabled: isBusy, destructive: true }] : []),
          ];
          const canDelete = row.status === "Draft" || row.status === "Void";
          return (
            <div className="flex items-center justify-end gap-2">
              {canDelete ? (
                <DeleteRowAction
                  busy={isBusy}
                  onDelete={async () => {
                    setBusyId(row.id);
                    setError(null);
                    const result = await deleteInvoiceAction(row.id);
                    if (result.error) setError(result.error);
                    await refresh();
                    setBusyId(null);
                  }}
                />
              ) : null}
              <RowActionsMenu ariaLabel={`Actions for ${row.invoice_no}`} actions={actions} />
            </div>
          );
        },
      },
    ];
  }, [busyId, refresh, router, supabase]);

  return (
    <div className="page-container page-stack py-6">
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

      <FilterBar className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            placeholder="Search invoice #, client, project..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 max-w-xs"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | InvoiceStatus)}
            className="flex h-10 rounded-[10px] border border-input bg-muted/20 px-3 text-sm"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="flex h-10 rounded-[10px] border border-input bg-muted/20 px-3 text-sm"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </FilterBar>

      {error ? (
        <Card className="p-5">
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 8 }).map((_, idx) => (
              <Skeleton key={idx} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <DataTable<InvoiceRow>
            columns={columns}
            data={invoices}
            keyExtractor={(r) => r.id}
            emptyText={configured ? "No data yet." : "Supabase is not configured."}
            rowClassName="group"
          />
        )}
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} className="px-4" />
      </Card>

      <Dialog open={!!voidConfirmId} onOpenChange={(open) => !open && setVoidConfirmId(null)}>
        <DialogContent className="max-w-sm border-border/60 rounded-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Void invoice</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This cannot be undone. The invoice will be marked as Void.</p>
          <DialogFooter className="gap-2 pt-3 border-t border-border/60">
            <Button variant="ghost" size="sm" onClick={() => setVoidConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!!busyId}
              onClick={async () => {
                if (!voidConfirmId || !supabase) return;
                setBusyId(voidConfirmId);
                setError(null);
                const { error: updateError } = await supabase.from("invoices").update({ status: "Void" }).eq("id", voidConfirmId);
                if (updateError) setError(updateError.message);
                await refresh();
                setBusyId(null);
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

