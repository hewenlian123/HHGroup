"use client";

import * as React from "react";
import { startTransition } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { Search, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import {
  buildCustomerApiPayload,
  CustomerFormFields,
  customerFormValuesFromCustomer,
  customerListSubtitle,
  emptyCustomerFormValues,
  formatCustomerAddressLine,
  type CustomerFormValues,
} from "@/components/customers/customer-form-fields";
import { Dialog } from "@/components/ui/dialog";
import {
  EmptyState,
  NeoInput,
  NeoMobileCard,
  NeoModal,
  NeoTable,
  NeoToolbar,
  RowActionsMenu,
  neoFormErrorClassName,
} from "@/components/base";
import type { Customer } from "@/lib/customers-db";
import { runOptimisticPersist } from "@/lib/optimistic-save";
import { listTableRowStaticClassName } from "@/lib/list-table-interaction";
import {
  MobileEmptyState,
  MobileFabButton,
  MobileListHeader,
  mobileListPagePaddingClass,
} from "@/components/mobile/mobile-list-chrome";
import { TYPO } from "@/lib/typography";
import { cn } from "@/lib/utils";

type Props = {
  initialCustomers: Customer[];
  dataLoadWarning?: string | null;
};

type Draft = CustomerFormValues & { id?: string };

const tableHeadClass = cn("h-8 px-3 text-left", TYPO.tableHeader);

function truncateText(s: string | null | undefined, max: number): string {
  const t = (s ?? "").trim();
  if (!t) return "—";
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

export function CustomersClient({ initialCustomers, dataLoadWarning = null }: Props) {
  const router = useRouter();
  const [items, setItems] = React.useState<Customer[]>(initialCustomers);
  const [search, setSearch] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Customer | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const itemsRef = React.useRef(items);
  React.useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  React.useEffect(() => {
    setItems(initialCustomers);
  }, [initialCustomers]);

  useOnAppSync(
    React.useCallback(() => {
      syncRouterNonBlocking(router);
    }, [router]),
    [router]
  );

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => {
      const hay =
        `${c.name} ${c.email ?? ""} ${c.phone ?? ""} ${c.address ?? ""} ${c.city ?? ""} ${c.state ?? ""} ${c.zip ?? ""} ${c.contact_person ?? ""} ${c.company_name ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, search]);

  const openNew = () => {
    setDraft(emptyCustomerFormValues());
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (c: Customer) => {
    setDraft({ id: c.id, ...customerFormValuesFromCustomer(c) });
    setError(null);
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    if (!draft.name.trim()) {
      setError("Name is required.");
      return;
    }
    setError(null);
    const payload = buildCustomerApiPayload(draft);

    if (!draft.id) {
      setBusy(true);
      void (async () => {
        try {
          const res = await fetch("/api/customers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data?.message ?? "Failed to create customer.");
            return;
          }
          startTransition(() => {
            setItems((prev) =>
              [...prev, data as Customer].sort((a, b) => a.name.localeCompare(b.name))
            );
            setModalOpen(false);
            setDraft(null);
          });
        } finally {
          setBusy(false);
        }
      })();
      return;
    }

    const id = draft.id;
    const previous = itemsRef.current.find((c) => c.id === id);
    if (!previous) {
      setError("Customer not found.");
      return;
    }
    const optimistic: Customer = {
      ...previous,
      ...payload,
    };
    const draftSnapshot: Draft = { ...draft };

    type Snap = { list: Customer[]; draft: Draft; modalOpen: boolean };
    runOptimisticPersist<Snap>({
      setBusy,
      getSnapshot: () => ({ list: [...itemsRef.current], draft: draftSnapshot, modalOpen }),
      apply: () => {
        setItems((prev) =>
          prev
            .map((c) => (c.id === id ? optimistic : c))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        setModalOpen(false);
        setDraft(null);
      },
      rollback: (s) => {
        setItems(s.list);
        setDraft(s.draft);
        setModalOpen(s.modalOpen);
      },
      persist: () =>
        fetch(`/api/customers/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
          .then(async (res) => {
            const data = await res.json();
            if (!res.ok) {
              return {
                error: (data as { message?: string })?.message ?? "Failed to update customer.",
              };
            }
            flushSync(() => {
              setItems((prev) =>
                prev
                  .map((c) => (c.id === (data as Customer).id ? (data as Customer) : c))
                  .sort((a, b) => a.name.localeCompare(b.name))
              );
            });
            return undefined;
          })
          .catch(() => ({ error: "Failed to update customer." })),
      onError: (msg) => setError(msg),
    });
  };

  const confirmDelete = (c: Customer) => {
    setDeleteTarget(c);
    setDeleteError(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteBusy(true);
    setDeleteError(null);
    setDeleteTarget(null);
    let snapshot: Customer[] | undefined;
    setItems((prev) => {
      snapshot = prev;
      return prev.filter((c) => c.id !== target.id);
    });
    try {
      const res = await fetch(`/api/customers/${target.id}`, {
        method: "DELETE",
      });
      if (res.status === 400) {
        const data = await res.json();
        if (snapshot) setItems(snapshot);
        setDeleteTarget(target);
        setDeleteError(data?.message ?? "Customer has linked projects and cannot be deleted.");
        return;
      }
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => null);
        if (snapshot) setItems(snapshot);
        setDeleteTarget(target);
        setDeleteError(data?.message ?? "Failed to delete customer.");
        return;
      }
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className={cn("space-y-4", mobileListPagePaddingClass, "max-md:!space-y-3")}>
      {dataLoadWarning ? (
        <p
          className="border-b border-white/10 pb-3 text-sm text-[var(--neo-canvas-text-secondary)]"
          role="status"
        >
          {dataLoadWarning}
        </p>
      ) : null}

      <MobileListHeader
        title="Customers"
        fab={<MobileFabButton onClick={openNew} ariaLabel="New customer" />}
      />

      <div className="hidden flex-col gap-3 md:flex">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className={cn(TYPO.pageTitle, "text-[var(--neo-canvas-text-primary)]")}>
              Customers
            </h1>
            <p
              className={cn(
                "mt-1 max-w-2xl",
                TYPO.pageSubtitle,
                "text-[var(--neo-canvas-text-secondary)]"
              )}
            >
              Manage your clients and contacts.
            </p>
          </div>
          <Button
            type="button"
            className="h-9 w-full rounded-md px-3 text-sm md:w-auto"
            onClick={openNew}
          >
            + New Customer
          </Button>
        </div>
        <NeoToolbar className="justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--neo-text-tertiary)]" />
            <NeoInput
              aria-label="Search customers"
              placeholder="Search customers…"
              value={search}
              onChange={(e) => startTransition(() => setSearch(e.target.value))}
              className="h-9 pl-8 text-sm"
            />
          </div>
          <p className="shrink-0 text-xs text-[var(--neo-text-secondary)]">
            Total customers:{" "}
            <span className="font-medium text-[var(--neo-text-primary)]">{items.length}</span>
          </p>
        </NeoToolbar>
      </div>

      <div className="md:hidden">
        <div className="relative w-full">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--neo-text-tertiary)]" />
          <NeoInput
            placeholder="Search customers…"
            value={search}
            onChange={(e) => startTransition(() => setSearch(e.target.value))}
            className="h-10 w-full pl-8 text-sm"
          />
        </div>
      </div>

      <div>
        {items.length === 0 ? (
          <>
            <MobileEmptyState
              icon={<UserRound className="h-8 w-8" aria-hidden />}
              message={
                dataLoadWarning
                  ? "Could not load customers."
                  : "No customers yet. Add one to get started."
              }
              action={
                !dataLoadWarning ? (
                  <Button type="button" size="sm" variant="outline" onClick={openNew}>
                    New customer
                  </Button>
                ) : undefined
              }
            />
            <EmptyState
              title={dataLoadWarning ? "Could not load customers" : "No customers yet"}
              description={
                dataLoadWarning
                  ? "Check your connection and database configuration, then refresh."
                  : "Add your first client to start tracking projects and estimates."
              }
              icon={<UserRound className="h-5 w-5" aria-hidden />}
              action={
                !dataLoadWarning ? (
                  <Button type="button" size="sm" onClick={openNew}>
                    Add customer
                  </Button>
                ) : undefined
              }
              className="hidden md:block"
            />
          </>
        ) : (
          <>
            <div className="space-y-2 md:hidden">
              {filtered.map((c) => (
                <NeoMobileCard key={c.id} className="flex min-h-[64px] items-center gap-2 p-3">
                  <Link
                    href={`/customers/${c.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--neo-text-primary)]">
                        {c.name}
                      </p>
                      <p className="truncate text-xs text-[var(--neo-text-secondary)]">
                        {customerListSubtitle(c)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-[var(--neo-text-primary)]">
                      {c.phone?.trim() ? c.phone : "—"}
                    </span>
                  </Link>
                  <RowActionsMenu
                    ariaLabel={`Actions for ${c.name}`}
                    actions={[
                      { label: "Edit", onClick: () => openEdit(c) },
                      { label: "Delete…", onClick: () => confirmDelete(c), destructive: true },
                    ]}
                    contentClassName="dark border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-[var(--neo-text-primary)]"
                  />
                </NeoMobileCard>
              ))}
            </div>
            <NeoTable className="hidden md:block" tableClassName="min-w-[760px] lg:min-w-0">
              <thead>
                <tr>
                  <th className={tableHeadClass}>Name</th>
                  <th className={tableHeadClass}>Company</th>
                  <th className={tableHeadClass}>Email</th>
                  <th className={tableHeadClass}>Phone</th>
                  <th className={tableHeadClass}>Address</th>
                  <th className={tableHeadClass}>Created</th>
                  <th className={cn(tableHeadClass, "w-8 px-2 text-right")}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className={listTableRowStaticClassName}>
                    <td className="min-h-[44px] px-3 py-2 align-middle font-medium">
                      <Link
                        href={`/customers/${c.id}`}
                        className="text-[var(--neo-text-primary)] underline-offset-2 hover:underline"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--neo-text-secondary)]">
                      {c.company_name?.trim() ? c.company_name : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--neo-text-secondary)]">
                      {c.email ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--neo-text-secondary)]">
                      {c.phone ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--neo-text-secondary)]">
                      {truncateText(formatCustomerAddressLine(c), 40)}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--neo-text-secondary)]">
                      {c.created_at ? new Date(c.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <RowActionsMenu
                        ariaLabel={`Actions for ${c.name}`}
                        actions={[
                          { label: "Edit", onClick: () => openEdit(c) },
                          {
                            label: "Delete…",
                            onClick: () => confirmDelete(c),
                            destructive: true,
                          },
                        ]}
                        className="h-7 w-7 md:h-7 md:w-7"
                        contentClassName="dark border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-[var(--neo-text-primary)]"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </NeoTable>
          </>
        )}
      </div>

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDraft(null);
            setModalOpen(false);
          }
        }}
      >
        <NeoModal
          title={draft?.id ? "Edit customer" : "New customer"}
          description="Keep the customer profile compact and ready for project work."
          className="max-w-[560px]"
        >
          {draft ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
              <CustomerFormFields
                idPrefix="customers-modal"
                values={draft}
                onChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
              />
              {error ? <p className={neoFormErrorClassName}>{error}</p> : null}
              <div className="-mx-5 mt-2 flex flex-col-reverse gap-2 border-t border-[var(--neo-border)] px-5 pt-4 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-sm"
                  onClick={() => setModalOpen(false)}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="h-9 rounded-sm"
                  data-testid="customers-modal-save"
                  disabled={busy}
                >
                  <SubmitSpinner loading={busy} className="mr-2" />
                  {busy ? "Saving…" : "Save"}
                </Button>
              </div>
            </form>
          ) : null}
        </NeoModal>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <NeoModal title="Delete customer" className="max-w-sm">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{" "}
            <span className="font-medium">{deleteTarget?.name}</span>? This action cannot be undone.
            Customers with linked projects cannot be deleted.
          </p>
          {deleteError ? <p className={neoFormErrorClassName}>{deleteError}</p> : null}
          <div className="-mx-5 mt-1 flex flex-col-reverse gap-2 border-t border-[var(--neo-border)] px-5 pt-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-sm"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteBusy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="btn-outline-destructive h-9 rounded-sm"
              onClick={handleDelete}
              disabled={deleteBusy}
            >
              {deleteBusy ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </NeoModal>
      </Dialog>
    </div>
  );
}
