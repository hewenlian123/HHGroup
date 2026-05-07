"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { TYPO } from "@/lib/typography";
import {
  CalendarDays,
  DollarSign,
  FileText,
  ListOrdered,
  Plus,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import {
  MobileFabButton,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { FilterBar } from "@/components/filter-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import {
  getWorkers,
  getProjects,
  getWorkerInvoices,
  insertWorkerInvoice,
  updateWorkerInvoice,
  deleteWorkerInvoice,
  type WorkerInvoice,
  type WorkerInvoiceStatus,
} from "@/lib/data";
import { RowActionsMenu } from "@/components/base/row-actions-menu";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import { formatCurrency, formatDate } from "@/lib/formatters";

const invShell =
  "rounded-xl border border-zinc-200/70 bg-white shadow-[0_1px_0_rgba(0,0,0,0.04),0_4px_24px_rgba(0,0,0,0.045)] dark:border-border/50 dark:bg-card/80 dark:shadow-none md:rounded-2xl";

const invKpiTile =
  "rounded-xl border border-zinc-200/40 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.028),0_1px_12px_rgba(0,0,0,0.028)] dark:border-border/35 dark:bg-card/80 dark:shadow-none md:rounded-xl";

const invKpiIcon =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100/55 text-zinc-500 md:h-8 md:w-8 dark:bg-muted/60 dark:text-muted-foreground";

const AVATAR_RING = [
  "bg-zinc-200/80 text-zinc-800 dark:bg-zinc-700/50 dark:text-zinc-100",
  "bg-zinc-300/65 text-zinc-900 dark:bg-zinc-600/45 dark:text-zinc-100",
  "bg-zinc-100 text-zinc-800 dark:bg-zinc-800/55 dark:text-zinc-100",
  "bg-zinc-200/70 text-zinc-800 dark:bg-zinc-700/48 dark:text-zinc-100",
  "bg-zinc-300/55 text-zinc-900 dark:bg-zinc-600/40 dark:text-zinc-100",
  "bg-zinc-100/95 text-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-100",
];

const workerAvatarRing = "ring-1 ring-inset ring-zinc-950/[0.055] dark:ring-white/[0.08]";

function workerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2)
    return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
  const one = parts[0] ?? name;
  return one.slice(0, 2).toUpperCase();
}

function avatarRingClass(seed: string): string {
  let s = 0;
  for (let i = 0; i < seed.length; i++) s += seed.charCodeAt(i);
  return AVATAR_RING[s % AVATAR_RING.length] ?? AVATAR_RING[0];
}

