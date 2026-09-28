"use client";

import { useFinanceQueryState } from "@/hooks/use-finance-query-state";
import { financePathWithReturn, financeReturnPath } from "@/lib/finance-navigation";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  LoadingState,
  NeoInput,
  NeoSelect,
  NeoStatus,
  NeoPanel,
  PageHeader,
  PageLayout,
} from "@/components/base";
import { contactMatches } from "@/lib/navigation/contacts-workspace";
import { ContactChannels, ContactSections } from "./contact-sections";

type ContactEntry = {
  id: string;
  name: string;
  company?: string | null;
  contact?: string | null;
  phone?: string | null;
  email?: string | null;
  status: string;
  createdAt?: string | null;
  href: string;
  address?: string | null;
  notes?: string | null;
};
export type ContactGroup = {
  role: "Customer" | "Subcontractor" | "Vendor";
  entries: ContactEntry[] | null;
};
type VendorRow = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  created_at: string | null;
};

function useVendors() {
  const [entries, setEntries] = useState<ContactEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/vendors?includeDisabled=1", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !Array.isArray(body.vendors)) throw new Error("Vendors unavailable");
      setEntries(
        body.vendors.map((row: VendorRow) => ({
          id: row.id,
          name: row.name,
          contact: row.contact_name,
          phone: row.phone,
          email: row.email,
          address: row.address,
          notes: row.notes,
          status: row.status,
          createdAt: row.created_at,
          href: `/vendors/${row.id}`,
        }))
      );
    } catch {
      setEntries(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useOnAppSync(refresh, [refresh]);
  return { entries, loading, refresh };
}

export function ContactsDirectory({
  groups = [],
  vendorOnly = false,
}: {
  groups?: ContactGroup[];
  vendorOnly?: boolean;
}) {
  const vendors = useVendors();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const context = `${pathname}?${searchParams.toString()}`;
  const [query, setQuery] = useFinanceQueryState("q", "");
  const [role, setRole] = useFinanceQueryState("role", "all");
  const [status, setStatus] = useFinanceQueryState("status", "all");
  const all: ContactGroup[] = [...groups, { role: "Vendor", entries: vendors.entries }];
  const entries = all.flatMap((group) =>
    (group.entries ?? []).map((entry) => ({ ...entry, role: group.role }))
  );
  const filtered = entries.filter(
    (entry) =>
      (role === "all" || entry.role === role) &&
      (status === "all" || entry.status === status) &&
      contactMatches(query, [entry.name, entry.company, entry.contact, entry.email, entry.phone])
  );
  const unavailable = all.filter(
    (group) => group.entries === null && !(group.role === "Vendor" && vendors.loading)
  );
  const recent = [...entries]
    .filter((e) => e.createdAt)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, 5);
  const directory = (
    <div
      className="divide-y divide-[var(--hh-border-subtle)] border-y border-[var(--hh-border-subtle)]"
      data-contact-list
      aria-busy={vendors.loading ? "true" : undefined}
    >
      {filtered.map((entry) => (
        <article
          key={`${entry.role}:${entry.id}`}
          className="grid min-w-0 gap-2 py-3 md:grid-cols-2"
        >
          <div className="min-w-0">
            <Link
              className="inline-flex min-h-11 items-center break-words font-medium underline-offset-2 hover:underline"
              href={
                entry.href.startsWith("/vendors/")
                  ? financePathWithReturn(entry.href, context)
                  : entry.href
              }
              prefetch={false}
            >
              {entry.name || "Unnamed contact"}
            </Link>
            {(entry.company || entry.contact) && (
              <p className="break-words text-sm text-[var(--hh-text-secondary)]">
                {[entry.company, entry.contact].filter(Boolean).join(" · ")}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>{entry.role}</span>
              <NeoStatus
                label={entry.status}
                variant={entry.status === "active" ? "success" : "muted"}
              />
            </div>
          </div>
          <ContactChannels phone={entry.phone} email={entry.email} />
        </article>
      ))}
    </div>
  );
  return (
    <PageLayout
      divider={false}
      header={
        <PageHeader
          title={vendorOnly ? "Vendors" : "Contacts"}
          description={
            vendorOnly
              ? "Vendor profiles and purchasing entry points."
              : "Business contacts, recent additions, and the next place to continue work."
          }
          actions={
            vendorOnly ? (
              <Button asChild variant="outline" className="min-h-11">
                <Link href="/financial/vendors">Manage vendors</Link>
              </Button>
            ) : undefined
          }
        />
      }
    >
      {!vendorOnly && (
        <dl className="grid grid-cols-3 gap-3">
          {all.map((group) => (
            <div key={group.role} className="border-b border-[var(--hh-border-subtle)] pb-3">
              <dt className="text-sm text-[var(--hh-text-secondary)]">
                {group.role === "Customer"
                  ? "Customers"
                  : group.role === "Vendor"
                    ? "Vendors"
                    : "Subcontractors"}
              </dt>
              <dd className="text-lg font-medium tabular-nums">
                {group.role === "Vendor" && vendors.loading
                  ? "Loading…"
                  : group.entries === null
                    ? "Unavailable"
                    : group.entries.length}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <NeoInput
          className="min-h-11 flex-1"
          aria-label={vendorOnly ? "Search vendors" : "Search contacts"}
          placeholder="Search name, company, email or phone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!vendorOnly && (
          <NeoSelect
            className="min-h-11 sm:w-auto"
            aria-label="Contact type"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="all">All types</option>
            {all.map((group) => (
              <option key={group.role}>{group.role}</option>
            ))}
          </NeoSelect>
        )}
        <NeoSelect
          className="min-h-11 sm:w-auto"
          aria-label="Contact status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </NeoSelect>
      </div>
      {unavailable.length > 0 && (
        <div role="status" className="space-y-2 text-sm">
          <p>
            {unavailable.map((g) => g.role).join(", ")} contacts unavailable. Check your connection
            and access, then retry.
          </p>
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => {
              if (unavailable.some((g) => g.role !== "Vendor")) window.location.reload();
              else void vendors.refresh();
            }}
          >
            Retry contacts
          </Button>
        </div>
      )}
      {vendorOnly && vendors.loading && <LoadingState text="Loading vendors…" />}
      {filtered.length > 0 ? (
        directory
      ) : !vendors.loading && unavailable.length === 0 ? (
        <EmptyState
          title={entries.length ? "No contacts match your filters" : "No contacts yet"}
          description={
            entries.length
              ? "Try another name or reset the type and status filters."
              : "Use the contact directories to add your first profile."
          }
        />
      ) : (
        <p className="text-sm text-[var(--hh-text-secondary)]">
          No matching contacts in the available records.
        </p>
      )}
      {!vendorOnly && (
        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <section aria-label="Recent contact activity" className="min-w-0 space-y-2">
            <h2 className="text-base font-semibold">Recently added</h2>
            {recent.map((entry) => (
              <Link
                key={`${entry.role}:${entry.id}`}
                href={
                  entry.href.startsWith("/vendors/")
                    ? financePathWithReturn(entry.href, context)
                    : entry.href
                }
                prefetch={false}
                className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-[var(--hh-border-subtle)] py-2 text-sm"
              >
                <span className="break-words">
                  {entry.name} · {entry.role}
                </span>
                <time>{entry.createdAt?.slice(0, 10)}</time>
              </Link>
            ))}
            {recent.length === 0 && (
              <p className="text-sm text-[var(--hh-text-secondary)]">
                {unavailable.length || vendors.loading
                  ? "Recent additions unavailable for some directories."
                  : "No dated contact records."}
              </p>
            )}
          </section>
          <section className="space-y-2" aria-label="Needs attention">
            <h2 className="text-base font-semibold">Needs attention</h2>
            {entries
              .filter((e) => !e.phone && !e.email)
              .slice(0, 5)
              .map((entry) => (
                <Link
                  key={`${entry.role}:${entry.id}`}
                  href={
                    entry.href.startsWith("/vendors/")
                      ? financePathWithReturn(entry.href, context)
                      : entry.href
                  }
                  prefetch={false}
                  className="flex min-h-11 items-center gap-2 text-sm underline"
                >
                  {entry.name} · Add contact information
                </Link>
              ))}
            <p className="text-sm text-[var(--hh-text-secondary)]">
              Review project work and balances in their workspaces.
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                ["Customer AR", "/financial/ar"],
                ["Vendor AP", "/financial/payables"],
                ["Subcontractor AP", "/subcontractors"],
                ["Active projects", "/projects?status=active"],
              ].map(([label, href]) => (
                <Button key={label} asChild variant="outline" className="min-h-11">
                  <Link href={href} prefetch={false}>
                    {label}
                  </Link>
                </Button>
              ))}
            </div>
          </section>
        </div>
      )}
      {vendorOnly && (
        <p className="text-sm text-[var(--hh-text-secondary)]">
          Open a vendor profile for contact details and purchasing links. Vendor balances are
          reviewed in Payables.
        </p>
      )}
    </PageLayout>
  );
}

export function VendorDetail() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const context = `/vendors/${id}?${searchParams.toString()}`;
  const returnHref = financeReturnPath(searchParams.get("returnTo"), "/vendors");
  const vendors = useVendors();
  const vendor = vendors.entries?.find((entry) => entry.id === id);
  if (vendors.loading)
    return (
      <PageLayout header={null} divider={false}>
        <LoadingState text="Loading vendor…" />
      </PageLayout>
    );
  if (!vendor)
    return (
      <PageLayout
        header={
          <PageHeader
            title={vendors.entries === null ? "Vendor unavailable" : "Vendor not found"}
          />
        }
        divider={false}
      >
        {vendors.entries === null && (
          <Button className="min-h-11" onClick={() => void vendors.refresh()}>
            Retry vendor
          </Button>
        )}
        <Button asChild variant="outline" className="min-h-11">
          <Link href={returnHref}>Back to Vendors</Link>
        </Button>
      </PageLayout>
    );
  const workflow = (label: string, href: string, description: string) => (
    <NeoPanel title={label} bodyClassName="space-y-3 p-4">
      <p className="text-sm text-[var(--hh-text-secondary)]">{description}</p>
      <Button asChild variant="outline" className="min-h-11">
        <Link href={financePathWithReturn(href, context)} prefetch={false}>
          {label}
        </Link>
      </Button>
    </NeoPanel>
  );
  return (
    <PageLayout
      divider={false}
      header={
        <PageHeader
          title={vendor.name}
          description="Vendor profile"
          actions={
            <Button asChild variant="outline" className="min-h-11">
              <Link href={returnHref}>Back to Vendors</Link>
            </Button>
          }
        />
      }
    >
      <ContactChannels phone={vendor.phone} email={vendor.email} />
      <ContactSections
        sections={[
          {
            label: "Overview",
            content: (
              <NeoPanel title="Profile" bodyClassName="space-y-3 p-4">
                <NeoStatus
                  label={vendor.status}
                  variant={vendor.status === "active" ? "success" : "muted"}
                />
                {vendor.contact && <p>{vendor.contact}</p>}
                <p className="break-words">{vendor.address || "No address recorded."}</p>
                {vendor.notes && <p>{vendor.notes}</p>}
                <Button asChild variant="outline" className="min-h-11">
                  <Link href="/financial/vendors">Manage vendors</Link>
                </Button>
              </NeoPanel>
            ),
          },
          {
            label: "Bills",
            content: workflow(
              "Browse all bills",
              "/financial/payables?tab=bills",
              "Vendor-scoped bills are unavailable: bills do not have a reliable Vendor ID relationship. This opens all bills."
            ),
          },
          {
            label: "Payments",
            content: workflow(
              "Browse all outgoing payments",
              "/financial/payables/payments",
              "Vendor-scoped payments are unavailable: payments link to bills without a reliable Vendor ID relationship. This opens all outgoing payments."
            ),
          },
          {
            label: "Expenses",
            content: workflow(
              "Browse all expenses",
              "/financial/expenses",
              "Vendor-specific expense history is unavailable. Review the payee on each expense."
            ),
          },
          {
            label: "Documents",
            content: (
              <p className="text-sm">
                Vendor-specific documents are unavailable. Open the relevant bill or expense to view
                its attachments.
              </p>
            ),
          },
          {
            label: "History",
            content: (
              <p className="text-sm">
                {vendor.createdAt ? `Profile created ${vendor.createdAt.slice(0, 10)}. ` : ""}A
                consolidated vendor activity history is unavailable.
              </p>
            ),
          },
        ]}
      />
    </PageLayout>
  );
}
