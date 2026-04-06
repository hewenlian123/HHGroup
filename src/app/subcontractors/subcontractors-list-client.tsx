"use client";

import * as React from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/base";
import { EmptyState } from "@/components/empty-state";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import {
  MobileEmptyState,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
} from "@/components/mobile/mobile-list-chrome";

export type SubcontractorSummaryRow = {
  id: string;
  name: string;
  totalContracts: number;
  approved: number;
  paid: number;
  outstanding: number;
  insurance_alert: boolean;
  insurance_expiration_date: string | null;
};

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function SubcontractorsListClient({
  rows,
  dataLoadWarning,
}: {
  rows: SubcontractorSummaryRow[];
  dataLoadWarning: string | null;
}) {
  const [searchInput, setSearchInput] = React.useState("");
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  const filtered = React.useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, searchInput]);

  const activeFilterCount = searchInput.trim() ? 1 : 0;

  return (
    <>
      {dataLoadWarning ? <p className="text-sm text-muted-foreground">{dataLoadWarning}</p> : null}

      <MobileListHeader
        title="Subcontractors"
        fab={<span className="inline-block h-10 w-10 shrink-0" aria-hidden />}
      />
      <MobileSearchFiltersRow
        filterSheetOpen={filtersOpen}
        onOpenFilters={() => setFiltersOpen(true)}
        activeFilterCount={activeFilterCount}
        searchSlot={
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search subcontractor…"
              className="h-10 pl-8 text-sm"
              aria-label="Search subcontractors"
            />
          </div>
        }
      />
      <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
        <Button asChild variant="outline" size="sm" className="h-9 w-full rounded-sm">
          <Link href="/settings/subcontractors">Manage in settings</Link>
        </Button>
        <Button type="button" className="w-full rounded-sm" onClick={() => setFiltersOpen(false)}>
          Done
        </Button>
      </MobileFilterSheet>

      {rows.length === 0 ? (
        <>
          <MobileEmptyState
            icon={<Users className="h-5 w-5" />}
            message="Add subcontractor profiles in Settings to start tracking contracts, bills, and payments."
            action={
              <Button asChild size="sm" className="h-9 rounded-sm">
                <Link href="/settings/subcontractors">Add subcontractor</Link>
              </Button>
            }
          />
          <div className="hidden md:block">
            <EmptyState
              title="No subcontractors yet"
              description="Add subcontractor profiles in Settings to start tracking contracts, bills, and payments."
              icon={<Users className="h-5 w-5" />}
              action={
                <Button asChild size="sm" className="h-8">
                  <Link href="/settings/subcontractors">Add subcontractor</Link>
                </Button>
              }
            />
          </div>
        </>
      ) : (
        <>
          <div className="md:hidden divide-y divide-gray-100 dark:divide-border/60">
            {filtered.length === 0 ? (
              <MobileEmptyState
                icon={<Users className="h-5 w-5" />}
                message="No subcontractors match your search."
              />
            ) : (
              filtered.map((r) => (
                <Link
                  key={r.id}
                  href={`/subcontractors/${r.id}`}
                  className="flex min-h-[48px] flex-col justify-center gap-1 py-2"
                >
                  <p className="font-medium text-foreground">{r.name}</p>
                  <div>
                    {r.insurance_expiration_date ? (
                      r.insurance_alert ? (
                        <StatusBadge
                          label={`Expires ${r.insurance_expiration_date}`}
                          variant="warning"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {r.insurance_expiration_date}
                        </span>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                  <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground">
                    <div>
                      <dt className="inline text-[10px] uppercase tracking-wide">Contracts</dt>{" "}
                      <dd className="inline text-foreground">${fmtUsd(r.totalContracts)}</dd>
                    </div>
                    <div>
                      <dt className="inline text-[10px] uppercase tracking-wide">Outstanding</dt>{" "}
                      <dd className="inline font-medium text-foreground">
                        ${fmtUsd(r.outstanding)}
                      </dd>
                    </div>
                  </dl>
                </Link>
              ))
            )}
          </div>
          <div className="airtable-table-wrap airtable-table-wrap--ruled hidden md:block">
            <div className="airtable-table-scroll overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm lg:min-w-0">
                <thead>
                  <tr>
                    <th className="h-8 px-3 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                      Subcontractor
                    </th>
                    <th className="h-8 px-3 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF]">
                      Insurance
                    </th>
                    <th className="h-8 px-3 text-right text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                      Total Contracts
                    </th>
                    <th className="h-8 px-3 text-right text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                      Approved
                    </th>
                    <th className="h-8 px-3 text-right text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                      Paid
                    </th>
                    <th className="h-8 px-3 text-right text-[10px] font-medium uppercase tracking-[0.06em] text-[#9CA3AF] tabular-nums">
                      Outstanding
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={listTableRowStaticClassName}>
                      <td className="py-1.5 px-3">
                        <Link
                          href={`/subcontractors/${r.id}`}
                          className="hover:text-foreground hover:underline"
                        >
                          {r.name}
                        </Link>
                      </td>
                      <td className="py-1.5 px-3">
                        {r.insurance_expiration_date ? (
                          r.insurance_alert ? (
                            <StatusBadge
                              label={`Expires ${r.insurance_expiration_date}`}
                              variant="warning"
                            />
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              {r.insurance_expiration_date}
                            </span>
                          )
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-right tabular-nums">
                        ${fmtUsd(r.totalContracts)}
                      </td>
                      <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(r.approved)}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">${fmtUsd(r.paid)}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">
                        ${fmtUsd(r.outstanding)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
