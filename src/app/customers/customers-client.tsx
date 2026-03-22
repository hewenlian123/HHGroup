"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { syncRouterAndClients } from "@/lib/sync-router-client";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Customer } from "@/lib/customers-db";
import { runOptimisticPersist } from "@/lib/optimistic-save";

type Props = {
  initialCustomers: Customer[];
};

type Draft = {
  id?: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
};

export function CustomersClient({ initialCustomers }: Props) {
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
      void syncRouterAndClients(router);
    }, [router]),
    [router]
  );

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => {
      const hay = `${c.name} ${c.email ?? ""} ${c.phone ?? ""} ${c.city ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, search]);

  const openNew = () => {
    setDraft({
      name: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      state: "",
      zip: "",
      notes: "",
    });
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (c: Customer) => {
    setDraft({
      id: c.id,
      name: c.name,
      email: c.email ?? "",
      phone: c.phone ?? "",
      address: c.address ?? "",
      city: c.city ?? "",
      state: c.state ?? "",
      zip: c.zip ?? "",
      notes: c.notes ?? "",
    });
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
    const payload = {
      name: draft.name.trim(),
      email: draft.email.trim() || null,
      phone: draft.phone.trim() || null,
      address: draft.address.trim() || null,
      city: draft.city.trim() || null,
      state: draft.state.trim() || null,
      zip: draft.zip.trim() || null,
      notes: draft.notes.trim() || null,
    };

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
          setItems((prev) =>
            [...prev, data as Customer].sort((a, b) => a.name.localeCompare(b.name))
          );
          setModalOpen(false);
          setDraft(null);
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
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Customers
          </p>
          <p className="text-sm text-muted-foreground">Manage your clients and contacts.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search customers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-40 sm:w-64 text-sm"
          />
          <Button type="button" className="h-9 rounded-sm px-3 text-sm" onClick={openNew}>
            + New Customer
          </Button>
        </div>
      </div>

      <div className="rounded-sm border border-border/60 bg-background">
        <div className="border-b border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
          Total customers: {items.length}
        </div>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-border/60 text-xs text-muted-foreground">
              ☺
            </div>
            <p className="text-sm font-medium text-foreground">No customers yet.</p>
            <p className="text-xs text-muted-foreground">
              Add your first client to start tracking projects and estimates.
            </p>
            <Button
              type="button"
              size="sm"
              className="mt-2 h-8 rounded-sm px-3 text-xs"
              onClick={openNew}
            >
              + Add customer
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40">
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Name
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Email
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Phone
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    City
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Created
                  </th>
                  <th className="px-2 py-2 w-8 text-right text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border/40 last:border-b-0 hover:bg-muted/40"
                  >
                    <td className="px-3 py-2 font-medium">
                      <Link
                        href={`/customers/${c.id}`}
                        className="text-foreground hover:underline underline-offset-2"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{c.email ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{c.phone ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{c.city ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {c.created_at ? new Date(c.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-sm"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[160px]">
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              openEdit(c);
                            }}
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              confirmDelete(c);
                            }}
                            className="text-destructive focus:text-destructive"
                          >
                            Delete…
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => !open && setDraft(null) && setModalOpen(false)}
      >
        <DialogContent className="max-w-md border-border/60 rounded-md p-5">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {draft?.id ? "Edit customer" : "New customer"}
            </DialogTitle>
          </DialogHeader>
          {draft && (
            <form onSubmit={handleSubmit} className="grid gap-3">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Name<span className="text-red-500">*</span>
                </p>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                  className="h-9 text-sm"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Email</p>
                  <Input
                    value={draft.email}
                    onChange={(e) => setDraft((d) => (d ? { ...d, email: e.target.value } : d))}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Phone</p>
                  <Input
                    value={draft.phone}
                    onChange={(e) => setDraft((d) => (d ? { ...d, phone: e.target.value } : d))}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Address</p>
                <Input
                  value={draft.address}
                  onChange={(e) => setDraft((d) => (d ? { ...d, address: e.target.value } : d))}
                  className="h-9 text-sm"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">City</p>
                  <Input
                    value={draft.city}
                    onChange={(e) => setDraft((d) => (d ? { ...d, city: e.target.value } : d))}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">State</p>
                  <Input
                    value={draft.state}
                    onChange={(e) => setDraft((d) => (d ? { ...d, state: e.target.value } : d))}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Zip</p>
                  <Input
                    value={draft.zip}
                    onChange={(e) => setDraft((d) => (d ? { ...d, zip: e.target.value } : d))}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Notes</p>
                <Input
                  value={draft.notes}
                  onChange={(e) => setDraft((d) => (d ? { ...d, notes: e.target.value } : d))}
                  className="h-9 text-sm"
                />
              </div>
              {error ? <p className="text-xs text-red-600">{error}</p> : null}
              <DialogFooter className="mt-2 gap-2 border-t border-border/60 pt-3">
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
                <Button type="submit" size="sm" className="h-9 rounded-sm" disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm border-border/60 rounded-md p-5">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Delete customer</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{" "}
            <span className="font-medium">{deleteTarget?.name}</span>? This action cannot be undone.
            Customers with linked projects cannot be deleted.
          </p>
          {deleteError ? <p className="pt-2 text-xs text-red-600">{deleteError}</p> : null}
          <DialogFooter className="mt-3 gap-2 border-t border-border/60 pt-3">
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
              variant="destructive"
              size="sm"
              className="h-9 rounded-sm"
              onClick={handleDelete}
              disabled={deleteBusy}
            >
              {deleteBusy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
