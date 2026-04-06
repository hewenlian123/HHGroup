"use client";

import * as React from "react";
import { startTransition } from "react";
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
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import {
  MobileEmptyState,
  MobileFabPlus,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { Search } from "lucide-react";

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
  const [voidBusyId, setVoidBusyId] = React.useState<string | null>(null);
  const [projects, setProjects] = React.useState<Awaited<ReturnType<typeof getProjects>>>([]);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
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

  const tableInvoiceRows = React.useMemo(
    () =>
      pageRows.map((inv) => ({
        invoice: inv,
        projectLabel: projectNameById.get(inv.projectId) ?? inv.projectId,
      })),
    [pageRows, projectNameById]
  );

  const setPage = React.useCallback(
    (nextPage: number) => {
      const sp = new URLSearchParams(searchParams);
      sp.set("page", String(nextPage));
      startTransition(() => router.push(`/financial/invoices?${sp.toString()}`, { scroll: false }));
    },
    [router, searchParams]
  );

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

  const handleVoid = React.useCallback(
    async (id: string) => {
      setVoidBusyId(id);
      try {
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
      } finally {
        setVoidBusyId(null);
      }
    },
    [toast, refresh]
  );

  const handleDuplicate = React.useCallback(
    async (id: string) => {
      const dup = await duplicateInvoice(id);
      if (dup) startTransition(() => router.push(`/financial/invoices/${dup.id}`));
    },
    [router]
  );

  const activeDrawerFilterCount = (statusFilter ? 1 : 0) + (projectFilter ? 1 : 0);

  return (
    <div
      className={cn("page-container page-stack py-6", mobileListPagePaddingClass, "max-md:!gap-3")}
    >
      <div className="hidden md:block">
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
      </div>
      <MobileListHeader
        title="Invoices"
        fab={<MobileFabPlus href="/financial/invoices/new" ariaLabel="New invoice" />}
      />

      <MobileSearchFiltersRow
        filterSheetOpen={filtersOpen}
        onOpenFilters={() => setFiltersOpen(true)}
        activeFilterCount={activeDrawerFilterCount}
        searchSlot={
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Invoice #, client, project…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 pl-8 text-sm"
            />
          </div>
        }
      />
      <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Status</p>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | InvoiceComputedStatus)}
            className="w-full"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Project</p>
          <Select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="w-full"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <Button type="button" className="w-full rounded-sm" onClick={() => setFiltersOpen(false)}>
          Done
        </Button>
      </MobileFilterSheet>

      <FilterBar className="hidden md:block">
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
        <>
          <MobileEmptyState
            icon={<Plus className="h-8 w-8 opacity-80" aria-hidden />}
            message={
              search.trim() || statusFilter || projectFilter
                ? "No invoices match your filters."
                : "No invoices yet. Create one to get started."
            }
            action={
              !(search.trim() || statusFilter || projectFilter) ? (
                <Button asChild size="sm" variant="outline">
                  <Link href="/financial/invoices/new">New invoice</Link>
                </Button>
              ) : undefined
            }
          />
          <div className="hidden md:block">
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
          </div>
        </>
      ) : (
        <>
          <div className="divide-y divide-gray-100 dark:divide-border/60 md:hidden">
            {tableInvoiceRows.map(({ invoice: inv, projectLabel }) => (
              <button
                key={inv.id}
                type="button"
                className="flex min-h-[48px] w-full items-center gap-3 py-2.5 text-left"
                onClick={() => startTransition(() => router.push(`/financial/invoices/${inv.id}`))}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{inv.invoiceNo}</p>
                  <p className="truncate text-xs text-text-secondary dark:text-muted-foreground">
                    {inv.clientName} · {projectLabel}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-medium tabular-nums text-foreground">
                    ${inv.total.toLocaleString()}
                  </span>
                  <InvoiceStatusBadge status={inv.computedStatus} />
                </div>
              </button>
            ))}
          </div>
          <Card className="hidden overflow-hidden p-0 md:block">
            <div className="overflow-x-auto lg:overflow-x-visible">
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
                  {tableInvoiceRows.map(({ invoice: inv, projectLabel }) => (
                    <TableRow
                      key={inv.id}
                      className={cn(
                        listTableRowClassName,
                        "group border-b border-gray-100/80 dark:border-border/30"
                      )}
                      onClick={() =>
                        startTransition(() => router.push(`/financial/invoices/${inv.id}`))
                      }
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
                      <TableCell className="text-muted-foreground">{projectLabel}</TableCell>
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
                                  disabled={voidBusyId === inv.id}
                                  onClick={() => void handleVoid(inv.id)}
                                >
                                  <SubmitSpinner loading={voidBusyId === inv.id} className="mr-2" />
                                  Confirm Void
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="btn-outline-ghost h-8"
                                  disabled={voidBusyId === inv.id}
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
        </>
      )}

      {total > 0 ? (
        <Pagination page={curPage} pageSize={pageSize} total={total} onPageChange={setPage} />
      ) : null}
    </div>
  );
}
