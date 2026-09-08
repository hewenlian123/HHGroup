"use client";

import * as React from "react";
import { startTransition } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { refreshRscNonBlocking } from "@/components/perf/sync-router-non-blocking";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { Plus, Search, UserRound } from "lucide-react";
import { ErrorRetry } from "@/components/ui/system-state";
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
  ConfirmDialog,
  NeoInput,
  NeoSelect,
  NeoStatus,
  NeoMobileCard,
  NeoModal,
  NeoTable,
  NeoToolbar,
  PageHeader,
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
import { useToast } from "@/components/toast/toast-provider";

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
  const { toast } = useToast();
  const [items, setItems] = React.useState<Customer[]>(initialCustomers);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [busy, setBusy] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Customer | null>(null);
  const customerSearchRef = React.useRef<HTMLInputElement>(null);
  const deleteCompletedRef = React.useRef(false);
  const itemsRef = React.useRef(items);
  React.useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  React.useEffect(() => {
    setItems(initialCustomers);
  }, [initialCustomers]);

  useOnAppSync(
    React.useCallback(
      (detail) => {
        if (!detail.refreshScheduled) refreshRscNonBlocking(router);
      },
      [router]
    ),
    [router]
  );

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((c) => {
      const hay =
        `${c.name} ${c.email ?? ""} ${c.phone ?? ""} ${c.address ?? ""} ${c.city ?? ""} ${c.state ?? ""} ${c.zip ?? ""} ${c.contact_person ?? ""} ${c.company_name ?? ""}`.toLowerCase();
      return hay.includes(q) && (status === "all" || c.status === status);
    });
  }, [items, search, status]);

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
          toast({ title: "Customer created", variant: "success" });
        } catch {
          setError("Failed to create customer. Check your connection and try again.");
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
      onSuccess: () => toast({ title: "Customer updated", variant: "success" }),
    });
  };

  const confirmDelete = (c: Customer) => {
    setDeleteTarget(c);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const snapshot = itemsRef.current;
    setItems(snapshot.filter((c) => c.id !== target.id));
    try {
      const res = await fetch(`/api/customers/${target.id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.message ??
            (res.status === 400
              ? "Customer has linked projects and cannot be deleted."
              : "Failed to delete customer.")
        );
      }
      deleteCompletedRef.current = true;
      toast({ title: "Customer deleted", variant: "success" });
    } catch (cause) {
      setItems(snapshot);
      if (cause instanceof TypeError) {
        throw new Error("Failed to delete customer. Check your connection and try again.");
      }
      throw cause instanceof Error ? cause : new Error("Failed to delete customer.");
    }
  };

  return (
    <div className={cn("page-stack", mobileListPagePaddingClass, "max-md:!gap-3")}>
      <MobileListHeader
        title="Customers"
        fab={<MobileFabButton onClick={openNew} ariaLabel="New customer" />}
      />

      <div className="hidden md:block">
        <PageHeader
          title="Customers"
          description="Manage your clients and contacts."
          actions={
            <Button
              type="button"
              size="sm"
              className="h-hh-control-standard gap-hh-2"
              onClick={openNew}
            >
              <Plus className="h-4 w-4" aria-hidden />
              New Customer
            </Button>
          }
        />
      </div>

      <NeoToolbar className="flex-row items-center gap-hh-2 p-hh-2">
        <div className="relative min-w-0 flex-1 md:max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--hh-text-tertiary)]" />
          <NeoInput
            ref={customerSearchRef}
            aria-label="Search customers"
            placeholder="Search customers…"
            value={search}
            onChange={(e) => startTransition(() => setSearch(e.target.value))}
            className="h-11 min-h-11 w-full pl-8 md:h-hh-control-standard md:min-h-[var(--hh-control-height-standard)]"
          />
        </div>
        <NeoSelect
          aria-label="Customer status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-11 min-h-11 w-[8.5rem] shrink-0 md:h-hh-control-standard md:min-h-[var(--hh-control-height-standard)] md:w-40"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </NeoSelect>
        <p className="hidden shrink-0 text-hh-metadata text-[var(--hh-text-secondary)] lg:block">
          Total customers:{" "}
          <span className="font-medium text-[var(--hh-text-primary)]">
            {dataLoadWarning ? "Unavailable" : items.length}
          </span>
        </p>
      </NeoToolbar>
      {!dataLoadWarning && items.length > 0 && filtered.length === 0 && (
        <EmptyState
          title="No customers match your filters"
          description="Try another search or status."
        />
      )}
      <div>
        {dataLoadWarning ? (
          <ErrorRetry
            title="Customers unavailable"
            description={dataLoadWarning}
            retryLabel="Retry"
            onRetry={() => router.refresh()}
          />
        ) : items.length === 0 ? (
          <>
            <MobileEmptyState
              icon={<UserRound className="h-8 w-8" aria-hidden />}
              message="No customers yet. Add one to get started."
              action={
                !dataLoadWarning ? (
                  <Button type="button" size="sm" variant="outline" onClick={openNew}>
                    New customer
                  </Button>
                ) : undefined
              }
            />
            <EmptyState
              title="No customers yet"
              description="Add your first client to start tracking projects and estimates."
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
            <div className="overflow-hidden rounded-hh-standard border border-[var(--hh-border)] md:hidden">
              {filtered.map((c) => (
                <NeoMobileCard
                  key={c.id}
                  className="flex min-h-[64px] items-center gap-2 rounded-none border-0 border-b border-[var(--hh-border)] bg-transparent p-3 shadow-none last:border-b-0"
                >
                  <Link
                    href={`/customers/${c.id}`}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3 self-stretch text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--hh-text-primary)]">
                        {c.name}
                      </p>
                      <p className="truncate text-xs text-[var(--hh-text-secondary)]">
                        {customerListSubtitle(c)} · {c.status ?? "active"}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-[var(--hh-text-primary)]">
                      {c.phone?.trim() ? c.phone : "—"}
                    </span>
                  </Link>
                  <RowActionsMenu
                    ariaLabel={`Actions for ${c.name}`}
                    actions={[
                      { label: "Edit", onClick: () => openEdit(c) },
                      { label: "Delete…", onClick: () => confirmDelete(c), destructive: true },
                    ]}
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
                  <th className={tableHeadClass}>Status</th>
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
                        className="inline-flex min-h-11 items-center text-[var(--hh-text-primary)] underline-offset-2 hover:underline"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--hh-text-secondary)]">
                      {c.company_name?.trim() ? c.company_name : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--hh-text-secondary)]">
                      {c.email ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--hh-text-secondary)]">
                      {c.phone ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--hh-text-secondary)]">
                      {truncateText(formatCustomerAddressLine(c), 40)}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--hh-text-secondary)]">
                      <NeoStatus
                        label={c.status ?? "active"}
                        variant={c.status === "inactive" ? "muted" : "success"}
                      />
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--hh-text-secondary)]">
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
                        className="h-11 w-11"
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
              {error ? (
                <p role="alert" className={neoFormErrorClassName}>
                  {error}
                </p>
              ) : null}
              <div className="-mx-5 mt-2 flex flex-col-reverse gap-2 border-t border-[var(--hh-border)] px-5 pt-4 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 rounded-sm"
                  onClick={() => setModalOpen(false)}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="min-h-11 rounded-sm"
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

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (open) return;
          setDeleteTarget(null);
          if (deleteCompletedRef.current) {
            deleteCompletedRef.current = false;
            window.requestAnimationFrame(() => customerSearchRef.current?.focus());
          }
        }}
        title="Delete customer?"
        description={
          <>
            Delete <span className="font-medium">{deleteTarget?.name}</span>? This cannot be undone.
            Customers with linked projects cannot be deleted.
          </>
        }
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
