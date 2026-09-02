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
  ConfirmDialog,
  EmptyState,
  NeoAmount,
  NeoMobileCard,
  NeoStatus,
  NeoTable,
  NeoToolbar,
  RowActionsMenu,
  type StatusBadgeVariant,
} from "@/components/base";
import { tableRawTdClass, tableRawThClass } from "@/components/ui/table";
import { listTableRowClassName } from "@/lib/list-table-interaction";
import { NEO, OS, TYPO } from "@/lib/typography";
import type {
  InvoiceWithDerived,
  InvoiceComputedStatus,
  InvoiceDeleteDependenciesResult,
  Project,
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
import { formatCurrency, formatDate, formatInteger } from "@/lib/formatters";
import {
  checkInvoiceDeleteDependenciesAction,
  deleteInvoiceAction,
  duplicateInvoiceAction,
  unlinkInvoiceScheduleItemAction,
} from "./actions";
import { InvoiceDeleteDependenciesDialog } from "./invoice-delete-dependencies-dialog";

const invoicesShell = OS.card;

const kpiTile =
  "rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-primary)]";

const financePageTitleClass =
  "text-hh-page-title font-semibold  tracking-normal text-[var(--hh-text-primary)]";

const financeSubtitleClass =
  "mt-1.5 text-hh-table-cell leading-snug tracking-normal text-[var(--hh-text-secondary)]";

const financeSectionLabelClass = cn(
  TYPO.sectionLabel,
  "text-hh-status font-semibold text-[var(--hh-text-tertiary)]"
);

const financeControlLabelClass = cn(
  TYPO.sectionLabel,
  "text-hh-status font-semibold text-[var(--hh-text-tertiary)]"
);

const financePrimaryTextClass = cn(
  TYPO.primaryName,
  "text-hh-body font-semibold  text-[var(--hh-text-primary)]"
);

const financeMetadataClass = "text-hh-metadata  tracking-normal text-[var(--hh-text-secondary)]";

const financeMetadataStrongClass =
  "text-hh-metadata font-medium tabular-nums tracking-normal text-[var(--hh-text-primary)]";

const financeAmountClass =
  "min-w-[112px] text-right text-hh-financial font-semibold leading-none tracking-normal tabular-nums";

const financeSecondaryAmountClass =
  "text-hh-metadata font-medium tabular-nums tracking-normal text-[var(--hh-text-secondary)]";

const financeToolbarButtonTextClass = "text-hh-metadata font-medium tracking-normal";

const invoiceTableThClass = cn(tableRawThClass, "h-10 px-4 text-hh-status font-semibold");
const invoiceTableTdClass = cn(tableRawTdClass, "h-11 px-4");
const invoiceTableNumericThClass = cn(invoiceTableThClass, "text-right tabular-nums");

const invoiceActionsMenuContentClassName =
  "z-[1000] min-w-[160px] overflow-hidden rounded-hh-task border border-[var(--hh-border-floating)] bg-[var(--hh-l4-floating-surface)] p-1 py-2 text-[var(--hh-text-primary)] !opacity-100 shadow-floating backdrop-blur-none data-[state=open]:!animate-none data-[state=closed]:!animate-none";

const invoiceActionsMenuContentStyle: React.CSSProperties = {
  backgroundColor: "var(--hh-l4-floating-surface)",
  opacity: 1,
  zIndex: 1000,
  animation: "none",
  backdropFilter: "none",
  filter: "none",
};

function invoiceStatusMeta(status: InvoiceComputedStatus): {
  label: string;
  variant: StatusBadgeVariant;
} {
  if (status === "Draft")
    return {
      label: "Draft",
      variant: "muted",
    };
  if (status === "Void")
    return {
      label: "Void",
      variant: "danger",
    };
  if (status === "Paid")
    return {
      label: "Paid",
      variant: "success",
    };
  if (status === "Overdue")
    return {
      label: "Overdue",
      variant: "danger",
    };
  if (status === "Partial")
    return {
      label: "Partial",
      variant: "warning",
    };
  return {
    label: status === "Unpaid" ? "Unpaid" : "Sent",
    variant: "default",
  };
}

function InvoiceStatusText({
  status,
  className,
}: {
  status: InvoiceComputedStatus;
  className?: string;
}) {
  const statusMeta = invoiceStatusMeta(status);

  return (
    <NeoStatus
      label={statusMeta.label}
      variant={statusMeta.variant}
      className={cn("h-5 px-2 text-hh-status whitespace-nowrap", className)}
    />
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
    <div className="rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-2.5 py-1.5">
      <p className={financeSectionLabelClass}>{label}</p>
      <p
        className={cn(
          "mt-1 text-hh-table-cell font-medium tabular-nums leading-none tracking-normal text-[var(--hh-text-primary)]",
          emphasized && "text-hh-body font-semibold"
        )}
      >
        <NeoAmount>{value}</NeoAmount>
      </p>
    </div>
  );
}

function CompactSummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn(kpiTile, "px-2.5 py-2")}>
      <p className={financeSectionLabelClass}>{label}</p>
      <p className="mt-1 text-hh-table-cell font-semibold tabular-nums leading-none tracking-normal text-[var(--hh-text-primary)]">
        <NeoAmount>{value}</NeoAmount>
      </p>
    </div>
  );
}

