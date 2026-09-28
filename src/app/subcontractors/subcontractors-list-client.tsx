"use client";

import { contactMatches } from "@/lib/navigation/contacts-workspace";
import * as React from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  NeoAmount,
  NeoInput,
  NeoSelect,
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
  phone: string | null;
  email: string | null;
  active: boolean;
  contractAmount: number;
  scheduledAmount: number;
  billedToDate: number;
  paidToDate: number;
  apOutstanding: number;
  remainingContract: number;
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
  const [status, setStatus] = React.useState("all");
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  const filtered = React.useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    return rows.filter(
      (r) =>
        contactMatches(q, [r.name, r.phone, r.email]) &&
        (status === "all" || r.active === (status === "active"))
    );
  }, [rows, searchInput, status]);

  const activeFilterCount = status !== "all" ? 1 : 0;
  const statusFilter = (
    <NeoSelect
      aria-label="Subcontractor status"
      className="min-h-11"
      value={status}
      onChange={(e) => setStatus(e.target.value)}
    >
      <option value="all">All statuses</option>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
    </NeoSelect>
  );
  if (dataLoadWarning)
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-semibold">Subcontractors unavailable</h1>
        <p role="status">{dataLoadWarning}</p>
        <Button variant="outline" className="min-h-11" onClick={() => window.location.reload()}>
          Retry subcontractors
        </Button>
      </div>
    );

  return (
    <>
      {dataLoadWarning ? (
        <p
          className="rounded-hh-standard border border-[var(--hh-information-border)] bg-[var(--hh-information-soft-fill)] px-3 py-2 text-hh-body text-[var(--hh-information)]"
          role="status"
        >
          {dataLoadWarning}
        </p>
      ) : null}

      <MobileListHeader
        title="Subcontractors"
        fab={
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/settings/subcontractors">Manage</Link>
          </Button>
        }
      />
      <MobileSearchFiltersRow
        filterSheetOpen={filtersOpen}
        onOpenFilters={() => setFiltersOpen(true)}
        activeFilterCount={activeFilterCount}
        searchSlot={
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--hh-text-tertiary)]" />
            <NeoInput
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, email or phone…"
              className="min-h-11 pl-8 text-sm"
              aria-label="Search subcontractors"
            />
          </div>
        }
      />
      <MobileFilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters">
        {statusFilter}
        <Button asChild variant="outline" size="sm" className="min-h-11 w-full rounded-sm">
          <Link href="/settings/subcontractors">Manage in settings</Link>
        </Button>
        <Button type="button" className="w-full rounded-sm" onClick={() => setFiltersOpen(false)}>
          Done
        </Button>
      </MobileFilterSheet>

      <NeoToolbar className="hidden justify-between md:flex">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--hh-text-tertiary)]" />
          <NeoInput
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, email or phone…"
            className="min-h-11 pl-8 text-sm"
            aria-label="Search subcontractors"
          />
        </div>
        {statusFilter}
        <Button asChild variant="outline" size="sm" className="min-h-11 rounded-sm">
          <Link href="/settings/subcontractors">Manage in settings</Link>
        </Button>
      </NeoToolbar>

      {rows.length === 0 ? (
        <>
          <MobileEmptyState
            icon={<Users className="h-5 w-5" />}
            message="Add subcontractor profiles in Settings to start tracking contracts, bills, and payments."
            action={
              <Button asChild size="sm" className="min-h-11 rounded-sm">
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
                <Button asChild size="sm" className="min-h-11">
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
                    <p className="font-medium text-[var(--hh-text-primary)]">{r.name}</p>
                    <p className="break-all text-sm text-[var(--hh-text-secondary)]">
                      {r.phone || r.email || "No contact information"} ·{" "}
                      {r.active ? "Active" : "Inactive"}
                    </p>
                    <div>
                      {r.insurance_expiration_date ? (
                        r.insurance_alert ? (
                          <NeoStatus
                            label={`Expires ${r.insurance_expiration_date}`}
                            variant="warning"
                          />
                        ) : (
                          <span className="text-xs text-[var(--hh-text-secondary)]">
                            {r.insurance_expiration_date}
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-[var(--hh-text-secondary)]">—</span>
                      )}
                    </div>
                    <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-[var(--hh-text-secondary)]">
                      <div>
                        <dt className="inline text-hh-table-header uppercase">Contracts</dt>{" "}
                        <dd className="inline">
                          <NeoAmount>${fmtUsd(r.contractAmount)}</NeoAmount>
                        </dd>
                      </div>
                      <div>
                        <dt className="inline text-hh-table-header uppercase">AP Outstanding</dt>{" "}
                        <dd className="inline">
                          <NeoAmount tone={r.apOutstanding > 0 ? "expense" : "neutral"}>
                            ${fmtUsd(r.apOutstanding)}
                          </NeoAmount>
                        </dd>
                      </div>
                    </dl>
                  </Link>
                </NeoMobileCard>
              ))}
            </div>
          )}
          {filtered.length === 0 && (
            <div className="hidden md:block">
              <EmptyState
                title="No subcontractors match your filters"
                description="Try another search or status."
              />
            </div>
          )}
          <NeoTable className="hidden md:block" tableClassName="min-w-[1080px] lg:min-w-0">
            <thead>
              <tr>
                <th className={tableHeadClass}>Subcontractor</th>
                <th className={tableHeadClass}>Insurance</th>
                <th className={numericHeadClass}>Contract Amount</th>
                <th className={numericHeadClass}>Scheduled</th>
                <th className={numericHeadClass}>Billed To Date</th>
                <th className={numericHeadClass}>Paid To Date</th>
                <th className={numericHeadClass}>AP Outstanding</th>
                <th className={numericHeadClass}>Remaining Contract</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className={listTableRowStaticClassName}>
                  <td className="py-2 px-3">
                    <Link
                      href={`/subcontractors/${r.id}`}
                      className="inline-flex min-h-11 items-center font-medium text-[var(--hh-text-primary)] underline-offset-2 hover:underline"
                    >
                      {r.name}
                    </Link>
                    <p className="text-sm text-[var(--hh-text-secondary)]">
                      {r.phone || r.email || "—"} · {r.active ? "Active" : "Inactive"}
                    </p>
                  </td>
                  <td className="py-2 px-3">
                    {r.insurance_expiration_date ? (
                      r.insurance_alert ? (
                        <NeoStatus
                          label={`Expires ${r.insurance_expiration_date}`}
                          variant="warning"
                        />
                      ) : (
                        <span className="text-xs text-[var(--hh-text-secondary)]">
                          {r.insurance_expiration_date}
                        </span>
                      )
                    ) : (
                      <span className="text-xs text-[var(--hh-text-secondary)]">—</span>
                    )}
                  </td>
                  <td className={amountCellClass}>
                    <NeoAmount>${fmtUsd(r.contractAmount)}</NeoAmount>
                  </td>
                  <td className={amountCellClass}>
                    <NeoAmount>${fmtUsd(r.scheduledAmount)}</NeoAmount>
                  </td>
                  <td className={amountCellClass}>
                    <NeoAmount>${fmtUsd(r.billedToDate)}</NeoAmount>
                  </td>
                  <td className={amountCellClass}>
                    <NeoAmount tone="income">${fmtUsd(r.paidToDate)}</NeoAmount>
                  </td>
                  <td className={amountCellClass}>
                    <NeoAmount tone={r.apOutstanding > 0 ? "expense" : "neutral"}>
                      ${fmtUsd(r.apOutstanding)}
                    </NeoAmount>
                  </td>
                  <td className={amountCellClass}>
                    <NeoAmount tone={r.remainingContract < 0 ? "expense" : "neutral"}>
                      ${fmtUsd(r.remainingContract)}
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
