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
import {
  MobileEmptyState,
  MobileFabPlus,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { cn } from "@/lib/utils";

const PAGE_BG = "dark neo-page-on-graphite text-[var(--neo-canvas-text-secondary)]";
const FIELD =
  "h-10 rounded-md border border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-[14px] text-[var(--neo-text-primary)] shadow-none placeholder:text-[var(--neo-text-tertiary)] focus-visible:border-[var(--neo-gold)] focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)]";
const PRIMARY_ACTION =
  "rounded-md border border-[rgb(198_165_106_/_0.28)] bg-[var(--neo-gold)] text-zinc-950 shadow-sm hover:bg-[var(--neo-gold-soft)] focus-visible:ring-2 focus-visible:ring-[var(--neo-gold-ring)]";

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

  return (
    <div
      className={cn(
        "page-container page-shell-wide page-stack py-6",
        mobileListPagePaddingClass,
        "max-md:!gap-3",
        PAGE_BG
      )}
    >
      <MobileListHeader
        title="Estimates"
        fab={<MobileFabPlus href="/estimates/new" ariaLabel="New estimate" />}
      />

      <div className="hidden md:block">
        <PageHeader
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
          className="rounded-lg border border-[var(--neo-border)] bg-[var(--neo-surface-muted)] px-3 py-2 text-sm text-[var(--neo-text-secondary)]"
        >
          {loadWarning}
        </p>
      )}
      {errorMessage && (
        <p
          role="alert"
          className="rounded-lg border border-[rgb(184_137_45_/_0.28)] bg-[rgb(184_137_45_/_0.10)] px-3 py-2 text-sm font-medium text-[var(--neo-gold-soft)]"
        >
          {errorMessage}
        </p>
      )}

      {rows.length > 0 ? (
        <div className="hidden grid-cols-1 gap-3 md:grid sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile label="Total Estimates" value={totalEstimates} meta="Active estimate records" />
          <KpiTile label="Draft" value={draftCount} meta="Still in preparation" />
          <KpiTile label="Sent" value={sentCount} tone="warning" meta="Awaiting owner response" />
          <KpiTile
            label="Total Value"
            value={<NeoAmount>{formatEstimateCurrency(totalValue)}</NeoAmount>}
            meta="Current list value"
          />
        </div>
      ) : null}

      {rows.length > 0 ? (
        <>
          <MobileSearchFiltersRow
            filterSheetOpen={filtersOpen}
            onOpenFilters={() => setFiltersOpen(true)}
            activeFilterCount={activeFilterCount}
            searchSlot={
              <Input
                placeholder="Search estimates…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={FIELD}
              />
            }
          />
          <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
            <div className="space-y-2">
              <p className="text-xs font-medium text-[var(--neo-text-secondary)]">Status</p>
              <select
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
          <NeoToolbar className="hidden gap-2 p-2 md:flex md:flex-row md:items-center md:justify-between">
            <div className="relative min-w-[260px] max-w-md flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--neo-text-tertiary)]"
                aria-hidden="true"
              />
              <Input
                placeholder="Search estimates…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(FIELD, "pl-9")}
              />
            </div>
            <select
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
                <Button asChild size="sm" className="h-8">
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
          <EstimateMobileList list={filtered} onRequestDelete={setDeleteTarget} />
          <div className="hidden md:block">
            <NeoTable tableClassName="min-w-[720px] lg:min-w-0">
              <thead>
                <tr>
                  <th className={tableRawThClass}>Estimate #</th>
                  <th className={tableRawThClass}>Client</th>
                  <th className={tableRawThClass}>Project</th>
                  <th className={tableRawThClass}>Status</th>
                  <th className={cn(tableRawThClass, "text-right tabular-nums")}>Total</th>
                  <th className={tableRawThClass}>Updated</th>
                  <th className={cn(tableRawThClass, "w-10 text-right")}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <EstimateListRow key={row.id} row={row} onRequestDelete={setDeleteTarget} />
                ))}
              </tbody>
            </NeoTable>
          </div>
        </>
      )}
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
