"use client";

import * as React from "react";
import { startTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import {
  getInvoicesWithDerived,
  getProjects,
  duplicateInvoice,
  type InvoiceWithDerived,
  type InvoiceComputedStatus,
} from "@/lib/data";
import { AlertTriangle, CreditCard, FileText, Link2, Plus, Search } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { useSearchParams } from "next/navigation";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { useToast } from "@/components/toast/toast-provider";
import { voidInvoiceFromClient } from "@/lib/invoice-void-client";
import {
  MobileFabPlus,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
import { ConfirmDialog } from "@/components/base";

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatReadableDate(dateStr: string | null | undefined): string {
  const s = (dateStr ?? "").slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return s || "—";
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

const invoicesShell =
  "rounded-xl border border-zinc-200/70 bg-white shadow-[0_1px_0_rgba(0,0,0,0.04),0_4px_24px_rgba(0,0,0,0.045)] dark:border-border/50 dark:bg-card/80 dark:shadow-none md:rounded-2xl";

const kpiTile =
  "rounded-xl border border-zinc-200/40 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.028),0_1px_12px_rgba(0,0,0,0.028)] dark:border-border/35 dark:bg-card/80 dark:shadow-none";

const kpiIcon =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100/45 text-zinc-400 dark:bg-muted/45 dark:text-muted-foreground";

function statusChipClass(status: InvoiceComputedStatus): { label: string; className: string } {
  if (status === "Draft")
    return {
      label: "Draft",
      className:
        "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200/70 dark:bg-muted/35 dark:text-muted-foreground",
    };
  if (status === "Void")
    return {
      label: "Void",
      className:
        "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200/70 dark:bg-muted/35 dark:text-muted-foreground",
    };
  if (status === "Paid")
    return {
      label: "Paid",
      className:
        "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/60 dark:bg-emerald-900/20 dark:text-emerald-200 dark:ring-emerald-900/30",
    };
  if (status === "Overdue")
    return {
      label: "Overdue",
      className:
        "bg-amber-50 text-amber-800 ring-1 ring-amber-200/60 dark:bg-amber-900/20 dark:text-amber-200 dark:ring-amber-900/30",
    };
  // Partial / Unpaid
  return {
    label: "Sent",
    className:
      "bg-blue-50 text-blue-800 ring-1 ring-blue-200/60 dark:bg-blue-900/20 dark:text-blue-200 dark:ring-blue-900/30",
  };
}

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
  const [voidBusyId, setVoidBusyId] = React.useState<string | null>(null);
  const [projects, setProjects] = React.useState<Awaited<ReturnType<typeof getProjects>>>([]);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [voidTarget, setVoidTarget] = React.useState<InvoiceWithDerived | null>(null);
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
    const from = dateFrom ? dateFrom.slice(0, 10) : "";
    const to = dateTo ? dateTo.slice(0, 10) : "";
    if (from || to) {
      list = list.filter((i) => {
        const d = (i.issueDate ?? "").slice(0, 10);
        if (!d) return true;
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
    }
    return list;
  }, [invoices, search, statusFilter, projectFilter, projectNameById, dateFrom, dateTo]);

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
    setVoidTarget(null);
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

  const activeDrawerFilterCount =
    (statusFilter ? 1 : 0) + (projectFilter ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  const summary = React.useMemo(() => {
    const notVoid = invoices.filter((i) => i.computedStatus !== "Void");
    const totalInvoiced = notVoid.reduce((s, i) => s + (Number(i.total) || 0), 0);
    const openInvoices = invoices.filter(
      (i) =>
        i.computedStatus === "Unpaid" ||
        i.computedStatus === "Partial" ||
        i.computedStatus === "Overdue"
    );
    const openCount = openInvoices.length;
    const paidCount = invoices.filter((i) => i.computedStatus === "Paid").length;
    const outstanding = openInvoices.reduce((s, i) => s + (Number(i.balanceDue) || 0), 0);
    const overdue = invoices
      .filter((i) => i.computedStatus === "Overdue")
      .reduce((s, i) => s + (Number(i.balanceDue) || 0), 0);
    const draftVoid = invoices.filter(
      (i) => i.computedStatus === "Draft" || i.computedStatus === "Void"
    ).length;
    return { totalInvoiced, openCount, paidCount, outstanding, overdue, draftVoid };
  }, [invoices]);

  return (
    <div
      className={cn(
        "min-w-0 overflow-x-hidden bg-zinc-50 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-[max(0.35rem,env(safe-area-inset-top,0px))] dark:bg-background",
        "flex flex-col"
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-3 px-4 py-2 pb-4 sm:max-w-[460px] md:max-w-6xl md:gap-4 md:px-6 md:pb-6 md:pt-3",
          mobileListPagePaddingClass
        )}
      >
        <div className="hidden md:block">
          <PageHeader
            className="gap-1 border-b border-zinc-200/70 pb-2 dark:border-border/60 lg:items-baseline lg:gap-x-4 [&_p]:mt-0"
            title="Invoices"
            subtitle="AR and cash collection — invoice history, balances, and aging."
            actions={
              <Button
                asChild
                size="sm"
                className="h-9 shrink-0 gap-1.5 shadow-none bg-[#0B1220] text-white hover:bg-[#0B1220]/92 dark:bg-emerald-500/90 dark:text-black dark:hover:bg-emerald-500"
              >
                <Link href="/financial/invoices/new">
                  <Plus className="h-3.5 w-3.5" aria-hidden />
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
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Issue date</p>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-10 tabular-nums"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-10 tabular-nums"
              />
            </div>
          </div>
          <Button type="button" className="w-full rounded-sm" onClick={() => setFiltersOpen(false)}>
            Done
          </Button>
        </MobileFilterSheet>

        {/* KPI summary */}
        <section className="border-b border-border/60 pb-4">
          <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
            Summary
          </p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <FileText className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Total invoiced
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {money(summary.totalInvoiced)}
                </div>
              </div>
            </div>
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <Link2 className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Open invoices
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {summary.openCount.toLocaleString("en-US")}
                </div>
              </div>
            </div>
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <CreditCard className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Paid
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {summary.paidCount.toLocaleString("en-US")}
                </div>
              </div>
            </div>
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <FileText className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Outstanding
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {money(summary.outstanding)}
                </div>
              </div>
            </div>
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <AlertTriangle className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Overdue
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {money(summary.overdue)}
                </div>
              </div>
            </div>
            <div className={cn(kpiTile, "flex items-center gap-2 px-3 py-2.5")}>
              <span className={kpiIcon}>
                <FileText className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Draft/Void
                </div>
                <div className="mt-0.5 text-xl font-medium tabular-nums text-foreground">
                  {summary.draftVoid.toLocaleString("en-US")}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Filter/search surface */}
        <div className={cn(invoicesShell, "p-3")}>
          <div className="flex w-full flex-wrap items-end gap-3 md:flex-nowrap">
            <div className="flex min-w-[240px] flex-1 flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                Search
              </label>
              <div className="relative w-full">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Invoice #, client, project…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 min-h-[44px] pl-8 text-sm"
                />
              </div>
            </div>
            <div className="flex min-w-[180px] flex-1 flex-col gap-1 sm:flex-initial">
              <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                Status
              </label>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "" | InvoiceComputedStatus)}
                className="h-10 min-h-[44px] min-w-0 sm:min-h-10 sm:w-[200px]"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value || "all"} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex min-w-[180px] flex-1 flex-col gap-1 sm:flex-initial">
              <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                Project
              </label>
              <Select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="h-10 min-h-[44px] min-w-0 sm:min-h-10 sm:w-[220px]"
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
          <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-zinc-100/80 pt-3 dark:border-border/60">
            <div className="flex flex-1 flex-col gap-1 sm:flex-initial">
              <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                Issue date from
              </label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-10 min-h-[44px] tabular-nums sm:min-h-10 sm:w-[170px]"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1 sm:flex-initial">
              <label className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-secondary/75 dark:text-muted-foreground">
                Issue date to
              </label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-10 min-h-[44px] tabular-nums sm:min-h-10 sm:w-[170px]"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-10 min-h-[44px] rounded-sm shadow-none sm:h-9 sm:min-h-0"
                onClick={() => void refresh()}
              >
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {total === 0 ? (
          search.trim() || statusFilter || projectFilter || dateFrom || dateTo ? (
            <EmptyState
              title="No invoices match your filters"
              description="Try adjusting filters or the date range."
              icon={null}
              action={
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-sm shadow-none"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("");
                    setProjectFilter("");
                    setDateFrom("");
                    setDateTo("");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className={cn(invoicesShell, "px-4 py-10 text-center")}>
              <span className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200/70 bg-zinc-50/80 text-zinc-600 dark:border-border/60 dark:bg-muted/25 dark:text-zinc-300">
                <FileText className="h-5 w-5" aria-hidden />
              </span>
              <p className="text-sm font-medium text-foreground">No invoices yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create an invoice to start tracking accounts receivable and cash collection.
              </p>
              <Button
                asChild
                size="sm"
                className="mt-4 h-9 rounded-sm shadow-none bg-[#0B1220] text-white hover:bg-[#0B1220]/92 dark:bg-emerald-500/90 dark:text-black dark:hover:bg-emerald-500"
              >
                <Link href="/financial/invoices/new">
                  <Plus className="mr-2 h-3.5 w-3.5" aria-hidden />
                  Create first invoice
                </Link>
              </Button>
            </div>
          )
        ) : (
          <section className={cn(invoicesShell, "overflow-hidden p-0")}>
            {/* Desktop header row */}
            <div className="hidden md:grid grid-cols-[minmax(180px,1.1fr)_minmax(180px,1fr)_minmax(100px,0.55fr)_minmax(110px,0.55fr)_minmax(110px,0.55fr)_minmax(120px,0.6fr)_minmax(120px,0.6fr)_minmax(120px,0.6fr)_44px] gap-3 border-b border-border/60 px-3 py-2.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
              <div>Client</div>
              <div>Project</div>
              <div>Invoice #</div>
              <div className="text-right">Total</div>
              <div className="text-right">Paid</div>
              <div className="text-right">Balance</div>
              <div>Status</div>
              <div>Due date</div>
              <div />
            </div>

            <div className="flex flex-col divide-y divide-border/60">
              {tableInvoiceRows.map(({ invoice: inv, projectLabel }) => {
                const chip = statusChipClass(inv.computedStatus);
                const isBusy = voidBusyId === inv.id;
                return (
                  <div
                    key={inv.id}
                    className="group px-3 py-3 transition-colors hover:bg-muted/25 md:grid md:grid-cols-[minmax(180px,1.1fr)_minmax(180px,1fr)_minmax(100px,0.55fr)_minmax(110px,0.55fr)_minmax(110px,0.55fr)_minmax(120px,0.6fr)_minmax(120px,0.6fr)_minmax(120px,0.6fr)_44px] md:items-center md:gap-3"
                  >
                    <button
                      type="button"
                      className="min-w-0 text-left"
                      onClick={() =>
                        startTransition(() => router.push(`/financial/invoices/${inv.id}`))
                      }
                    >
                      <div className="truncate text-sm font-semibold text-foreground">
                        {inv.clientName}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground md:hidden">
                        {projectLabel} · {inv.invoiceNo}
                      </div>
                    </button>

                    <div className="hidden min-w-0 md:block">
                      <div className="truncate text-sm text-foreground">{projectLabel}</div>
                    </div>

                    <div className="hidden md:block text-sm font-mono tabular-nums text-muted-foreground">
                      {inv.invoiceNo}
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-3 md:mt-0 md:block md:text-right">
                      <div className="md:hidden text-xs text-muted-foreground">
                        Due {formatReadableDate(inv.dueDate)}
                      </div>
                      <div className="text-sm font-medium tabular-nums text-foreground">
                        {money(inv.total)}
                      </div>
                    </div>

                    <div className="hidden md:block text-right text-sm tabular-nums text-hh-profit-positive dark:text-hh-profit-positive">
                      {money(inv.paidTotal)}
                    </div>

                    <div className="hidden md:block text-right text-sm font-semibold tabular-nums text-foreground">
                      {money(inv.balanceDue)}
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 md:mt-0 md:block">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                          chip.className
                        )}
                      >
                        {chip.label}
                      </span>
                      <div className="md:hidden text-right text-sm font-semibold tabular-nums text-foreground">
                        {money(inv.balanceDue)}
                      </div>
                    </div>

                    <div className="hidden md:block text-sm font-mono tabular-nums text-muted-foreground">
                      {formatReadableDate(inv.dueDate)}
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 md:mt-0 md:block">
                      <div className="md:hidden text-xs text-muted-foreground">
                        Paid {money(inv.paidTotal)} · Total {money(inv.total)}
                      </div>
                      <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                        <RowActionsMenu
                          appearance="list"
                          ariaLabel={`Actions for ${inv.invoiceNo}`}
                          actions={[
                            {
                              label: "View",
                              onClick: () =>
                                startTransition(() => router.push(`/financial/invoices/${inv.id}`)),
                            },
                            ...(inv.computedStatus !== "Void" && inv.computedStatus !== "Paid"
                              ? [
                                  {
                                    label: "Record payment",
                                    onClick: () =>
                                      startTransition(() =>
                                        router.push(`/financial/invoices/${inv.id}?recordPayment=1`)
                                      ),
                                  },
                                ]
                              : []),
                            ...(inv.computedStatus !== "Void"
                              ? [
                                  {
                                    label: "Duplicate",
                                    onClick: () => void handleDuplicate(inv.id),
                                  },
                                  {
                                    label: "Void",
                                    destructive: true,
                                    disabled: isBusy,
                                    onClick: () => setVoidTarget(inv),
                                  },
                                ]
                              : []),
                          ]}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {total > 0 ? (
          <Pagination page={curPage} pageSize={pageSize} total={total} onPageChange={setPage} />
        ) : null}

        <ConfirmDialog
          open={!!voidTarget}
          onOpenChange={(open) => !open && setVoidTarget(null)}
          title="Void invoice?"
          description={
            voidTarget
              ? `This will void ${voidTarget.invoiceNo} for ${voidTarget.clientName}. This cannot be undone.`
              : undefined
          }
          confirmLabel="Void"
          cancelLabel="Cancel"
          destructive
          onConfirm={async () => {
            const inv = voidTarget;
            if (!inv) return;
            setVoidTarget(null);
            await handleVoid(inv.id);
          }}
        />
      </div>
    </div>
  );
}
