"use client";

import * as React from "react";
import { startTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileText,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
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
import { formatCurrency, formatDate, formatInteger } from "@/lib/formatters";
import { deleteInvoiceAction } from "./actions";

const invoicesShell =
  "rounded-xl border border-stone-200/70 bg-stone-50/72 dark:border-border/60 dark:bg-card";

const kpiTile =
  "rounded-lg border border-stone-200/65 bg-white/82 dark:border-border/60 dark:bg-muted/20";

const financePageTitleClass =
  "text-[19px] font-semibold leading-none tracking-[-0.02em] text-zinc-950 dark:text-zinc-50";

const financeSubtitleClass =
  "mt-0.5 text-[12px] leading-[1.35] tracking-[-0.003em] text-stone-600 dark:text-zinc-400";

const financeSectionLabelClass =
  "text-[10px] font-semibold uppercase tracking-[0.17em] text-stone-600/85 dark:text-zinc-500";

const financeControlLabelClass =
  "text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-600/85 dark:text-zinc-500";

const financePrimaryTextClass =
  "text-[14px] font-semibold leading-[1.15] tracking-[-0.013em] text-zinc-950 dark:text-zinc-50";

const financeMetadataClass =
  "text-[11px] leading-[1.35] tracking-[-0.004em] text-stone-600 dark:text-zinc-300";

const financeMetadataStrongClass =
  "text-[11px] font-medium tabular-nums tracking-[-0.012em] text-zinc-800 dark:text-zinc-100";

const financeAmountClass =
  "min-w-[104px] text-right text-[18.5px] font-semibold leading-none tracking-[-0.048em] tabular-nums text-zinc-950 dark:text-zinc-50";

const financeSecondaryAmountClass =
  "text-[10.5px] tabular-nums tracking-[-0.014em] text-zinc-800/85 dark:text-zinc-300";

const financeToolbarButtonTextClass = "text-[12px] font-medium tracking-[-0.012em]";

function statusChipClass(status: InvoiceComputedStatus): {
  label: string;
  dotClassName: string;
  badgeClassName: string;
} {
  if (status === "Draft")
    return {
      label: "Draft",
      dotClassName: "bg-stone-400 dark:bg-zinc-500",
      badgeClassName:
        "border-stone-200/75 bg-stone-50/88 text-stone-600 dark:border-zinc-700 dark:bg-zinc-900/35 dark:text-zinc-300",
    };
  if (status === "Void")
    return {
      label: "Void",
      dotClassName: "bg-stone-300 dark:bg-zinc-600",
      badgeClassName:
        "border-stone-200/75 bg-stone-50/82 text-stone-500 dark:border-zinc-700 dark:bg-zinc-900/35 dark:text-zinc-400",
    };
  if (status === "Paid")
    return {
      label: "Paid",
      dotClassName: "bg-emerald-500 dark:bg-emerald-400",
      badgeClassName:
        "border-emerald-200/50 bg-emerald-50/58 text-emerald-700 dark:border-emerald-900/65 dark:bg-emerald-950/34 dark:text-emerald-300",
    };
  if (status === "Overdue")
    return {
      label: "Overdue",
      dotClassName: "bg-rose-500 dark:bg-rose-400",
      badgeClassName:
        "border-rose-200/50 bg-rose-50/58 text-rose-700 dark:border-rose-900/65 dark:bg-rose-950/34 dark:text-rose-300",
    };
  if (status === "Partial")
    return {
      label: "Partial",
      dotClassName: "bg-amber-500 dark:bg-amber-400",
      badgeClassName:
        "border-amber-200/50 bg-amber-50/56 text-amber-700 dark:border-amber-900/65 dark:bg-amber-950/34 dark:text-amber-300",
    };
  return {
    label: "Sent",
    dotClassName: "bg-sky-500 dark:bg-sky-400",
    badgeClassName:
      "border-sky-200/50 bg-sky-50/56 text-sky-700 dark:border-sky-900/65 dark:bg-sky-950/34 dark:text-sky-300",
  };
}

function InvoiceStatusText({
  status,
  className,
}: {
  status: InvoiceComputedStatus;
  className?: string;
}) {
  const chip = statusChipClass(status);

  return (
    <span
      className={cn(
        "inline-flex h-[18px] items-center gap-1 rounded-full border px-1.5 text-[9.5px] font-medium tracking-[0.015em] leading-none whitespace-nowrap",
        chip.badgeClassName,
        className
      )}
    >
      <span className={cn("h-1 w-1 rounded-full", chip.dotClassName)} />
      {chip.label}
    </span>
  );
}

function isTestInvoiceRow(inv: InvoiceWithDerived): boolean {
  const haystack = [inv.clientName, inv.invoiceNo, inv.notes ?? ""].join(" ").toLowerCase();
  return (
    haystack.includes("workflow test") ||
    haystack.includes("[e2e]") ||
    haystack.includes("playwright") ||
    haystack.includes("body balance") ||
    /\bpw[-\s_]/i.test(haystack)
  );
}

function InvoiceMiniMetric({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className="rounded-lg border border-stone-200/65 bg-white/82 px-2.5 py-1.5 dark:border-border/60 dark:bg-muted/20">
      <p className={financeSectionLabelClass}>{label}</p>
      <p
        className={cn(
          "mt-1 text-[13px] font-medium tabular-nums leading-none tracking-[-0.015em] text-zinc-900 dark:text-zinc-50",
          emphasized && "text-[14px] font-semibold tracking-[-0.022em]"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function CompactSummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn(kpiTile, "px-2.5 py-2")}>
      <p className={financeSectionLabelClass}>{label}</p>
      <p className="mt-1 text-[13px] font-semibold tabular-nums leading-none tracking-[-0.02em] text-zinc-950 dark:text-zinc-50">
        {value}
      </p>
    </div>
  );
}

function InvoiceListSkeleton() {
  return (
    <section className={cn(invoicesShell, "overflow-hidden p-0")}>
      <div className="hidden border-b border-zinc-200/60 px-5 py-3 md:flex md:items-center md:justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="hidden divide-y divide-zinc-200/60 md:block">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={`desktop-skeleton-${index}`}
            className="grid grid-cols-[minmax(0,1fr)_220px_40px] gap-4 px-5 py-4"
          >
            <div className="space-y-2">
              <Skeleton className="h-5 w-52" />
              <Skeleton className="h-3 w-80 max-w-full" />
            </div>
            <div className="space-y-2 text-right">
              <div className="flex justify-end">
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="flex justify-end">
                <Skeleton className="h-6 w-24" />
              </div>
              <div className="flex justify-end">
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
            <div className="flex justify-end">
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-3 p-3 md:hidden">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`mobile-skeleton-${index}`}
            className="rounded-xl border border-zinc-200/70 bg-white p-4 dark:border-border/60 dark:bg-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-10 w-10 rounded-md" />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Skeleton className="h-14 rounded-lg" />
              <Skeleton className="h-14 rounded-lg" />
              <Skeleton className="h-14 rounded-lg" />
            </div>
            <div className="mt-4 flex gap-2">
              <Skeleton className="h-10 flex-1 rounded-md" />
              <Skeleton className="h-10 flex-1 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
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
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"" | InvoiceComputedStatus>("");
  const [projectFilter, setProjectFilter] = React.useState("");
  const [voidBusyId, setVoidBusyId] = React.useState<string | null>(null);
  const [projects, setProjects] = React.useState<Awaited<ReturnType<typeof getProjects>>>([]);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [desktopFiltersOpen, setDesktopFiltersOpen] = React.useState(false);
  const [summaryOpen, setSummaryOpen] = React.useState(false);
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [voidTarget, setVoidTarget] = React.useState<InvoiceWithDerived | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<InvoiceWithDerived | null>(null);
  const [deleteBusyId, setDeleteBusyId] = React.useState<string | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    let cancelled = false;

    const loadInitialData = async (): Promise<void> => {
      try {
        const [invoiceList, projectList] = await Promise.all([
          getInvoicesWithDerived(),
          getProjects(),
        ]);
        if (cancelled) return;
        setInvoices(invoiceList);
        setProjects(projectList);
        setLoadError(null);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Failed to load invoices.";
        setLoadError(message);
        console.error("Failed to load invoice list", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadInitialData();

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
    setRefreshing(true);
    try {
      const [list, projectList] = await Promise.all([getInvoicesWithDerived(), getProjects()]);
      setInvoices(list);
      setProjects(projectList);
      setLoadError(null);
      setVoidTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to refresh invoices.";
      setLoadError((current) => current ?? message);
      console.error("Failed to refresh invoice list", error);
      toast({
        title: "Could not refresh invoices",
        description: message,
        variant: "error",
      });
    } finally {
      setRefreshing(false);
    }
  }, [toast]);

  useOnAppSync(
    React.useCallback(() => {
      void refresh();
    }, [refresh]),
    [refresh]
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

  const handleDelete = React.useCallback(
    async (target: InvoiceWithDerived) => {
      setDeleteBusyId(target.id);
      try {
        const result = await deleteInvoiceAction(target.id);
        if (!result.ok) {
          toast({
            title: "Could not delete invoice",
            description: result.error ?? "Only draft or void invoices can be deleted.",
            variant: "error",
          });
          return;
        }
        setInvoices((prev) => prev.filter((invoice) => invoice.id !== target.id));
        toast({ title: "Invoice deleted", variant: "success" });
        await refresh();
      } finally {
        setDeleteBusyId(null);
      }
    },
    [refresh, toast]
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
  const hasAdvancedFilters = activeDrawerFilterCount > 0;

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

  const isInitialLoading = loading && invoices.length === 0 && !loadError;
  const activeFilterChips = React.useMemo(() => {
    const chips: Array<{ key: "status" | "project" | "date"; label: string }> = [];
    if (statusFilter) {
      chips.push({ key: "status", label: `Status: ${statusFilter}` });
    }
    if (projectFilter) {
      chips.push({
        key: "project",
        label: `Project: ${projectNameById.get(projectFilter) ?? "Selected project"}`,
      });
    }
    if (dateFrom || dateTo) {
      chips.push({
        key: "date",
        label: `Issue date: ${dateFrom || "Any"} to ${dateTo || "Any"}`,
      });
    }
    return chips;
  }, [dateFrom, dateTo, projectFilter, projectNameById, statusFilter]);

  const clearAdvancedFilters = React.useCallback(() => {
    setStatusFilter("");
    setProjectFilter("");
    setDateFrom("");
    setDateTo("");
  }, []);

  const clearFilterChip = React.useCallback((key: "status" | "project" | "date") => {
    if (key === "status") {
      setStatusFilter("");
      return;
    }
    if (key === "project") {
      setProjectFilter("");
      return;
    }
    setDateFrom("");
    setDateTo("");
  }, []);

  return (
    <div
      className={cn(
        "min-w-0 overflow-x-hidden bg-stone-50 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-[max(0.35rem,env(safe-area-inset-top,0px))] dark:bg-background",
        "flex flex-col"
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-3 px-4 py-2 pb-4 sm:max-w-[460px] md:max-w-6xl md:gap-3 md:px-6 md:pb-5 md:pt-2",
          mobileListPagePaddingClass
        )}
      >
        <div className="hidden md:block">
          <div className="flex items-center justify-between gap-4 border-b border-stone-200/70 pb-2 dark:border-border/60">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h1 className={financePageTitleClass}>Invoices</h1>
                {refreshing ? (
                  <span className="text-[11px] font-medium tracking-[-0.01em] text-stone-500 dark:text-zinc-400">
                    Updating...
                  </span>
                ) : null}
              </div>
              <p className={financeSubtitleClass}>Accounts receivable and balances.</p>
            </div>
            <Button
              asChild
              size="sm"
              className={cn(
                "h-8 shrink-0 gap-1.5 rounded-sm shadow-none bg-[#0B1220] px-3 text-white hover:bg-[#0B1220]/92 dark:bg-emerald-500/90 dark:text-black dark:hover:bg-emerald-500",
                financeToolbarButtonTextClass
              )}
            >
              <Link href="/financial/invoices/new">
                <Plus className="h-3.5 w-3.5" aria-hidden />
                New Invoice
              </Link>
            </Button>
          </div>
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
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500 dark:text-zinc-500" />
              <Input
                placeholder="Invoice #, client, project…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 pl-8 text-[13.5px] tracking-[-0.012em] text-zinc-900 placeholder:text-stone-500 placeholder:tracking-[-0.008em] dark:text-zinc-100"
              />
            </div>
          }
        />
        <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
          <div className="space-y-2">
            <p className={financeControlLabelClass}>Status</p>
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
            <p className={financeControlLabelClass}>Project</p>
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
            <p className={financeControlLabelClass}>Issue date</p>
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
          <Button
            type="button"
            className={cn("w-full rounded-sm", financeToolbarButtonTextClass)}
            onClick={() => setFiltersOpen(false)}
          >
            Done
          </Button>
        </MobileFilterSheet>

        {(isInitialLoading || invoices.length > 0) && !loadError ? (
          <section
            className={cn(invoicesShell, "overflow-hidden bg-stone-50/78 p-0 dark:bg-muted/10")}
          >
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left transition-colors duration-150 hover:bg-white/52 dark:hover:bg-background/10"
              aria-expanded={summaryOpen}
              onClick={() => setSummaryOpen((open) => !open)}
            >
              <div className="min-w-0">
                <p className={financeSectionLabelClass}>Summary</p>
                {isInitialLoading ? (
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ) : (
                  <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1">
                    <span className="inline-flex items-baseline gap-1">
                      <span className="text-[11px] leading-none text-stone-600 dark:text-zinc-400">
                        Open
                      </span>
                      <span className="text-[13.5px] font-semibold tabular-nums tracking-[-0.016em] text-zinc-950 dark:text-zinc-50">
                        {formatInteger(summary.openCount)}
                      </span>
                    </span>
                    <span className="inline-flex items-baseline gap-1">
                      <span className="text-[11px] leading-none text-stone-600 dark:text-zinc-400">
                        Outstanding
                      </span>
                      <span className="text-[13.5px] font-semibold tabular-nums tracking-[-0.016em] text-zinc-950 dark:text-zinc-50">
                        {formatCurrency(summary.outstanding)}
                      </span>
                    </span>
                    <span className="inline-flex items-baseline gap-1">
                      <span className="text-[11px] leading-none text-stone-600 dark:text-zinc-400">
                        Overdue
                      </span>
                      <span className="text-[13.5px] font-semibold tabular-nums tracking-[-0.016em] text-zinc-950 dark:text-zinc-50">
                        {formatCurrency(summary.overdue)}
                      </span>
                    </span>
                  </div>
                )}
              </div>
              <span className="shrink-0 text-stone-600 dark:text-zinc-400">
                {summaryOpen ? (
                  <ChevronUp className="h-4 w-4" aria-hidden />
                ) : (
                  <ChevronDown className="h-4 w-4" aria-hidden />
                )}
              </span>
            </button>
            {summaryOpen ? (
              <div className="border-t border-stone-200/60 p-2.5 dark:border-border/60">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
                  {isInitialLoading ? (
                    Array.from({ length: 6 }).map((_, index) => (
                      <div key={`summary-skeleton-${index}`} className={cn(kpiTile, "px-2.5 py-2")}>
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="mt-2 h-5 w-20" />
                      </div>
                    ))
                  ) : (
                    <>
                      <CompactSummaryMetric
                        label="Total invoiced"
                        value={formatCurrency(summary.totalInvoiced)}
                      />
                      <CompactSummaryMetric
                        label="Open invoices"
                        value={formatInteger(summary.openCount)}
                      />
                      <CompactSummaryMetric label="Paid" value={formatInteger(summary.paidCount)} />
                      <CompactSummaryMetric
                        label="Outstanding"
                        value={formatCurrency(summary.outstanding)}
                      />
                      <CompactSummaryMetric
                        label="Overdue"
                        value={formatCurrency(summary.overdue)}
                      />
                      <CompactSummaryMetric
                        label="Draft/Void"
                        value={formatInteger(summary.draftVoid)}
                      />
                    </>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        <div
          className={cn(
            invoicesShell,
            "hidden border-stone-200/70 bg-stone-50/74 p-2 md:block dark:bg-muted/10"
          )}
        >
          <div className="flex items-center gap-1.5 rounded-lg border border-stone-200/70 bg-white/66 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.84)] dark:border-border/60 dark:bg-background/15">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500 dark:text-zinc-500" />
              <Input
                placeholder="Invoice #, client, project…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 border-transparent bg-white/92 pl-8 text-[13.5px] tracking-[-0.012em] text-zinc-900 placeholder:text-stone-500 placeholder:tracking-[-0.008em] shadow-none transition-colors focus-visible:border-stone-300/75 focus-visible:bg-white dark:text-zinc-100"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                "h-8 shrink-0 gap-1.5 rounded-sm border-transparent bg-white/78 text-stone-800 shadow-none transition-colors hover:bg-white hover:text-zinc-950 dark:bg-background/50 dark:text-zinc-200",
                financeToolbarButtonTextClass
              )}
              aria-expanded={desktopFiltersOpen}
              onClick={() => setDesktopFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
              Filters
              {hasAdvancedFilters ? (
                <span className="rounded-full bg-stone-100/95 px-1.5 py-0.5 text-[10.5px] font-medium tracking-[-0.01em] text-stone-800 dark:bg-muted dark:text-zinc-200">
                  {activeDrawerFilterCount}
                </span>
              ) : null}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                "h-8 shrink-0 rounded-sm border-transparent bg-transparent text-stone-600 shadow-none transition-colors hover:bg-white/72 hover:text-zinc-950 dark:hover:bg-background/40 dark:text-zinc-400",
                financeToolbarButtonTextClass
              )}
              onClick={() => void refresh()}
            >
              Refresh
            </Button>
          </div>

          {hasAdvancedFilters ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  className="inline-flex h-6 items-center gap-1 rounded-full border border-stone-200/70 bg-white/78 px-2.5 text-[10px] font-medium tracking-[-0.008em] text-stone-700 transition-colors hover:bg-white dark:border-border/60 dark:bg-background/35 dark:text-zinc-200"
                  onClick={() => clearFilterChip(chip.key)}
                >
                  <span>{chip.label}</span>
                  <X className="h-3 w-3" aria-hidden />
                </button>
              ))}
              <button
                type="button"
                className="text-[10.5px] font-medium tracking-[-0.008em] text-stone-500 transition-colors hover:text-zinc-900 dark:text-zinc-400"
                onClick={clearAdvancedFilters}
              >
                Clear all
              </button>
            </div>
          ) : null}

          {desktopFiltersOpen ? (
            <div className="mt-2 grid gap-2 border-t border-stone-200/60 pt-2 md:grid-cols-[168px_208px_156px_156px] dark:border-border/60">
              <div className="space-y-1">
                <label className={financeControlLabelClass}>Status</label>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as "" | InvoiceComputedStatus)}
                  className="h-8 w-full bg-white/80"
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value || "all"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <label className={financeControlLabelClass}>Project</label>
                <Select
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className="h-8 w-full bg-white/80"
                >
                  <option value="">All projects</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <label className={financeControlLabelClass}>Issue from</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-8 bg-white/80 tabular-nums"
                />
              </div>
              <div className="space-y-1">
                <label className={financeControlLabelClass}>Issue to</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-8 bg-white/80 tabular-nums"
                />
              </div>
            </div>
          ) : null}
        </div>

        {activeFilterChips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 md:hidden">
            {activeFilterChips.map((chip) => (
              <button
                key={`mobile-${chip.key}`}
                type="button"
                className="inline-flex h-7 items-center gap-1 rounded-full border border-stone-200/80 bg-white/90 px-2.5 text-[11px] font-medium tracking-[-0.008em] text-stone-700 dark:border-border/60 dark:bg-card dark:text-zinc-200"
                onClick={() => clearFilterChip(chip.key)}
              >
                <span>{chip.label}</span>
                <X className="h-3 w-3" aria-hidden />
              </button>
            ))}
          </div>
        ) : null}

        {isInitialLoading ? (
          <InvoiceListSkeleton />
        ) : loadError ? (
          <EmptyState
            title="Could not load invoices"
            description={loadError}
            icon={
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-200/75 bg-white/76 text-stone-600 dark:border-border/60 dark:bg-muted/25 dark:text-zinc-300">
                <AlertTriangle className="h-5 w-5" aria-hidden />
              </span>
            }
            action={
              <Button
                size="sm"
                variant="outline"
                className={cn("h-9 rounded-sm shadow-none", financeToolbarButtonTextClass)}
                onClick={() => void refresh()}
              >
                Try again
              </Button>
            }
          />
        ) : total === 0 ? (
          search.trim() || statusFilter || projectFilter || dateFrom || dateTo ? (
            <EmptyState
              title="No invoices match your filters"
              description="Try adjusting filters or widening the date range."
              icon={
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-200/75 bg-white/76 text-stone-600 dark:border-border/60 dark:bg-muted/25 dark:text-zinc-300">
                  <Search className="h-5 w-5" aria-hidden />
                </span>
              }
              action={
                <Button
                  size="sm"
                  variant="outline"
                  className={cn("h-9 rounded-sm shadow-none", financeToolbarButtonTextClass)}
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
            <div className={cn(invoicesShell, "px-6 py-12 text-center")}>
              <span className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-stone-200/75 bg-white/76 text-stone-600 dark:border-border/60 dark:bg-muted/25 dark:text-zinc-300">
                <FileText className="h-5 w-5" aria-hidden />
              </span>
              <p className="text-[15px] font-semibold tracking-[-0.015em] text-zinc-900 dark:text-zinc-50">
                No invoices yet
              </p>
              <p className="mt-1 text-[13px] leading-[1.45] tracking-[-0.005em] text-stone-500 dark:text-zinc-400">
                Create your first invoice to start tracking receivables, balances, and payment
                activity.
              </p>
              <Button
                asChild
                size="sm"
                className={cn(
                  "mt-5 h-9 rounded-sm shadow-none bg-[#0B1220] text-white hover:bg-[#0B1220]/92 dark:bg-emerald-500/90 dark:text-black dark:hover:bg-emerald-500",
                  financeToolbarButtonTextClass
                )}
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
            <div
              className="hidden items-center justify-between border-b border-stone-200/70 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-stone-600/85 md:flex dark:border-border/60 dark:text-zinc-500"
              data-testid="invoices-desktop-list"
            >
              <div className="flex items-center gap-3">
                <span className={financeSectionLabelClass}>Invoice list</span>
                <span className="text-[10.5px] font-medium normal-case tracking-[-0.006em] text-stone-600 dark:text-zinc-400">
                  {formatInteger(total)} shown
                </span>
              </div>
              <div className={cn(financeSectionLabelClass, "pr-10 text-right")}>Balance</div>
            </div>

            <div className="hidden space-y-1 p-1.5 md:block">
              {tableInvoiceRows.map(({ invoice: inv, projectLabel }) => {
                const isBusy = voidBusyId === inv.id || deleteBusyId === inv.id;
                const canDelete =
                  inv.computedStatus === "Draft" ||
                  inv.computedStatus === "Void" ||
                  isTestInvoiceRow(inv);
                const canRecordPayment =
                  inv.computedStatus !== "Draft" &&
                  inv.computedStatus !== "Void" &&
                  inv.computedStatus !== "Paid" &&
                  inv.balanceDue > 0;
                const dueTone =
                  inv.computedStatus === "Overdue"
                    ? "text-rose-700 dark:text-rose-300"
                    : "text-stone-500 dark:text-zinc-400";
                const rowActions = [
                  {
                    label: "View",
                    onClick: () =>
                      startTransition(() => router.push(`/financial/invoices/${inv.id}`)),
                  },
                  ...(canRecordPayment
                    ? [
                        {
                          label: "Receive payment",
                          onClick: () =>
                            startTransition(() =>
                              router.push(`/financial/invoices/${inv.id}?receivePayment=1`)
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
                  ...(canDelete
                    ? [
                        {
                          label: "Delete",
                          destructive: true,
                          disabled: isBusy,
                          onClick: () => setDeleteTarget(inv),
                        },
                      ]
                    : []),
                ];

                return (
                  <div
                    key={inv.id}
                    data-testid={`invoice-row-${inv.invoiceNo}`}
                    className="group grid grid-cols-[minmax(0,1fr)_220px_32px] items-center gap-2.5 rounded-lg border border-transparent px-3 py-[9px] transition-[background-color,border-color,box-shadow] duration-150 ease-out hover:border-stone-300/70 hover:bg-white/82 hover:shadow-[inset_0_0_0_1px_rgba(255,251,247,0.9),0_1px_3px_rgba(24,24,27,0.04),0_8px_24px_rgba(24,24,27,0.03)] dark:hover:border-border/70 dark:hover:bg-muted/20"
                  >
                    <button
                      type="button"
                      className="min-w-0 text-left"
                      onClick={() =>
                        startTransition(() => router.push(`/financial/invoices/${inv.id}`))
                      }
                    >
                      <div
                        className={cn(
                          financePrimaryTextClass,
                          "truncate transition-colors duration-150 group-hover:text-black dark:group-hover:text-white"
                        )}
                      >
                        {inv.clientName}
                      </div>
                      <div
                        className={cn(
                          financeMetadataClass,
                          "mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 transition-colors duration-150 group-hover:text-stone-700 dark:group-hover:text-zinc-400"
                        )}
                      >
                        <span className={financeMetadataStrongClass}>{inv.invoiceNo}</span>
                        <span aria-hidden className="text-stone-300 dark:text-zinc-600">
                          ·
                        </span>
                        <span className="min-w-0 max-w-[210px] truncate">{projectLabel}</span>
                        <span aria-hidden className="text-stone-300 dark:text-zinc-600">
                          ·
                        </span>
                        <span className="inline-flex items-center gap-1 whitespace-nowrap">
                          <span className="text-stone-500 dark:text-zinc-500">Due</span>
                          <span className={cn("tabular-nums", dueTone)}>
                            {formatDate(inv.dueDate)}
                          </span>
                        </span>
                      </div>
                    </button>

                    <div className="min-w-0 text-right">
                      <div className="flex items-baseline justify-end gap-1.5">
                        <div
                          className={cn(
                            financeAmountClass,
                            "transition-colors duration-150 group-hover:text-black dark:group-hover:text-white"
                          )}
                        >
                          {formatCurrency(inv.balanceDue)}
                        </div>
                        <InvoiceStatusText status={inv.computedStatus} />
                      </div>
                      <div className="mt-1 inline-flex items-center justify-end gap-1.5 text-[10.5px] leading-none text-stone-600 transition-colors duration-150 group-hover:text-stone-700 dark:group-hover:text-zinc-400 dark:text-zinc-400">
                        <span className="text-stone-500 dark:text-zinc-500">Paid</span>
                        <span className={financeSecondaryAmountClass}>
                          {formatCurrency(inv.paidTotal)}
                        </span>
                        <span className="text-stone-300 dark:text-zinc-600">/</span>
                        <span className="text-stone-500 dark:text-zinc-500">Total</span>
                        <span className={financeSecondaryAmountClass}>
                          {formatCurrency(inv.total)}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                      <RowActionsMenu
                        appearance="list"
                        ariaLabel={`Actions for ${inv.invoiceNo}`}
                        className="text-stone-500 transition-colors group-hover:text-stone-700 dark:text-zinc-500 dark:group-hover:text-zinc-300"
                        actions={rowActions}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-2 p-2.5 md:hidden">
              {tableInvoiceRows.map(({ invoice: inv, projectLabel }) => {
                const isBusy = voidBusyId === inv.id || deleteBusyId === inv.id;
                const canDelete =
                  inv.computedStatus === "Draft" ||
                  inv.computedStatus === "Void" ||
                  isTestInvoiceRow(inv);
                const canRecordPayment =
                  inv.computedStatus !== "Draft" &&
                  inv.computedStatus !== "Void" &&
                  inv.computedStatus !== "Paid" &&
                  inv.balanceDue > 0;
                const dueTone =
                  inv.computedStatus === "Overdue"
                    ? "text-rose-700 dark:text-rose-300"
                    : "text-stone-500 dark:text-zinc-400";
                const secondaryAction =
                  inv.computedStatus === "Draft"
                    ? {
                        label: "Edit draft",
                        href: `/financial/invoices/${inv.id}/edit`,
                      }
                    : canRecordPayment
                      ? {
                          label: "Receive payment",
                          href: `/financial/invoices/${inv.id}?receivePayment=1`,
                        }
                      : {
                          label: "Preview",
                          href: `/financial/invoices/${inv.id}/preview`,
                        };
                const rowActions = [
                  {
                    label: "View",
                    onClick: () =>
                      startTransition(() => router.push(`/financial/invoices/${inv.id}`)),
                  },
                  ...(canRecordPayment
                    ? [
                        {
                          label: "Receive payment",
                          onClick: () =>
                            startTransition(() =>
                              router.push(`/financial/invoices/${inv.id}?receivePayment=1`)
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
                  ...(canDelete
                    ? [
                        {
                          label: "Delete",
                          destructive: true,
                          disabled: isBusy,
                          onClick: () => setDeleteTarget(inv),
                        },
                      ]
                    : []),
                ];

                return (
                  <div
                    key={inv.id}
                    data-testid={`invoice-mobile-card-${inv.invoiceNo}`}
                    className="rounded-xl border border-stone-200/75 bg-white/92 p-3 shadow-[0_1px_2px_rgba(24,24,27,0.03)] transition-colors dark:border-border/60 dark:bg-card dark:shadow-none"
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() =>
                          startTransition(() => router.push(`/financial/invoices/${inv.id}`))
                        }
                      >
                        <div className={cn(financePrimaryTextClass, "truncate")}>
                          {inv.clientName}
                        </div>
                        <div className="mt-0.5">
                          <InvoiceStatusText status={inv.computedStatus} />
                        </div>
                      </button>
                      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                        <RowActionsMenu
                          ariaLabel={`Actions for ${inv.invoiceNo}`}
                          className="h-10 w-10 min-h-10 min-w-10 rounded-lg border-stone-200/70 bg-white/86 shadow-none hover:bg-stone-50 dark:border-border/70 dark:bg-card dark:hover:bg-muted/35"
                          contentAvoidCollisions={false}
                          contentSide="bottom"
                          contentSideOffset={8}
                          contentClassName="z-[1000] w-36 min-w-36 rounded-lg border-stone-200/80 !bg-popover py-1 !opacity-100 shadow-[0_10px_28px_rgba(24,24,27,0.12)] !backdrop-blur-none dark:border-border"
                          contentStyle={{
                            backgroundColor: "hsl(var(--popover))",
                            opacity: 1,
                            zIndex: 1000,
                          }}
                          itemClassName="relative z-10 h-8 rounded-md px-3 py-0 text-[13px] font-medium tracking-[-0.01em]"
                          destructiveItemClassName="text-rose-600 focus:bg-rose-50 focus:text-rose-700 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:focus:bg-rose-950/35 dark:focus:text-rose-300 dark:hover:bg-rose-950/35 dark:hover:text-rose-300"
                          touchFriendly={false}
                          actions={rowActions}
                        />
                      </div>
                    </div>

                    <div className="mt-2.5 space-y-1.5">
                      <div
                        className={cn(
                          financeMetadataClass,
                          "flex items-center justify-between gap-3"
                        )}
                      >
                        <span className={financeMetadataStrongClass}>{inv.invoiceNo}</span>
                        <span className={cn("tabular-nums", dueTone)}>
                          Due {formatDate(inv.dueDate)}
                        </span>
                      </div>
                      <p className={cn(financeMetadataClass, "truncate")}>{projectLabel}</p>
                    </div>

                    <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                      <InvoiceMiniMetric
                        label="Balance"
                        value={formatCurrency(inv.balanceDue)}
                        emphasized
                      />
                      <InvoiceMiniMetric label="Total" value={formatCurrency(inv.total)} />
                      <InvoiceMiniMetric label="Paid" value={formatCurrency(inv.paidTotal)} />
                    </div>

                    <div className="mt-2.5 flex gap-2">
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className={cn(
                          "h-9 flex-1 rounded-sm shadow-none",
                          financeToolbarButtonTextClass
                        )}
                      >
                        <Link href={`/financial/invoices/${inv.id}`}>Open</Link>
                      </Button>
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className={cn(
                          "h-9 flex-1 rounded-sm shadow-none",
                          financeToolbarButtonTextClass
                        )}
                      >
                        <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
                      </Button>
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
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title="Delete invoice?"
          description={
            deleteTarget
              ? `This will permanently delete ${deleteTarget.invoiceNo} for ${deleteTarget.clientName}. This cannot be undone.`
              : undefined
          }
          confirmLabel="Delete"
          cancelLabel="Cancel"
          destructive
          loading={!!deleteBusyId}
          dismissBeforeAsync={false}
          onConfirm={async () => {
            const inv = deleteTarget;
            if (!inv) return;
            await handleDelete(inv);
            setDeleteTarget(null);
          }}
        />
      </div>
    </div>
  );
}
