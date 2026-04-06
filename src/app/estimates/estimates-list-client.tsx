"use client";

import * as React from "react";
import Link from "next/link";
import { FlaskConical, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { EstimateListRow, EstimateMobileList } from "./estimate-list-row";
import { EmptyState } from "@/components/empty-state";
import { EstimateSuccessBanner } from "./[id]/estimate-success-banner";
import type { EstimateListItem, EstimateStatus } from "@/lib/estimates-db";
import {
  MobileEmptyState,
  MobileFabPlus,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { cn } from "@/lib/utils";

type DeleteAction = (formData: FormData) => Promise<void>;

export function EstimatesListClient({
  list,
  loadWarning,
  saved,
  errorMessage,
  deleteEstimateAction,
  createTestEstimateAction,
}: {
  list: EstimateListItem[];
  loadWarning: string | null;
  saved?: string;
  errorMessage: string | null;
  deleteEstimateAction: DeleteAction;
  createTestEstimateAction: () => Promise<void>;
}) {
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<EstimateStatus | "all">("all");
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  const activeFilterCount = statusFilter !== "all" ? 1 : 0;

  const filtered = React.useMemo(() => {
    let rows = list;
    if (statusFilter !== "all") {
      rows = rows.filter((e) => e.status === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (e) =>
        e.number.toLowerCase().includes(q) ||
        e.client.toLowerCase().includes(q) ||
        e.project.toLowerCase().includes(q)
    );
  }, [list, search, statusFilter]);

  const totalEstimates = list.length;
  const draftCount = list.filter((e) => e.status === "Draft").length;
  const sentCount = list.filter((e) => e.status === "Sent").length;
  const totalValue = list.reduce((sum, e) => sum + (Number(e.total) || 0), 0);

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
              <form action={createTestEstimateAction}>
                <Button type="submit" variant="outline" size="sm" className="rounded-sm">
                  <FlaskConical className="mr-2 h-4 w-4" />
                  Create test estimate
                </Button>
              </form>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="btn-outline-ghost rounded-sm text-foreground hover:bg-[#F9FAFB] dark:hover:bg-muted/30"
              >
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

      {list.length > 0 ? (
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
            <p className="kpi-metric-value mt-0.5 tabular-nums">
              $
              {totalValue.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
        </div>
      ) : null}

      {list.length > 0 ? (
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

      {list.length === 0 ? (
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
          <EstimateMobileList list={filtered} deleteAction={deleteEstimateAction} />
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
                  <EstimateListRow key={row.id} row={row} deleteAction={deleteEstimateAction} />
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
