"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FlaskConical, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tableRawThClass } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { EstimateListRow, EstimateMobileList } from "./estimate-list-row";
import { EstimateSuccessBanner } from "./[id]/estimate-success-banner";
import type { EstimateListItem, EstimateStatus } from "@/lib/estimates-db";
import {
  ConfirmDialog,
  EmptyState,
  KpiTile,
  NeoAmount,
  NeoTable,
  NeoToolbar,
  PageHeader,
} from "@/components/base";
import { useToast } from "@/components/toast/toast-provider";
import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import { formatEstimateCurrency } from "./_components/estimate-currency";
import {
  runDeleteEstimateActionWithTimeout,
  type DeleteEstimateAction,
} from "./delete-estimate-client";
import { duplicateEstimateAsDraftAction } from "./actions";
import {
  MobileEmptyState,
  MobileFabPlus,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { cn } from "@/lib/utils";
import "./estimate-list-operational.css";

const PAGE_BG = "estimate-list-workspace text-[var(--hh-text-secondary)]";
const FIELD =
  "estimate-list-search-field text-hh-control h-hh-control-standard rounded-hh-compact border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-primary)] shadow-none transition-[border-color,background-color,box-shadow] duration-150 placeholder:text-[var(--hh-text-tertiary)] hover:border-[var(--hh-border-strong)] hover:bg-[var(--hh-l3-hover)] focus-visible:border-[var(--hh-border-strong)] focus-visible:bg-[var(--hh-l2-operational-surface)] focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)]";
const PRIMARY_ACTION =
  "rounded-hh-compact border border-[var(--hh-action-primary)] bg-[var(--hh-action-primary)] text-[var(--hh-action-primary-foreground)] shadow-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)]";

export function EstimatesListClient({
  list,
  loadWarning,
  saved,
  errorMessage,
  deleteEstimateAction,
}: {
  list: EstimateListItem[];
  loadWarning: string | null;
  saved?: string;
  errorMessage: string | null;
  deleteEstimateAction: DeleteEstimateAction;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [rows, setRows] = React.useState(list);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<EstimateStatus | "all">("all");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<EstimateListItem | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [copyingEstimateId, setCopyingEstimateId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setRows(list);
  }, [list]);

  const activeFilterCount = statusFilter !== "all" ? 1 : 0;

  const filtered = React.useMemo(() => {
    let nextRows = [...rows];
    if (statusFilter !== "all") {
      nextRows = nextRows.filter((e) => e.status === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (!q) return nextRows;
    return nextRows.filter(
      (e) =>
        e.number.toLowerCase().includes(q) ||
        e.client.toLowerCase().includes(q) ||
        e.project.toLowerCase().includes(q)
    );
  }, [rows, search, statusFilter]);

  const totalEstimates = rows.length;
  const draftCount = rows.filter((e) => e.status === "Draft").length;
  const sentCount = rows.filter((e) => e.status === "Sent").length;
  const totalValue = rows.reduce((sum, e) => sum + (Number(e.total) || 0), 0);

  const handleConfirmDelete = React.useCallback(async () => {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true);
    try {
      const formData = new FormData();
      formData.set("estimateId", deleteTarget.id);
      const result = await runDeleteEstimateActionWithTimeout(deleteEstimateAction, formData);
      if (!result.ok) {
        toast({
          title: "Could not delete estimate",
          description: result.error ?? "Please try again.",
          variant: "error",
        });
        return;
      }
      setRows((prev) => prev.filter((row) => row.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast({ title: "Estimate deleted", variant: "success" });
      syncRouterNonBlocking(router);
    } catch (error) {
      toast({
        title: "Could not delete estimate",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error",
      });
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteBusy, deleteEstimateAction, deleteTarget, router, toast]);

  const handleCopyPrevious = React.useCallback(
    async (source: EstimateListItem) => {
      if (copyingEstimateId) return;
      setCopyingEstimateId(source.id);
      try {
        const result = await duplicateEstimateAsDraftAction(source.id);
        if (!result.ok || !result.estimateId) {
          toast({
            title: "Could not copy previous Estimate",
            description: result.error ?? "Please try again.",
            variant: "error",
          });
          return;
        }
        toast({
          title: "Draft Estimate created",
          description: result.estimateNumber
            ? `${result.estimateNumber} was copied without downstream history.`
            : "The copied Estimate is ready to edit.",
          variant: "success",
        });
        router.push(`/estimates/${result.estimateId}`);
      } catch (error) {
        toast({
          title: "Could not copy previous Estimate",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "error",
        });
      } finally {
        setCopyingEstimateId(null);
      }
    },
    [copyingEstimateId, router, toast]
  );

  return (
    <div
      data-testid="estimate-list-workspace"
      className={cn(
        "page-container page-shell-wide page-stack min-h-full py-6",
        mobileListPagePaddingClass,
        "max-md:!gap-3",
        PAGE_BG
      )}
    >
      <MobileListHeader
        title="Estimates"
        tone="page"
        fab={<MobileFabPlus href="/estimates/new" ariaLabel="New estimate" />}
      />

      <div className="hidden md:block">
        <PageHeader
          className="estimate-list-page-header"
          title="Estimates"
          description="Manage proposals, pricing, and estimate workflows."
          actions={
            <div className="flex items-center gap-2">
              <Button asChild size="sm" className={cn("min-h-10 px-3", PRIMARY_ACTION)}>
                <Link href="/estimates/new">
                  <Plus className="mr-2 h-4 w-4" />
                  New Estimate
                </Link>
              </Button>
            </div>
          }
        />
      </div>

      <EstimateSuccessBanner saved={saved} />
      {loadWarning && (
        <p
          role="status"
          className="text-hh-body rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l3-hover)] px-3 py-2 text-[var(--hh-text-secondary)]"
        >
          {loadWarning}
        </p>
      )}
      {errorMessage && (
        <p
          role="alert"
          className="text-hh-error rounded-hh-standard border border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] px-3 py-2 text-[var(--hh-danger)]"
        >
          {errorMessage}
        </p>
      )}

      {rows.length > 0 ? (
        <div
          data-testid="estimate-list-summary-rail"
          className="estimate-list-summary-rail hidden md:grid md:grid-cols-4"
        >
          <KpiTile
            className="estimate-list-kpi"
            label="Total Estimates"
            value={totalEstimates}
            meta="Active estimate records"
          />
          <KpiTile
            className="estimate-list-kpi"
            label="Draft"
            value={draftCount}
            meta="Still in preparation"
          />
          <KpiTile
            className="estimate-list-kpi"
            label="Sent"
            value={sentCount}
            tone="warning"
            valueClassName="!text-[var(--hh-warning)]"
            meta="Awaiting owner response"
          />
          <KpiTile
            className="estimate-list-kpi"
            label="Total Value"
            value={<NeoAmount>{formatEstimateCurrency(totalValue)}</NeoAmount>}
            meta="Current list value"
          />
        </div>
      ) : null}

      <section data-testid="estimate-list-records" className="estimate-list-records">
        {rows.length > 0 ? (
          <>
            <MobileSearchFiltersRow
              filterSheetOpen={filtersOpen}
              onOpenFilters={() => setFiltersOpen(true)}
              activeFilterCount={activeFilterCount}
              filtersTriggerClassName="estimate-list-filter-trigger"
              searchSlot={
                <Input
                  aria-label="Search estimates"
                  placeholder="Search estimates…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={FIELD}
                />
              }
            />
            <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
              <div className="space-y-2">
                <label
                  htmlFor="estimate-mobile-status-filter"
                  className="text-hh-label text-[var(--hh-text-secondary)]"
                >
                  Status
                </label>
                <select
                  id="estimate-mobile-status-filter"
                  className={cn(FIELD, "w-full appearance-none px-3")}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as EstimateStatus | "all")}
                >
                  <option value="all">All statuses</option>
                  <option value="Draft">Draft</option>
                  <option value="Sent">Sent</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Converted">Converted</option>
                </select>
              </div>
              <Button
                type="button"
                className={cn("w-full", PRIMARY_ACTION)}
                onClick={() => setFiltersOpen(false)}
              >
                Done
              </Button>
            </MobileFilterSheet>
            <NeoToolbar className="estimate-list-toolbar hidden gap-2 p-2 md:flex md:flex-row md:items-center md:justify-between">
              <div className="relative min-w-[260px] max-w-md flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--hh-text-tertiary)]"
                  aria-hidden="true"
                />
                <Input
                  aria-label="Search estimates"
                  placeholder="Search estimates…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={cn(FIELD, "pl-9")}
                />
              </div>
              <select
                aria-label="Filter estimates by status"
                className={cn(FIELD, "w-full appearance-none px-3 md:w-[180px]")}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as EstimateStatus | "all")}
              >
                <option value="all">All statuses</option>
                <option value="Draft">Draft</option>
                <option value="Sent">Sent</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
                <option value="Converted">Converted</option>
              </select>
            </NeoToolbar>
          </>
        ) : null}

        {rows.length === 0 ? (
          <>
            <MobileEmptyState
              icon={<FlaskConical className="h-8 w-8 opacity-80" aria-hidden />}
              message={
                loadWarning
                  ? "Could not load estimates."
                  : "No estimates yet. Create one to get started."
              }
              action={
                !loadWarning ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href="/estimates/new">New estimate</Link>
                  </Button>
                ) : undefined
              }
            />
            <div className="hidden md:block">
              <EmptyState
                title={loadWarning ? "Could not load estimates" : "No estimates yet"}
                description={
                  loadWarning
                    ? "Check your connection and database configuration, then refresh."
                    : "Create an estimate to get started."
                }
                icon={<FlaskConical className="h-5 w-5" />}
                action={
                  <Button asChild size="sm" className={cn("h-9", PRIMARY_ACTION)}>
                    <Link href="/estimates/new">New Estimate</Link>
                  </Button>
                }
              />
            </div>
          </>
        ) : filtered.length === 0 ? (
          <>
            <MobileEmptyState
              icon={<FlaskConical className="h-8 w-8 opacity-80" aria-hidden />}
              message="No estimates match your search."
            />
            <div className="hidden md:block">
              <EmptyState
                title="No estimates match your search"
                description="Try a different keyword or status filter."
              />
            </div>
          </>
        ) : (
          <>
            <EstimateMobileList
              list={filtered}
              onRequestDelete={setDeleteTarget}
              onCopyPrevious={(row) => void handleCopyPrevious(row)}
            />
            <div className="hidden lg:block">
              <NeoTable
                className="estimate-list-table-shell"
                tableClassName="estimate-list-table min-w-[720px] lg:min-w-0"
              >
                <thead>
                  <tr>
                    <th className={cn(tableRawThClass, "estimate-list-col-number")}>Estimate</th>
                    <th className={cn(tableRawThClass, "estimate-list-col-client")}>Client</th>
                    <th className={cn(tableRawThClass, "estimate-list-col-project")}>Project</th>
                    <th className={cn(tableRawThClass, "estimate-list-col-status")}>Status</th>
                    <th
                      className={cn(
                        tableRawThClass,
                        "estimate-list-col-total text-right tabular-nums"
                      )}
                    >
                      Total
                    </th>
                    <th className={cn(tableRawThClass, "estimate-list-col-updated")}>Updated</th>
                    <th className={cn(tableRawThClass, "estimate-list-col-actions text-right")}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <EstimateListRow
                      key={row.id}
                      row={row}
                      onRequestDelete={setDeleteTarget}
                      onCopyPrevious={(source) => void handleCopyPrevious(source)}
                    />
                  ))}
                </tbody>
              </NeoTable>
            </div>
          </>
        )}
      </section>
      <ConfirmDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleteTarget(null);
        }}
        title="Delete estimate?"
        description={
          deleteTarget
            ? `Permanently delete ${deleteTarget.number}? This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        loading={deleteBusy}
        dismissBeforeAsync={false}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
