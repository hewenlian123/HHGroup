"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FlaskConical, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { EstimateListRow, EstimateMobileList } from "./estimate-list-row";
import { EmptyState } from "@/components/empty-state";
import { EstimateSuccessBanner } from "./[id]/estimate-success-banner";
import type { EstimateListItem, EstimateStatus } from "@/lib/estimates-db";
import { ConfirmDialog } from "@/components/base";
import { useToast } from "@/components/toast/toast-provider";
import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import { formatCurrency } from "@/lib/formatters";
import {
  MobileEmptyState,
  MobileFabPlus,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { cn } from "@/lib/utils";

type DeleteAction = (formData: FormData) => Promise<{ ok: boolean; error?: string }>;

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
  deleteEstimateAction: DeleteAction;
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
      const result = await deleteEstimateAction(formData);
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
      className={cn("page-container page-stack py-6", mobileListPagePaddingClass, "max-md:!gap-3")}
    >
      <MobileListHeader
        title="Estimates"
        fab={<MobileFabPlus href="/estimates/new" ariaLabel="New estimate" />}
      />

      <div className="hidden md:block">
        <PageHeader
          title="Estimates"
          description="Manage cost-code estimates."
          actions={
            <div className="flex items-center gap-2">
              <Button asChild size="sm" className="rounded-sm">
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
        <p role="status" className="border-b border-border/60 pb-3 text-sm text-muted-foreground">
          {loadWarning}
        </p>
      )}
      {errorMessage && (
        <p
          role="alert"
          className="border-b border-amber-400/50 pb-3 text-sm font-medium text-amber-800 dark:border-amber-600/50 dark:text-amber-200"
        >
          {errorMessage}
        </p>
      )}

      {rows.length > 0 ? (
        <div className="hidden grid-cols-1 gap-[10px] sm:grid-cols-2 lg:grid-cols-4 md:grid">
          <div className="rounded-[10px] border-[0.5px] border-solid border-gray-100 bg-white px-4 py-[14px] dark:border-border">
            <p className="kpi-metric-label">Total Estimates</p>
            <p className="kpi-metric-value mt-0.5 tabular-nums">{totalEstimates}</p>
          </div>
          <div className="rounded-[10px] border-[0.5px] border-solid border-gray-100 bg-white px-4 py-[14px] dark:border-border">
            <p className="kpi-metric-label">Draft</p>
            <p className="kpi-metric-value mt-0.5 tabular-nums">{draftCount}</p>
          </div>
          <div className="rounded-[10px] border-[0.5px] border-solid border-gray-100 bg-white px-4 py-[14px] dark:border-border">
            <p className="kpi-metric-label">Sent</p>
            <p className="kpi-metric-value mt-0.5 tabular-nums">{sentCount}</p>
          </div>
          <div className="rounded-[10px] border-[0.5px] border-solid border-gray-100 bg-white px-4 py-[14px] dark:border-border">
            <p className="kpi-metric-label">Total Value</p>
            <p className="kpi-metric-value mt-0.5 tabular-nums">{formatCurrency(totalValue)}</p>
          </div>
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
                className="h-10 text-sm"
              />
            }
          />
          <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Status</p>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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
              className="w-full rounded-sm"
              onClick={() => setFiltersOpen(false)}
            >
              Done
            </Button>
          </MobileFilterSheet>
          <div className="hidden items-end gap-3 md:flex md:flex-wrap">
            <Input
              placeholder="Search estimates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full max-w-sm text-sm"
            />
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
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
        <p className="py-8 text-center text-sm text-muted-foreground">
          No estimates match your search.
        </p>
      ) : (
        <>
          <EstimateMobileList list={filtered} onRequestDelete={setDeleteTarget} />
          <div className="hidden md:block">
            <Table className="min-w-[640px] lg:min-w-0">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Estimate #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right tabular-nums">Total</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-0">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <EstimateListRow key={row.id} row={row} onRequestDelete={setDeleteTarget} />
                ))}
              </TableBody>
            </Table>
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
