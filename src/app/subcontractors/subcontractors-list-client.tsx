"use client";

import * as React from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  NeoAmount,
  NeoInput,
  NeoMobileCard,
  NeoStatus,
  NeoTable,
  NeoToolbar,
} from "@/components/base";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import {
  MobileEmptyState,
  MobileFilterSheet,
  MobileListHeader,
  MobileSearchFiltersRow,
} from "@/components/mobile/mobile-list-chrome";
import { TYPO } from "@/lib/typography";
import { cn } from "@/lib/utils";

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

const tableHeadClass = cn("h-8 px-3 text-left", TYPO.tableHeader);
const numericHeadClass = cn(tableHeadClass, "text-right tabular-nums");
const amountCellClass = cn("py-1.5 px-3 text-right", TYPO.amount);

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
      {dataLoadWarning ? (
        <p
          className="rounded-lg border border-[rgb(184_137_45_/_0.24)] bg-[rgb(184_137_45_/_0.10)] px-3 py-2 text-sm text-[var(--neo-text-secondary)]"
          role="status"
        >
          {dataLoadWarning}
        </p>
      ) : null}

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
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--neo-text-tertiary)]" />
            <NeoInput
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

      <NeoToolbar className="hidden justify-between md:flex">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--neo-text-tertiary)]" />
          <NeoInput
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search subcontractor…"
            className="h-9 pl-8 text-sm"
            aria-label="Search subcontractors"
          />
        </div>
        <Button asChild variant="outline" size="sm" className="h-9 rounded-sm">
          <Link href="/settings/subcontractors">Manage in settings</Link>
        </Button>
      </NeoToolbar>

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
          {filtered.length === 0 ? (
            <MobileEmptyState
              icon={<Users className="h-5 w-5" />}
              message="No subcontractors match your search."
            />
          ) : (
            <div className="space-y-2 md:hidden">
              {filtered.map((r) => (
                <NeoMobileCard asChild key={r.id}>
                  <Link
                    href={`/subcontractors/${r.id}`}
                    className="flex min-h-[72px] flex-col justify-center gap-1 p-3"
                  >
                    <p className="font-medium text-[var(--neo-text-primary)]">{r.name}</p>
                    <div>
                      {r.insurance_expiration_date ? (
                        r.insurance_alert ? (
                          <NeoStatus
                            label={`Expires ${r.insurance_expiration_date}`}
                            variant="warning"
                          />
                        ) : (
                          <span className="text-xs text-[var(--neo-text-secondary)]">
                            {r.insurance_expiration_date}
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-[var(--neo-text-secondary)]">—</span>
                      )}
                    </div>
                    <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-[var(--neo-text-secondary)]">
                      <div>
                        <dt className="inline text-[10px] uppercase tracking-normal">Contracts</dt>{" "}
                        <dd className="inline">
                          <NeoAmount>${fmtUsd(r.totalContracts)}</NeoAmount>
                        </dd>
                      </div>
                      <div>
                        <dt className="inline text-[10px] uppercase tracking-normal">
                          Outstanding
                        </dt>{" "}
                        <dd className="inline">
                          <NeoAmount tone={r.outstanding > 0 ? "expense" : "neutral"}>
                            ${fmtUsd(r.outstanding)}
                          </NeoAmount>
                        </dd>
                      </div>
                    </dl>
                  </Link>
                </NeoMobileCard>
              ))}
            </div>
          )}
          <NeoTable className="hidden md:block" tableClassName="min-w-[760px] lg:min-w-0">
            <thead>
              <tr>
                <th className={tableHeadClass}>Subcontractor</th>
                <th className={tableHeadClass}>Insurance</th>
                <th className={numericHeadClass}>Total Contracts</th>
                <th className={numericHeadClass}>Approved</th>
                <th className={numericHeadClass}>Paid</th>
                <th className={numericHeadClass}>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className={listTableRowStaticClassName}>
                  <td className="py-2 px-3">
                    <Link
                      href={`/subcontractors/${r.id}`}
                      className="font-medium text-[var(--neo-text-primary)] underline-offset-2 hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="py-2 px-3">
                    {r.insurance_expiration_date ? (
                      r.insurance_alert ? (
                        <NeoStatus
                          label={`Expires ${r.insurance_expiration_date}`}
                          variant="warning"
                        />
                      ) : (
                        <span className="text-xs text-[var(--neo-text-secondary)]">
                          {r.insurance_expiration_date}
                        </span>
                      )
                    ) : (
                      <span className="text-xs text-[var(--neo-text-secondary)]">—</span>
                    )}
                  </td>
                  <td className={amountCellClass}>
                    <NeoAmount>${fmtUsd(r.totalContracts)}</NeoAmount>
                  </td>
                  <td className={amountCellClass}>
                    <NeoAmount>${fmtUsd(r.approved)}</NeoAmount>
                  </td>
                  <td className={amountCellClass}>
                    <NeoAmount>${fmtUsd(r.paid)}</NeoAmount>
                  </td>
                  <td className={amountCellClass}>
                    <NeoAmount tone={r.outstanding > 0 ? "expense" : "neutral"}>
                      ${fmtUsd(r.outstanding)}
                    </NeoAmount>
                  </td>
                </tr>
              ))}
            </tbody>
          </NeoTable>
        </>
      )}
    </>
  );
}