function InvoiceListSkeleton() {
  return (
    <section className={cn(invoicesShell, "overflow-hidden p-0")}>
      <div className="hidden border-b border-[var(--hh-border)] px-5 py-3 lg:flex lg:items-center lg:justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="hidden divide-y divide-[var(--hh-border)] lg:block">
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
              <Skeleton className="h-8 w-8 rounded-hh-standard" />
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-3 p-3 lg:hidden">
        {Array.from({ length: 4 }).map((_, index) => (
          <NeoMobileCard key={`mobile-skeleton-${index}`} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-10 w-10 rounded-hh-standard" />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Skeleton className="h-14 rounded-hh-standard" />
              <Skeleton className="h-14 rounded-hh-standard" />
              <Skeleton className="h-14 rounded-hh-standard" />
            </div>
            <div className="mt-4 flex gap-2">
              <Skeleton className="h-10 flex-1 rounded-hh-standard" />
              <Skeleton className="h-10 flex-1 rounded-hh-standard" />
            </div>
          </NeoMobileCard>
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

type InvoiceListApiResponse = {
  ok: boolean;
  invoices?: InvoiceWithDerived[];
  total?: number;
  projects?: Project[];
  message?: string;
};

async function fetchInvoiceList(): Promise<{
  invoices: InvoiceWithDerived[];
  projects: Project[];
}> {
  const params = new URLSearchParams({
    derived: "1",
    all: "1",
    page: "1",
    pageSize: "1000",
    includeProjects: "1",
  });
  const res = await fetch(`/api/invoices?${params.toString()}`, { cache: "no-store" });
  const data = (await res.json().catch(() => null)) as InvoiceListApiResponse | null;
  if (!res.ok || !data?.ok) {
    throw new Error(data?.message ?? "Failed to load invoices.");
  }
  return {
    invoices: Array.isArray(data.invoices) ? data.invoices : [],
    projects: Array.isArray(data.projects) ? data.projects : [],
  };
}

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
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [desktopFiltersOpen, setDesktopFiltersOpen] = React.useState(false);
  const [summaryOpen, setSummaryOpen] = React.useState(false);
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [voidTarget, setVoidTarget] = React.useState<InvoiceWithDerived | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<InvoiceWithDerived | null>(null);
  const [deleteDependenciesOpen, setDeleteDependenciesOpen] = React.useState(false);
  const [deleteDependencies, setDeleteDependencies] =
    React.useState<InvoiceDeleteDependenciesResult | null>(null);
  const [deleteCheckBusyId, setDeleteCheckBusyId] = React.useState<string | null>(null);
  const [unlinkingScheduleItemId, setUnlinkingScheduleItemId] = React.useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = React.useState<string | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    let cancelled = false;

    const loadInitialData = async (): Promise<void> => {
      try {
        const { invoices: invoiceList, projects: projectList } = await fetchInvoiceList();
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
      const { invoices: list, projects: projectList } = await fetchInvoiceList();
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

  const runDeleteDependencyCheck = React.useCallback(
    async (target: InvoiceWithDerived, { openWhenClear = false } = {}) => {
      setDeleteCheckBusyId(target.id);
      try {
        const result = await checkInvoiceDeleteDependenciesAction(target.id);
        if (!result.ok || !result.dependencies) {
          toast({
            title: "Could not check invoice links",
            description: result.error ?? "Please try again.",
            variant: "error",
          });
          return;
        }
        setDeleteDependencies(result.dependencies);
        if (result.dependencies.blockers.length > 0) {
          setDeleteTarget(null);
          setDeleteDependenciesOpen(true);
          return;
        }
        setDeleteDependenciesOpen(false);
        if (openWhenClear) setDeleteTarget(target);
      } finally {
        setDeleteCheckBusyId(null);
      }
    },
    [toast]
  );

  const handleDeleteRequest = React.useCallback(
    (target: InvoiceWithDerived) => {
      void runDeleteDependencyCheck(target, { openWhenClear: true });
    },
    [runDeleteDependencyCheck]
  );

  const handleDelete = React.useCallback(
    async (target: InvoiceWithDerived) => {
      setDeleteBusyId(target.id);
      try {
        const result = await deleteInvoiceAction(target.id);
        if (!result.ok) {
          if (result.dependencies?.blockers.length) {
            setDeleteDependencies(result.dependencies);
            setDeleteTarget(null);
            setDeleteDependenciesOpen(true);
            return;
          }
          toast({
            title: "Could not delete invoice",
            description: result.error ?? "Only voided invoices can be permanently deleted.",
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

  const handleUnlinkScheduleItem = React.useCallback(
    async (scheduleItemId: string) => {
      const invoiceId = deleteDependencies?.invoiceId;
      if (!invoiceId || unlinkingScheduleItemId) return;
      setUnlinkingScheduleItemId(scheduleItemId);
      try {
        const result = await unlinkInvoiceScheduleItemAction(invoiceId, scheduleItemId);
        if (!result.ok) {
          toast({
            title: "Could not unlink schedule item",
            description: result.error ?? "Please try again.",
            variant: "error",
          });
          return;
        }
        toast({ title: "Schedule item unlinked", variant: "success" });
        const target = invoices.find((invoice) => invoice.id === invoiceId);
        if (target) await runDeleteDependencyCheck(target);
      } finally {
        setUnlinkingScheduleItemId(null);
      }
    },
    [
      deleteDependencies?.invoiceId,
      invoices,
      runDeleteDependencyCheck,
      toast,
      unlinkingScheduleItemId,
    ]
  );

  const handleDuplicate = React.useCallback(
    async (id: string) => {
      const result = await duplicateInvoiceAction(id);
      if (!result.ok) {
        toast({
          title: "Could not duplicate invoice",
          description: result.error ?? "Please try again.",
          variant: "error",
        });
        return;
      }
      startTransition(() => router.push(`/financial/invoices/${result.invoiceId}`));
    },
    [router, toast]
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
      data-revenue-ar-v2
      className={cn(
        "hh-fin min-w-0 overflow-x-hidden bg-[var(--hh-l0-canvas)] pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-[max(0.35rem,env(safe-area-inset-top,0px))] text-[var(--hh-text-secondary)]",
        "flex flex-col"
      )}
    >
      <div
        className={cn(
          "page-shell-wide mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-3 px-4 py-2 pb-4 sm:max-w-[460px] md:gap-3 md:px-6 md:pb-5 md:pt-2",
          mobileListPagePaddingClass
        )}
      >
        <div className="hidden md:block">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h1 className={financePageTitleClass}>Invoices</h1>
                {refreshing ? (
                  <span className="text-hh-status font-medium tracking-normal text-[var(--hh-text-tertiary)]">
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
                OS.primaryButton,
                "h-11 min-h-11 shrink-0 gap-1.5 rounded-hh-standard px-3.5 shadow-none xl:h-[34px] xl:min-h-[34px]",
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
          filtersTriggerClassName="min-h-11"
          searchSlot={
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--hh-text-tertiary)]" />
              <Input
                placeholder="Invoice #, client, project…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 pl-8 text-hh-table-cell tracking-normal text-[var(--hh-text-primary)] placeholder:text-[var(--hh-text-tertiary)]"
              />
            </div>
          }
        />
        <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
          <div className="space-y-2">
            <label htmlFor="invoice-mobile-filter-status" className={financeControlLabelClass}>
              Status
            </label>
            <Select
              id="invoice-mobile-filter-status"
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
            <label htmlFor="invoice-mobile-filter-project" className={financeControlLabelClass}>
              Project
            </label>
            <Select
              id="invoice-mobile-filter-project"
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
                aria-label="Issue from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-11 min-h-11 tabular-nums"
              />
              <Input
                aria-label="Issue to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-11 min-h-11 tabular-nums"
              />
            </div>
          </div>
          <Button
            type="button"
            className={cn("w-full rounded-hh-compact", financeToolbarButtonTextClass)}
            onClick={() => setFiltersOpen(false)}
          >
            Done
          </Button>
        </MobileFilterSheet>

        {(isInitialLoading || invoices.length > 0) && !loadError ? (
          <section
            className={cn(invoicesShell, "overflow-hidden p-0")}
            data-testid="invoice-workspace-summary"
          >
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-[var(--hh-l3-hover)]"
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
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-6 gap-y-1.5">
                    <span className="inline-flex items-baseline gap-1">
                      <span className="text-hh-status leading-none text-[var(--hh-text-secondary)]">
                        Open
                      </span>
                      <span className="text-hh-body font-semibold tabular-nums tracking-normal text-[var(--hh-text-primary)]">
                        {formatInteger(summary.openCount)}
                      </span>
                    </span>
                    <span className="inline-flex items-baseline gap-1">
                      <span className="text-hh-status leading-none text-[var(--hh-text-secondary)]">
                        Outstanding
                      </span>
                      <NeoAmount className="text-hh-body font-semibold leading-none">
                        {formatCurrency(summary.outstanding)}
                      </NeoAmount>
                    </span>
                    <span className="inline-flex items-baseline gap-1">
                      <span className="text-hh-status leading-none text-[var(--hh-text-secondary)]">
                        Overdue
                      </span>
                      <NeoAmount tone="danger" className="text-hh-body font-semibold leading-none">
                        {formatCurrency(summary.overdue)}
                      </NeoAmount>
                    </span>
                  </div>
                )}
              </div>
              <span className="shrink-0 text-[var(--hh-text-secondary)]">
                {summaryOpen ? (
                  <ChevronUp className="h-4 w-4" aria-hidden />
                ) : (
                  <ChevronDown className="h-4 w-4" aria-hidden />
                )}
              </span>
            </button>
            {summaryOpen ? (
              <div className="border-t border-[var(--hh-border)] p-2.5">
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

        <NeoToolbar className="hidden gap-2 p-2.5 md:flex md:flex-col md:items-stretch">
          <div className="flex items-center gap-2 rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-1">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--hh-text-tertiary)]" />
              <Input
                placeholder="Invoice #, client, project…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 min-h-11 border-transparent bg-[var(--hh-l2-operational-surface)] pl-8 text-hh-table-cell tracking-normal text-[var(--hh-text-primary)] placeholder:text-[var(--hh-text-tertiary)] shadow-none transition-colors focus-visible:border-[var(--hh-action-primary)] focus-visible:ring-[var(--hh-focus-ring)] xl:h-9 xl:min-h-9"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                OS.secondaryButton,
                "h-11 min-h-11 shrink-0 gap-1.5 rounded-hh-standard border-transparent px-3.5 shadow-none xl:h-9 xl:min-h-9",
                financeToolbarButtonTextClass
              )}
              aria-expanded={desktopFiltersOpen}
              onClick={() => setDesktopFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
              Filters
              {hasAdvancedFilters ? (
                <span className="rounded-full bg-[var(--hh-l3-selected)] px-1.5 py-0.5 text-hh-status font-medium tracking-normal text-[var(--hh-action-primary)]">
                  {activeDrawerFilterCount}
                </span>
              ) : null}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                NEO.buttonGhost,
                "h-11 min-h-11 shrink-0 rounded-hh-standard px-3.5 shadow-none xl:h-9 xl:min-h-9",
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
                  className="inline-flex h-6 items-center gap-1 rounded-full border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-2.5 text-hh-status font-medium tracking-normal text-[var(--hh-text-secondary)] transition-colors hover:text-[var(--hh-text-primary)]"
                  onClick={() => clearFilterChip(chip.key)}
                >
                  <span>{chip.label}</span>
                  <X className="h-3 w-3" aria-hidden />
                </button>
              ))}
              <button
                type="button"
                className="text-hh-status font-medium tracking-normal text-[var(--hh-text-secondary)] transition-colors hover:text-[var(--hh-text-primary)]"
                onClick={clearAdvancedFilters}
              >
                Clear all
              </button>
            </div>
          ) : null}

          {desktopFiltersOpen ? (
            <div className="mt-2 grid gap-2 border-t border-[var(--hh-border)] pt-2 md:grid-cols-[168px_208px_156px_156px]">
              <div className="space-y-1">
                <label htmlFor="invoice-filter-status" className={financeControlLabelClass}>
                  Status
                </label>
                <Select
                  id="invoice-filter-status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as "" | InvoiceComputedStatus)}
                  className="h-11 min-h-11 w-full bg-[var(--hh-l2-operational-surface)] xl:h-8 xl:min-h-8"
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value || "all"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <label htmlFor="invoice-filter-project" className={financeControlLabelClass}>
                  Project
                </label>
                <Select
                  id="invoice-filter-project"
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className="h-11 min-h-11 w-full bg-[var(--hh-l2-operational-surface)] xl:h-8 xl:min-h-8"
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
                <label htmlFor="invoice-filter-issue-from" className={financeControlLabelClass}>
                  Issue from
                </label>
                <Input
                  id="invoice-filter-issue-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-11 min-h-11 bg-[var(--hh-l2-operational-surface)] tabular-nums xl:h-8 xl:min-h-8"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="invoice-filter-issue-to" className={financeControlLabelClass}>
                  Issue to
                </label>
                <Input
                  id="invoice-filter-issue-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-11 min-h-11 bg-[var(--hh-l2-operational-surface)] tabular-nums xl:h-8 xl:min-h-8"
                />
              </div>
            </div>
          ) : null}
        </NeoToolbar>

        {activeFilterChips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 md:hidden">
            {activeFilterChips.map((chip) => (
              <button
                key={`mobile-${chip.key}`}
                type="button"
                className="inline-flex h-7 items-center gap-1 rounded-full border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-2.5 text-hh-status font-medium tracking-normal text-[var(--hh-text-secondary)]"
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
            icon={<AlertTriangle className="h-5 w-5" aria-hidden />}
            action={
              <Button
                size="sm"
                variant="outline"
                className={cn(
                  OS.secondaryButton,
                  "h-9 rounded-hh-standard shadow-none",
                  financeToolbarButtonTextClass
                )}
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
              icon={<Search className="h-5 w-5" aria-hidden />}
              action={
                <Button
                  size="sm"
                  variant="outline"
                  className={cn(
                    OS.secondaryButton,
                    "h-9 rounded-hh-standard shadow-none",
                    financeToolbarButtonTextClass
                  )}
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
            <EmptyState
              title="No invoices yet"
              description="Create your first invoice to start tracking receivables, balances, and payment activity."
              icon={<FileText className="h-5 w-5" aria-hidden />}
              action={
                <Button
                  asChild
                  size="sm"
                  className={cn(
                    OS.primaryButton,
                    "h-9 rounded-hh-standard shadow-none",
                    financeToolbarButtonTextClass
                  )}
                >
                  <Link href="/financial/invoices/new">
                    <Plus className="mr-2 h-3.5 w-3.5" aria-hidden />
                    Create first invoice
                  </Link>
                </Button>
              }
            />
          )
        ) : (
          <>
            <NeoTable
              className="hidden lg:block"
              tableClassName="min-w-[760px] table-fixed"
              busy={voidBusyId != null || deleteBusyId != null}
              data-testid="invoices-desktop-list"
            >
              <colgroup>
                <col className="w-[27%]" />
                <col className="w-[17%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[6%]" />
              </colgroup>
              <thead>
                <tr>
                  <th className={invoiceTableThClass}>Invoice</th>
                  <th className={invoiceTableThClass}>Project</th>
                  <th className={invoiceTableThClass}>Status</th>
                  <th className={invoiceTableThClass}>Due</th>
                  <th className={invoiceTableNumericThClass}>Balance</th>
                  <th className={invoiceTableNumericThClass}>Paid</th>
                  <th className={invoiceTableNumericThClass}>Total</th>
                  <th className={cn(invoiceTableThClass, "px-2 text-right")}>Actions</th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child>td]:border-b-0">
                {tableInvoiceRows.map(({ invoice: inv, projectLabel }) => {
                  const isBusy =
                    voidBusyId === inv.id ||
                    deleteBusyId === inv.id ||
                    deleteCheckBusyId === inv.id;
                  const canDelete = inv.computedStatus === "Void";
                  const canRecordPayment =
                    inv.computedStatus !== "Draft" &&
                    inv.computedStatus !== "Void" &&
                    inv.computedStatus !== "Paid" &&
                    inv.balanceDue > 0;
                  const dueTone =
                    inv.computedStatus === "Overdue"
                      ? OS.dangerAmount
                      : "text-[var(--hh-text-secondary)]";
                  const balanceTone = inv.computedStatus === "Overdue" ? "danger" : "neutral";
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
                            onClick: () => handleDeleteRequest(inv),
                          },
                        ]
                      : []),
                  ];

                  return (
                    <tr
                      key={inv.id}
                      data-testid={`invoice-row-${inv.invoiceNo}`}
                      className={listTableRowClassName}
                      onClick={() =>
                        startTransition(() => router.push(`/financial/invoices/${inv.id}`))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          startTransition(() => router.push(`/financial/invoices/${inv.id}`));
                        }
                      }}
                      tabIndex={0}
                      role="link"
                      aria-label={`Open invoice ${inv.invoiceNo} for ${inv.clientName}`}
                    >
                      <td className={cn(invoiceTableTdClass, "max-w-[280px]")}>
                        <button
                          type="button"
                          className="block w-full min-w-0 text-left"
                          aria-label={`${inv.clientName} ${inv.invoiceNo}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            startTransition(() => router.push(`/financial/invoices/${inv.id}`));
                          }}
                        >
                          <span className={cn(financePrimaryTextClass, "block truncate")}>
                            {inv.clientName}
                          </span>
                          <span className={cn(financeMetadataStrongClass, "mt-1 block")}>
                            {inv.invoiceNo}
                          </span>
                        </button>
                      </td>
                      <td className={cn(invoiceTableTdClass, "max-w-[220px]")}>
                        <span className="block truncate text-hh-table-cell font-medium text-[var(--hh-text-secondary)]">
                          {projectLabel}
                        </span>
                      </td>
                      <td className={invoiceTableTdClass}>
                        <InvoiceStatusText status={inv.computedStatus} />
                      </td>
                      <td className={invoiceTableTdClass}>
                        <span className="inline-flex items-center gap-1 whitespace-nowrap text-hh-metadata">
                          <span className="text-[var(--hh-text-tertiary)]">Due</span>
                          <span className={cn("font-medium tabular-nums", dueTone)}>
                            {formatDate(inv.dueDate)}
                          </span>
                        </span>
                      </td>
                      <td className={cn(invoiceTableTdClass, "text-right")}>
                        <NeoAmount tone={balanceTone} className={financeAmountClass}>
                          {formatCurrency(inv.balanceDue)}
                        </NeoAmount>
                      </td>
                      <td className={cn(invoiceTableTdClass, "text-right")}>
                        <NeoAmount tone="muted" className={financeSecondaryAmountClass}>
                          {formatCurrency(inv.paidTotal)}
                        </NeoAmount>
                      </td>
                      <td className={cn(invoiceTableTdClass, "text-right")}>
                        <NeoAmount className={financeSecondaryAmountClass}>
                          {formatCurrency(inv.total)}
                        </NeoAmount>
                      </td>
                      <td
                        className={cn(invoiceTableTdClass, "px-2 text-right")}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <RowActionsMenu
                          appearance="list"
                          ariaLabel={`Actions for ${inv.invoiceNo}`}
                          contentClassName={invoiceActionsMenuContentClassName}
                          contentStyle={invoiceActionsMenuContentStyle}
                          actions={rowActions}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </NeoTable>

            <div className="space-y-2 p-2.5 lg:hidden">
              {tableInvoiceRows.map(({ invoice: inv, projectLabel }) => {
                const isBusy =
                  voidBusyId === inv.id || deleteBusyId === inv.id || deleteCheckBusyId === inv.id;
                const canDelete = inv.computedStatus === "Void";
                const canRecordPayment =
                  inv.computedStatus !== "Draft" &&
                  inv.computedStatus !== "Void" &&
                  inv.computedStatus !== "Paid" &&
                  inv.balanceDue > 0;
                const dueTone =
                  inv.computedStatus === "Overdue"
                    ? OS.dangerAmount
                    : "text-[var(--hh-text-secondary)]";
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
                          onClick: () => handleDeleteRequest(inv),
                        },
                      ]
                    : []),
                ];

                return (
                  <NeoMobileCard
                    key={inv.id}
                    data-testid={`invoice-mobile-card-${inv.invoiceNo}`}
                    className="p-3"
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
                          className="h-11 w-11 min-h-11 min-w-11 rounded-hh-standard border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] shadow-none hover:bg-[var(--hh-l3-hover)]"
                          contentAvoidCollisions={false}
                          contentSide="bottom"
                          contentSideOffset={8}
                          contentClassName={cn(
                            invoiceActionsMenuContentClassName,
                            "w-36 min-w-36 rounded-hh-standard py-1"
                          )}
                          contentStyle={invoiceActionsMenuContentStyle}
                          itemClassName="relative z-10 h-8 rounded-hh-standard px-3 py-0 text-hh-table-cell font-medium tracking-normal"
                          destructiveItemClassName="text-[var(--hh-danger)] focus:bg-[var(--hh-danger-soft-fill)] focus:text-[var(--hh-danger)] hover:bg-[var(--hh-danger-soft-fill)] hover:text-[var(--hh-danger)]"
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
                          OS.secondaryButton,
                          "h-11 min-h-11 flex-1 rounded-hh-standard shadow-none",
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
                          OS.secondaryButton,
                          "h-11 min-h-11 flex-1 rounded-hh-standard shadow-none",
                          financeToolbarButtonTextClass
                        )}
                      >
                        <Link
                          href={secondaryAction.href}
                          prefetch={secondaryAction.href.includes("/preview") ? false : undefined}
                        >
                          {secondaryAction.label}
                        </Link>
                      </Button>
                    </div>
                  </NeoMobileCard>
                );
              })}
            </div>
          </>
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
          title="Delete voided invoice?"
          description={
            deleteTarget
              ? `This voided invoice has no blocking financial links. This will permanently delete ${deleteTarget.invoiceNo} and its line items. This cannot be undone.`
              : undefined
          }
          confirmLabel="Delete permanently"
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
        <InvoiceDeleteDependenciesDialog
          open={deleteDependenciesOpen}
          onOpenChange={setDeleteDependenciesOpen}
          dependencies={deleteDependencies}
          checking={Boolean(deleteCheckBusyId)}
          onRefresh={() => {
            const invoiceId = deleteDependencies?.invoiceId;
            const target = invoices.find((invoice) => invoice.id === invoiceId);
            if (target) void runDeleteDependencyCheck(target);
          }}
          onUnlinkScheduleItem={handleUnlinkScheduleItem}
          unlinkingId={unlinkingScheduleItemId}
        />
      </div>
    </div>
  );
}