function truncateId(id: string, max = 10): string {
  if (id.length <= max) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

function invoiceNoFromId(id: string): string {
  const tail = id.replaceAll("-", "").slice(-8).toUpperCase();
  return `WI-${tail || id.slice(0, 6).toUpperCase()}`;
}

function thisMonthPrefix(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${mo}`;
}

function thisMonthLabel(): string {
  return formatDate(new Date(), "month");
}

function InvoiceStatusChip({ status }: { status: WorkerInvoiceStatus }) {
  const chipBase =
    "inline-flex w-fit max-w-full min-h-[22px] shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] tabular-nums tracking-tight shadow-none";
  if (status === "paid") {
    return (
      <span
        className={cn(
          chipBase,
          "border-emerald-500/10 bg-emerald-500/[0.03] font-medium text-emerald-900/78 dark:border-emerald-500/12 dark:bg-emerald-500/[0.05] dark:text-emerald-100/82"
        )}
      >
        <span className="h-1 w-1 shrink-0 rounded-full bg-emerald-500/40" aria-hidden />
        Paid
      </span>
    );
  }
  return (
    <span
      className={cn(
        chipBase,
        "border-amber-500/10 bg-amber-500/[0.03] font-normal text-amber-900/65 dark:border-amber-500/10 dark:bg-amber-500/[0.04] dark:text-amber-100/62"
      )}
    >
      <span className="h-1 w-1 shrink-0 rounded-full bg-amber-500/35" aria-hidden />
      Open
    </span>
  );
}

export default function WorkerInvoicesPage() {
  const [workers, setWorkers] = React.useState<Awaited<ReturnType<typeof getWorkers>>>([]);
  const [projects, setProjects] = React.useState<Awaited<ReturnType<typeof getProjects>>>([]);
  const [rows, setRows] = React.useState<WorkerInvoice[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(1);
  const pageSize = 10;
  const [sort, setSort] = React.useState<{
    key: "createdAt" | "amount" | "status";
    dir: "asc" | "desc";
  }>({
    key: "createdAt",
    dir: "desc",
  });
  const [form, setForm] = React.useState({
    workerId: "",
    projectId: "",
    amount: "",
    status: "unpaid" as WorkerInvoiceStatus,
    invoiceFile: "",
  });
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [w, p, list] = await Promise.all([getWorkers(), getProjects(), getWorkerInvoices()]);
      setWorkers(w);
      setProjects(p);
      setRows(list);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  const workerById = React.useMemo(() => new Map(workers.map((w) => [w.id, w.name])), [workers]);
  const projectById = React.useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? rows.filter((r) => {
          const worker = workerById.get(r.workerId) ?? r.workerId;
          const project = r.projectId ? (projectById.get(r.projectId) ?? r.projectId) : "";
          return (
            worker.toLowerCase().includes(q) ||
            project.toLowerCase().includes(q) ||
            String(r.amount ?? "")
              .toLowerCase()
              .includes(q) ||
            (r.invoiceFile ?? "").toLowerCase().includes(q) ||
            (r.status ?? "").toLowerCase().includes(q)
          );
        })
      : rows;

    const dir = sort.dir === "asc" ? 1 : -1;
    const sorted = [...base].sort((a, b) => {
      if (sort.key === "amount") return ((a.amount ?? 0) - (b.amount ?? 0)) * dir;
      if (sort.key === "status")
        return (String(a.status).localeCompare(String(b.status)) || 0) * dir;
      return (String(a.createdAt).localeCompare(String(b.createdAt)) || 0) * dir;
    });
    return sorted;
  }, [rows, query, workerById, projectById, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = React.useMemo(() => {
    const p = Math.min(Math.max(1, page), totalPages);
    const start = (p - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, totalPages]);

  React.useEffect(() => {
    setPage(1);
  }, [query, sort]);

  const summary = React.useMemo(() => {
    const prefix = thisMonthPrefix();
    let totalInvoiced = 0;
    let openInvoices = 0;
    let paidInvoices = 0;
    let outstanding = 0;
    let thisMonth = 0;
    for (const r of rows) {
      totalInvoiced += r.amount ?? 0;
      if (r.status === "paid") {
        paidInvoices++;
      } else {
        openInvoices++;
        outstanding += r.amount ?? 0;
      }
      if (String(r.createdAt ?? "").startsWith(prefix)) thisMonth += r.amount ?? 0;
    }
    return { totalInvoiced, openInvoices, paidInvoices, outstanding, thisMonth };
  }, [rows]);

  const resetForm = () => {
    setForm({
      workerId: "",
      projectId: "",
      amount: "",
      status: "unpaid",
      invoiceFile: "",
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.workerId) {
      setMessage("Select a worker.");
      return;
    }
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount < 0) {
      setMessage("Enter a valid amount.");
      return;
    }
    setMessage(null);
    try {
      if (editingId) {
        await updateWorkerInvoice(editingId, {
          workerId: form.workerId,
          projectId: form.projectId || null,
          amount,
          status: form.status,
          invoiceFile: form.invoiceFile.trim() || null,
        });
      } else {
        await insertWorkerInvoice({
          workerId: form.workerId,
          projectId: form.projectId || null,
          amount,
          status: form.status,
          invoiceFile: form.invoiceFile.trim() || null,
        });
      }
      resetForm();
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed.");
    }
  };

  const handleEdit = (row: WorkerInvoice) => {
    setForm({
      workerId: row.workerId,
      projectId: row.projectId ?? "",
      amount: String(row.amount),
      status: row.status,
      invoiceFile: row.invoiceFile ?? "",
    });
    setEditingId(row.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this invoice?")) return;
    try {
      await deleteWorkerInvoice(id);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Delete failed.");
    }
  };

  const toggleStatus = async (row: WorkerInvoice) => {
    const next: WorkerInvoiceStatus = row.status === "paid" ? "unpaid" : "paid";
    try {
      await updateWorkerInvoice(row.id, { status: next });
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Update failed.");
    }
  };

  const sortFilterActive = sort.key !== "createdAt" || sort.dir !== "desc" ? 1 : 0;

  const openNewInvoice = () => {
    resetForm();
    setShowForm(true);
  };

  const initialLoading = loading && rows.length === 0;
  const refreshing = loading && rows.length > 0;
  const fetchBusy = loading;

  const selectFieldClass =
    "h-10 w-full min-w-0 rounded-md border border-zinc-200/65 bg-white px-3 text-sm text-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-zinc-200 hover:bg-zinc-50/40 focus-visible:border-zinc-300/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400/18 dark:border-border/80 dark:bg-card dark:text-foreground dark:hover:bg-muted/25 dark:focus-visible:ring-zinc-500/25";

  const searchInput = (
    <div className="relative w-full min-w-0">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search workers, projects, invoices…"
        className="h-11 min-h-[44px] border-zinc-200/65 bg-white pl-8 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:bg-white focus-visible:border-zinc-300/90 focus-visible:ring-zinc-400/18 md:h-10 md:min-h-10"
        aria-label="Search invoices"
      />
    </div>
  );

  const thClass = cn("px-3 py-2 text-left", TYPO.tableHeader);
  const thRight = cn("px-3 py-2 text-right tabular-nums", TYPO.tableHeader);

  return (
    <div
      className={cn(
        "min-w-0 overflow-x-hidden bg-zinc-50 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-[max(0.35rem,env(safe-area-inset-top,0px))] dark:bg-background",
        "flex flex-col"
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-2 px-4 py-2 pb-4 dark:bg-background sm:max-w-[460px] md:max-w-6xl md:gap-2 md:px-6 md:pb-6 md:pt-3",
          mobileListPagePaddingClass,
          "max-md:!gap-2"
        )}
      >
        <div className="hidden md:block">
          <PageHeader
            className="gap-1 border-b border-zinc-200/70 pb-2 dark:border-border/60 lg:items-baseline lg:gap-x-4 [&_p]:mt-0"
            title="Worker Invoices"
            subtitle="Track worker invoices, billed labor, payment status, and related projects."
            actions={
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-9 shrink-0 gap-1.5 border-zinc-200/90 bg-white shadow-none hover:bg-zinc-50 hover:text-zinc-950 dark:border-border dark:bg-transparent dark:text-foreground dark:hover:bg-muted/35",
                  TYPO.button
                )}
                onClick={openNewInvoice}
              >
                <Plus
                  className="h-3.5 w-3.5 text-zinc-600 dark:text-muted-foreground"
                  aria-hidden
                />
                New Invoice
              </Button>
            }
          />
        </div>

        <MobileListHeader
          title="Worker Invoices"
          fab={<MobileFabButton ariaLabel="New invoice" onClick={openNewInvoice} />}
        />

        {initialLoading ? (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5 lg:gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className={cn(invKpiTile, "flex h-[52px] items-center gap-2 px-3 md:h-[62px]")}
              >
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-2.5 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5 lg:gap-2">
            <div
              className={cn(
                invKpiTile,
                "flex min-h-[48px] items-start gap-1.5 px-2 py-2 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={cn(invKpiIcon, "mt-0.5 md:mt-0")}>
                <DollarSign className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  Total invoiced
                </p>
                <p className="mt-0.5 truncate text-base font-medium tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {formatCurrency(summary.totalInvoiced)}
                </p>
                <p className="mt-0.5 text-[9px] leading-none text-muted-foreground">All time</p>
              </div>
            </div>
            <div
              className={cn(
                invKpiTile,
                "flex min-h-[48px] items-start gap-1.5 px-2 py-2 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={cn(invKpiIcon, "mt-0.5 md:mt-0")}>
                <ListOrdered className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  Open invoices
                </p>
                <p className="mt-0.5 text-base font-medium tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {summary.openInvoices}
                </p>
                <p className="mt-0.5 text-[9px] leading-none text-muted-foreground">Unpaid</p>
              </div>
            </div>
            <div
              className={cn(
                invKpiTile,
                "flex min-h-[48px] items-start gap-1.5 px-2 py-2 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={cn(invKpiIcon, "mt-0.5 md:mt-0")}>
                <Users className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  Paid invoices
                </p>
                <p className="mt-0.5 text-base font-medium tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {summary.paidInvoices}
                </p>
                <p className="mt-0.5 text-[9px] leading-none text-muted-foreground">Closed</p>
              </div>
            </div>
            <div
              className={cn(
                invKpiTile,
                "flex min-h-[48px] items-start gap-1.5 px-2 py-2 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={cn(invKpiIcon, "mt-0.5 md:mt-0")}>
                <FileText className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  Outstanding
                </p>
                <p className="mt-0.5 truncate text-base font-medium tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {formatCurrency(summary.outstanding)}
                </p>
                <p className="mt-0.5 text-[9px] leading-none text-muted-foreground">Open balance</p>
              </div>
            </div>
            <div
              className={cn(
                invKpiTile,
                "col-span-2 flex min-h-[48px] items-start gap-1.5 px-2 py-2 sm:col-span-1 md:h-[62px] md:items-center md:gap-2 md:px-3 md:py-1.5"
              )}
            >
              <span className={cn(invKpiIcon, "mt-0.5 md:mt-0")}>
                <CalendarDays
                  className="h-3 w-3 md:h-3.5 md:w-3.5"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-medium uppercase leading-none tracking-wide text-muted-foreground md:text-[9px] md:normal-case md:tracking-normal">
                  This month
                </p>
                <p className="mt-0.5 truncate text-base font-medium tabular-nums leading-none text-zinc-900 md:text-xl dark:text-foreground">
                  {formatCurrency(summary.thisMonth)}
                </p>
                <p className="mt-0.5 truncate text-[9px] leading-none text-muted-foreground">
                  {thisMonthLabel()}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className={cn(invShell, "p-3 md:p-3")}>
          <MobileSearchFiltersRow
            filterSheetOpen={filtersOpen}
            onOpenFilters={() => setFiltersOpen(true)}
            activeFilterCount={sortFilterActive}
            filtersTriggerClassName="h-11 min-h-[44px]"
            searchSlot={searchInput}
          />

          <FilterBar className="hidden min-w-0 md:flex md:flex-col md:gap-2.5 md:pb-0 md:pt-0 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-3 lg:gap-y-2.5">
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:contents">
              <Select
                value={sort.key}
                onChange={(e) =>
                  setSort((s) => ({
                    ...s,
                    key: e.target.value as "createdAt" | "amount" | "status",
                  }))
                }
                className={cn(selectFieldClass, "lg:max-w-[180px]")}
                aria-label="Sort key"
              >
                <option value="createdAt">Date</option>
                <option value="amount">Amount</option>
                <option value="status">Status</option>
              </Select>
              <Select
                value={sort.dir}
                onChange={(e) => setSort((s) => ({ ...s, dir: e.target.value as "asc" | "desc" }))}
                className={cn(selectFieldClass, "lg:max-w-[200px]")}
                aria-label="Sort direction"
              >
                <option value="desc">Newest / high first</option>
                <option value="asc">Oldest / low first</option>
              </Select>
            </div>
            <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-1 sm:flex-row md:max-w-md lg:max-w-[min(100%,320px)]">
              {searchInput}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 w-full shrink-0 gap-1.5 rounded-sm border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:bg-zinc-50/90 lg:ml-auto lg:w-auto dark:border-border dark:bg-transparent dark:hover:bg-muted/30"
              onClick={() => void load()}
              disabled={fetchBusy}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", fetchBusy && "animate-spin")} aria-hidden />
              {fetchBusy ? "Loading…" : "Refresh"}
            </Button>
          </FilterBar>
        </div>

        <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Sort by</p>
            <Select
              value={sort.key}
              onChange={(e) =>
                setSort((s) => ({
                  ...s,
                  key: e.target.value as "createdAt" | "amount" | "status",
                }))
              }
              className="w-full"
            >
              <option value="createdAt">Date</option>
              <option value="amount">Amount</option>
              <option value="status">Status</option>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Order</p>
            <Select
              value={sort.dir}
              onChange={(e) => setSort((s) => ({ ...s, dir: e.target.value as "asc" | "desc" }))}
              className="w-full"
            >
              <option value="desc">Newest / high first</option>
              <option value="asc">Oldest / low first</option>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11 min-h-[44px] w-full rounded-sm"
            disabled={fetchBusy}
            onClick={() => {
              void load();
              setFiltersOpen(false);
            }}
          >
            <SubmitSpinner loading={fetchBusy} className="mr-2" />
            Refresh
          </Button>
          <Button
            type="button"
            className="h-11 min-h-[44px] w-full rounded-sm"
            onClick={() => setFiltersOpen(false)}
          >
            Done
          </Button>
        </MobileFilterSheet>

        {message ? (
          <p className="border-b border-zinc-200/80 pb-2 text-sm text-muted-foreground dark:border-border/60">
            {message}
          </p>
        ) : null}

        {showForm && (
          <div className={cn(invShell, "p-3 md:p-4")}>
            <div className="flex items-baseline justify-between gap-2 border-b border-zinc-100/80 pb-2 dark:border-border/50">
              <h2 className="text-[13px] font-medium text-zinc-900 dark:text-foreground">
                {editingId ? "Edit Invoice" : "New Worker Invoice"}
              </h2>
              <button
                type="button"
                onClick={resetForm}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
            <form
              onSubmit={handleSubmit}
              className="mt-3 flex flex-col items-stretch gap-3 max-md:[&_button]:min-h-11 md:flex-row md:flex-wrap md:items-end"
            >
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Worker
                </label>
                <select
                  value={form.workerId}
                  onChange={(e) => setForm((f) => ({ ...f, workerId: e.target.value }))}
                  className={cn(selectFieldClass, "h-9 min-w-[180px]")}
                  required
                >
                  <option value="">Select worker</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Project
                </label>
                <select
                  value={form.projectId}
                  onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
                  className={cn(selectFieldClass, "h-9 min-w-[180px]")}
                >
                  <option value="">—</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Amount
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  className="h-9 w-28 rounded-md tabular-nums"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Status
                </label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as WorkerInvoiceStatus }))
                  }
                  className={cn(selectFieldClass, "h-9 min-w-[120px]")}
                >
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Invoice file (URL)
                </label>
                <Input
                  type="text"
                  value={form.invoiceFile}
                  onChange={(e) => setForm((f) => ({ ...f, invoiceFile: e.target.value }))}
                  placeholder="Link to invoice file"
                  className="h-9 min-w-[220px] rounded-md"
                />
              </div>
              <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
                <Button type="submit" size="sm" className="h-9">
                  Save
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={resetForm}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}

        <div className="md:hidden">
          {initialLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className={cn(invShell, "space-y-3 p-3")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 gap-2">
                      <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                    <Skeleton className="h-8 w-20 rounded-full" />
                  </div>
                  <Skeleton className="h-8 w-36" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ))}
            </div>
          ) : paged.length === 0 ? (
            <div className={cn(invShell, "px-4 py-10 text-center")}>
              <p className="text-sm font-medium text-zinc-900 dark:text-foreground">
                No invoices yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create an invoice to track billed labor and payment status.
              </p>
            </div>
          ) : (
            <div
              className={cn("flex flex-col gap-2", refreshing && "pointer-events-none opacity-60")}
              aria-busy={refreshing || undefined}
            >
              {refreshing ? (
                <div className="flex justify-center py-1">
                  <span className="text-xs text-muted-foreground">Updating…</span>
                </div>
              ) : null}
              {paged.map((r) => {
                const workerName = workerById.get(r.workerId) ?? r.workerId;
                const projectName = r.projectId
                  ? (projectById.get(r.projectId) ?? r.projectId)
                  : null;
                const invNo = invoiceNoFromId(r.id);
                const actions = [
                  ...(r.invoiceFile
                    ? [
                        {
                          label: "View invoice file",
                          onClick: () =>
                            window.open(r.invoiceFile!, "_blank", "noopener,noreferrer"),
                        },
                      ]
                    : []),
                  {
                    label: r.status === "paid" ? "Mark as open" : "Mark as paid",
                    onClick: () => toggleStatus(r),
                  },
                  { label: "Edit", onClick: () => handleEdit(r) },
                  { label: "Delete", onClick: () => handleDelete(r.id), destructive: true },
                ];
                return (
                  <div
                    key={r.id}
                    className={cn(
                      invShell,
                      "space-y-3 p-3 transition-[box-shadow,border-color] duration-200 ease-out hover:border-zinc-200/70 dark:hover:border-border/60"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <span
                          className={cn(
                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold leading-none tabular-nums antialiased",
                            workerAvatarRing,
                            avatarRingClass(r.workerId)
                          )}
                          aria-hidden
                        >
                          {workerInitials(workerName)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-[13px] font-medium leading-snug tracking-tight text-zinc-900 dark:text-foreground">
                            {workerName}
                          </p>
                          <p className="mt-0.5 max-w-[11rem] truncate font-mono text-[9px] leading-none tabular-nums text-zinc-500/75 dark:text-zinc-400/85">
                            {truncateId(r.workerId)}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-start gap-1">
                        <InvoiceStatusChip status={r.status} />
                        <RowActionsMenu
                          ariaLabel={`Actions for invoice ${invNo}`}
                          actions={actions}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-end justify-between gap-2 border-b border-zinc-100/70 pb-2 dark:border-border/40">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Amount
                      </span>
                      <span className="max-w-full min-w-0 text-right text-xl font-semibold tabular-nums tracking-tight text-zinc-800 dark:text-zinc-100">
                        {formatCurrency(r.amount)}
                      </span>
                    </div>
                    <dl className="grid grid-cols-1 gap-x-3 gap-y-2 text-xs sm:grid-cols-2">
                      <div className="min-w-0">
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Invoice #
                        </dt>
                        <dd className="truncate pt-0.5 font-mono text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
                          {invNo}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Date
                        </dt>
                        <dd className="truncate pt-0.5 font-mono text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
                          {formatDate(r.createdAt)}
                        </dd>
                      </div>
                      <div className="min-w-0 sm:col-span-2">
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Project
                        </dt>
                        <dd className="truncate pt-0.5 text-sm text-zinc-600 dark:text-zinc-300">
                          {projectName ?? "—"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div
          className={cn(
            invShell,
            "hidden overflow-hidden md:block",
            refreshing && rows.length > 0 && "pointer-events-none opacity-60"
          )}
          aria-busy={refreshing && rows.length > 0 ? true : undefined}
        >
          {refreshing && rows.length > 0 ? (
            <div className="flex justify-center border-b border-zinc-100/90 py-1 dark:border-border/50">
              <span className="text-xs text-muted-foreground">Updating…</span>
            </div>
          ) : null}
          <div className="overflow-x-auto pb-1 md:pb-3">
            <table className="w-full min-w-[860px] border-collapse text-sm lg:min-w-0">
              <thead>
                <tr className="border-b border-zinc-100/90 bg-zinc-50/90 dark:border-border/60 dark:bg-muted/20">
                  <th className={cn(thClass, "min-w-[220px]")}>Worker</th>
                  <th className={cn(thClass, "min-w-[140px]")}>Project</th>
                  <th className={cn(thClass, "min-w-[120px]")}>Invoice #</th>
                  <th className={cn(thRight, "min-w-[110px]")}>Amount</th>
                  <th className={cn(thClass, "min-w-[110px]")}>Status</th>
                  <th className={cn(thRight, "whitespace-nowrap")}>Date</th>
                  <th className="w-12 px-2 py-2 text-right align-middle text-[10px] font-medium uppercase leading-none tracking-[0.08em] text-muted-foreground">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-b-0">
                {initialLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-zinc-100/55 dark:border-border/35">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                          <div className="min-w-0 flex-1 space-y-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24" />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Skeleton className="h-4 w-20" />
                      </td>
                      <td className="px-3 py-2.5">
                        <Skeleton className="h-4 w-24" />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Skeleton className="ml-auto h-4 w-16" />
                      </td>
                      <td className="px-3 py-2.5">
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Skeleton className="ml-auto h-4 w-24" />
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <Skeleton className="ml-auto h-8 w-8 rounded-sm" />
                      </td>
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr className="border-b border-zinc-100/55 dark:border-border/35">
                    <td colSpan={7} className="px-6 py-14 text-center">
                      <div className="mx-auto flex max-w-md flex-col items-center">
                        <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200/70 bg-zinc-50/80 text-zinc-600 dark:border-border/60 dark:bg-muted/25 dark:text-zinc-300">
                          <FileText className="h-5 w-5" aria-hidden />
                        </span>
                        <p className="text-sm font-medium text-zinc-900 dark:text-foreground">
                          No invoices to review yet
                        </p>
                        <p className="mt-1 text-xs leading-snug text-muted-foreground">
                          Create your first worker invoice to track billed labor, payment status,
                          and linked projects.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-4 h-9 rounded-sm"
                          onClick={openNewInvoice}
                        >
                          <Plus className="mr-2 h-3.5 w-3.5" aria-hidden />
                          Create first invoice
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paged.map((r) => {
                    const workerName = workerById.get(r.workerId) ?? r.workerId;
                    const projectName = r.projectId
                      ? (projectById.get(r.projectId) ?? r.projectId)
                      : null;
                    const invNo = invoiceNoFromId(r.id);
                    const actions = [
                      ...(r.invoiceFile
                        ? [
                            {
                              label: "View invoice file",
                              onClick: () =>
                                window.open(r.invoiceFile!, "_blank", "noopener,noreferrer"),
                            },
                          ]
                        : []),
                      {
                        label: r.status === "paid" ? "Mark as open" : "Mark as paid",
                        onClick: () => toggleStatus(r),
                      },
                      { label: "Edit", onClick: () => handleEdit(r) },
                      { label: "Delete", onClick: () => handleDelete(r.id), destructive: true },
                    ];
                    return (
                      <tr
                        key={r.id}
                        className={cn(
                          listTableRowStaticClassName,
                          "border-b border-zinc-100/45 dark:border-border/22",
                          "!transition-colors duration-150 ease-out motion-reduce:!transition-none",
                          "hover:!bg-zinc-50/[0.38] dark:hover:!bg-muted/[0.06]",
                          "focus-within:!bg-zinc-50/28 dark:focus-within:!bg-muted/[0.05]"
                        )}
                      >
                        <td className="px-3 py-2.5 align-middle">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span
                              className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold leading-none tabular-nums antialiased",
                                workerAvatarRing,
                                avatarRingClass(r.workerId)
                              )}
                              aria-hidden
                            >
                              {workerInitials(workerName)}
                            </span>
                            <div className="min-w-0">
                              <p className="line-clamp-2 text-[13px] font-medium leading-snug tracking-tight text-zinc-900 dark:text-foreground">
                                {workerName}
                              </p>
                              <p className="max-w-[11rem] truncate font-mono text-[9px] leading-none tabular-nums text-zinc-500/75 dark:text-zinc-400/85">
                                {truncateId(r.workerId)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-2.5 align-middle text-sm text-zinc-600 dark:text-zinc-300">
                          {projectName ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 align-middle font-mono text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
                          {invNo}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right align-middle text-base font-semibold tabular-nums tracking-tight text-zinc-800 dark:text-zinc-100">
                          {formatCurrency(r.amount)}
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <InvoiceStatusChip status={r.status} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right align-middle font-mono text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
                          {formatDate(r.createdAt)}
                        </td>
                        <td
                          className="whitespace-nowrap px-2 py-2.5 text-right align-middle"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex justify-end">
                            <RowActionsMenu
                              appearance="list"
                              ariaLabel={`Actions for invoice ${invNo}`}
                              actions={actions}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-4 text-sm text-muted-foreground max-md:[&_button]:min-h-11 sm:flex-row sm:items-center sm:justify-between">
          <span className="tabular-nums">
            {filtered.length === 0
              ? "0"
              : Math.min(filtered.length, (page - 1) * pageSize + 1).toString()}
            –{Math.min(filtered.length, page * pageSize)} of {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 flex-1 rounded-sm shadow-none sm:flex-none"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 flex-1 rounded-sm shadow-none sm:flex-none"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
