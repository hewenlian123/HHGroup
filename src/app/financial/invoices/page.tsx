"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import {
  listTableAmountCellClassName,
  listTablePrimaryCellClassName,
  listTableRowClassName,
} from "@/lib/list-table-interaction";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getInvoicesWithDerived,
  getProjects,
  duplicateInvoice,
  type InvoiceWithDerived,
  type InvoiceComputedStatus,
} from "@/lib/data";
import { Plus, Eye, CreditCard, Copy, Trash2 } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { useSearchParams } from "next/navigation";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { useToast } from "@/components/toast/toast-provider";
import { voidInvoiceFromClient } from "@/lib/invoice-void-client";

const STATUS_OPTIONS: { value: "" | InvoiceComputedStatus; label: string }[] = [
  { value: "", label: "All" },
  { value: "Draft", label: "Draft" },
  { value: "Paid", label: "Paid" },
  { value: "Partial", label: "Partial" },
  { value: "Unpaid", label: "Unpaid" },
  { value: "Overdue", label: "Overdue" },
  { value: "Void", label: "Void" },
];

export default function InvoicesPage() {
  return (
    <React.Suspense fallback={<div className="page-container py-6" />}>
      <InvoicesPageInner />
    </React.Suspense>
  );
}

function InvoicesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [invoices, setInvoices] = React.useState<InvoiceWithDerived[]>([]);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"" | InvoiceComputedStatus>("");
  const [projectFilter, setProjectFilter] = React.useState("");
  const [voidConfirmId, setVoidConfirmId] = React.useState<string | null>(null);
  const [projects, setProjects] = React.useState<Awaited<ReturnType<typeof getProjects>>>([]);
  const { toast } = useToast();

  React.useEffect(() => {
    let cancelled = false;
    getInvoicesWithDerived().then((list) => {
      if (!cancelled) setInvoices(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    getProjects().then((list) => {
      if (!cancelled) setProjects(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const projectNameById = React.useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects]
  );

  const filtered = React.useMemo(() => {
    let list = invoices;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.invoiceNo.toLowerCase().includes(q) ||
          i.clientName.toLowerCase().includes(q) ||
          (projectNameById.get(i.projectId) ?? "").toLowerCase().includes(q)
      );
    }
    if (statusFilter) list = list.filter((i) => i.computedStatus === statusFilter);
    if (projectFilter) list = list.filter((i) => i.projectId === projectFilter);
    return list;
  }, [invoices, search, statusFilter, projectFilter, projectNameById]);

  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = 20;
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const curPage = Math.min(page, totalPages);
  const pageRows = React.useMemo(() => {
    const start = (curPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [curPage, filtered]);

  const setPage = (nextPage: number) => {
    const sp = new URLSearchParams(searchParams);
    sp.set("page", String(nextPage));
    router.push(`/financial/invoices?${sp.toString()}`, { scroll: false });
  };

  const refresh = React.useCallback(async () => {
    const list = await getInvoicesWithDerived();
    setInvoices(list);
    setVoidConfirmId(null);
  }, []);

  const reloadProjects = React.useCallback(async () => {
    const list = await getProjects();
    setProjects(list);
  }, []);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
      void reloadProjects();
    }, [refresh, reloadProjects]),
    [refresh, reloadProjects]
  );

  const handleVoid = async (id: string) => {
    const result = await voidInvoiceFromClient(id);
    if (!result.ok) {
      toast({
        title: "Could not void invoice",
        description: result.message,
        variant: "error",
      });
      return;
    }
    toast({ title: "Invoice voided", variant: "success" });
    await refresh();
  };

  const handleDuplicate = async (id: string) => {
    const dup = await duplicateInvoice(id);
    if (dup) router.push(`/financial/invoices/${dup.id}`);
  };

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
      <FilterBar>
        <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1 sm:col-span-2 lg:col-span-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
              Search
            </p>
            <Input
              placeholder="Invoice #, client, project…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
              Status
            </p>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "" | InvoiceComputedStatus)}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
              Project
            </p>
            <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
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

      {total === 0 ? (
        <EmptyState
          title={
            search.trim() || statusFilter || projectFilter
              ? "No invoices match filters"
              : "No invoices yet"
          }
          description={
            search.trim() || statusFilter || projectFilter
              ? "Try adjusting the filters."
              : "Create an invoice to get started."
          }
          icon={<Plus className="h-5 w-5" />}
          action={
            search.trim() || statusFilter || projectFilter ? null : (
              <Button asChild size="sm" className="h-8">
                <Link href="/financial/invoices/new">New Invoice</Link>
              </Button>
            )
          }
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Invoice #
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Project
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Client
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">
                    Issue
                  </TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">
                    Due
                  </TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">
                    Total
                  </TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">
                    Paid
                  </TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">
                    Balance
                  </TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((inv) => (
                  <TableRow
                    key={inv.id}
                    className={cn(
                      listTableRowClassName,
                      "group border-b border-gray-100/80 dark:border-border/30"
                    )}
                    onClick={() => router.push(`/financial/invoices/${inv.id}`)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "text-primary hover:underline",
                            listTablePrimaryCellClassName
                          )}
                        >
                          {inv.invoiceNo}
                        </span>
                        <InvoiceStatusBadge status={inv.computedStatus} />
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {projectNameById.get(inv.projectId) ?? inv.projectId}
                    </TableCell>
                    <TableCell className="text-foreground">{inv.clientName}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {inv.issueDate}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {inv.computedStatus === "Overdue" ? (
                        <span className="text-red-600 dark:text-red-400">{inv.dueDate}</span>
                      ) : (
                        <span className="text-muted-foreground">{inv.dueDate}</span>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums font-medium",
                        listTableAmountCellClassName
                      )}
                    >
                      ${inv.total.toLocaleString()}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums text-hh-profit-positive dark:text-hh-profit-positive",
                        listTableAmountCellClassName
                      )}
                    >
                      ${inv.paidTotal.toLocaleString()}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums font-medium",
                        listTableAmountCellClassName
                      )}
                    >
                      ${inv.balanceDue.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="btn-outline-ghost h-8"
                        >
                          <Link href={`/financial/invoices/${inv.id}`}>
                            <Eye className="h-4 w-4 mr-1" /> View
                          </Link>
                        </Button>
                        {inv.computedStatus !== "Void" && inv.computedStatus !== "Paid" && (
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="btn-outline-ghost h-8"
                          >
                            <Link href={`/financial/invoices/${inv.id}?recordPayment=1`}>
                              <CreditCard className="h-4 w-4 mr-1" /> Record Payment
                            </Link>
                          </Button>
                        )}
                        {inv.computedStatus !== "Void" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="btn-outline-ghost h-8"
                            onClick={() => handleDuplicate(inv.id)}
                            title="Duplicate"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        )}
                        {inv.computedStatus !== "Void" &&
                          (voidConfirmId === inv.id ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="btn-outline-destructive h-8"
                                onClick={() => handleVoid(inv.id)}
                              >
                                Confirm Void
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="btn-outline-ghost h-8"
                                onClick={() => setVoidConfirmId(null)}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="btn-outline-ghost h-8 text-red-600 hover:text-red-700"
                              onClick={() => setVoidConfirmId(inv.id)}
                              title="Void"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {total > 0 ? (
        <Pagination page={curPage} pageSize={pageSize} total={total} onPageChange={setPage} />
      ) : null}
    </div>
  );
}
