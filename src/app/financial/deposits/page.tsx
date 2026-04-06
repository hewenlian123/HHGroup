"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDeposits, type DepositWithMeta } from "@/lib/data";
import { EmptyState } from "@/components/empty-state";
import { Search } from "lucide-react";
import {
  MobileEmptyState,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DepositsPage() {
  return (
    <React.Suspense fallback={<div className="page-container py-6" />}>
      <DepositsPageInner />
    </React.Suspense>
  );
}

function DepositsPageInner() {
  const [deposits, setDeposits] = React.useState<DepositWithMeta[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [projectFilter, setProjectFilter] = React.useState("");

  const load = React.useCallback(async () => {
    const list = await getDeposits();
    setDeposits(list);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  const projectOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const d of deposits) {
      const n = (d.project_name ?? "").trim();
      if (n) set.add(n);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [deposits]);

  const filteredDeposits = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return deposits.filter((row) => {
      if (projectFilter && (row.project_name ?? "").trim() !== projectFilter) return false;
      if (!q) return true;
      const hay = [
        row.date,
        row.description,
        row.project_name,
        row.invoice_no,
        row.payment_method,
        row.account,
        String(row.amount),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [deposits, searchQuery, projectFilter]);

  const activeDrawerFilterCount = projectFilter ? 1 : 0;

  return (
    <div
      className={cn("page-container page-stack py-6", mobileListPagePaddingClass, "max-md:!gap-3")}
    >
      <div className="hidden md:block">
        <PageHeader
          title="Deposits"
          description="Deposit records created when payments are received. Used for Cash In on the dashboard."
        />
      </div>
      <MobileListHeader
        title="Deposits"
        fab={<span className="inline-block h-10 w-10 shrink-0" aria-hidden />}
      />
      <MobileSearchFiltersRow
        filterSheetOpen={filtersOpen}
        onOpenFilters={() => setFiltersOpen(true)}
        activeFilterCount={activeDrawerFilterCount}
        searchSlot={
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search deposits…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 pl-8 text-sm"
              aria-label="Search deposits"
            />
          </div>
        }
      />
      <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Project</p>
          <Select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="w-full"
          >
            <option value="">All projects</option>
            {projectOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </div>
        <Button type="button" className="w-full rounded-sm" onClick={() => setFiltersOpen(false)}>
          Done
        </Button>
      </MobileFilterSheet>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : deposits.length === 0 ? (
        <>
          <MobileEmptyState
            icon={<Search className="h-8 w-8 opacity-80" aria-hidden />}
            message="No deposits yet. Deposits are created when you receive a payment."
          />
          <div className="hidden md:block">
            <EmptyState
              title="No deposits yet"
              description="Deposits are created automatically when you receive a payment."
              icon={null}
            />
          </div>
        </>
      ) : (
        <section>
          {filteredDeposits.length === 0 ? (
            <MobileEmptyState
              icon={<Search className="h-8 w-8 opacity-80" aria-hidden />}
              message="No deposits match your filters."
            />
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-border/60 md:hidden">
              {filteredDeposits.map((row) => (
                <div key={row.id} className="flex min-h-[56px] flex-col gap-0.5 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm font-medium tabular-nums text-foreground">
                        {row.date ?? "—"}
                      </p>
                      <p className="truncate text-sm text-foreground">{row.description ?? "—"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.project_name ?? "—"}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-hh-profit-positive dark:text-hh-profit-positive">
                      {money(row.amount)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Inv {row.invoice_no ?? "—"} ·{" "}
                    {(row.payment_method ?? "—") + " · " + (row.account ?? "—")}
                  </p>
                </div>
              ))}
            </div>
          )}
          <div className="hidden md:block">
            <Table className="min-w-[640px] lg:min-w-0">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                    Deposit Date
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                    Customer
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                    Project
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                    Invoice #
                  </TableHead>
                  <TableHead className="text-right font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                    Amount
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                    Payment Method
                  </TableHead>
                  <TableHead className="text-xs font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                    Account
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deposits.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium font-mono tabular-nums text-foreground">
                      {row.date ?? "—"}
                    </TableCell>
                    <TableCell className="text-foreground">{row.description ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.project_name ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground tabular-nums">
                      {row.invoice_no ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums font-medium text-hh-profit-positive dark:text-hh-profit-positive">
                      {money(row.amount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.payment_method ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.account ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}
