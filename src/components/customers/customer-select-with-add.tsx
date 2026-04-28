"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export type CustomerOption = {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
};

type Props = {
  label?: string;
  value: string | null;
  onChange: (customerId: string | null, customer?: CustomerOption | null) => void;
};

export function CustomerSelectWithAdd({ label = "Customer", value, onChange }: Props) {
  const [open, setOpen] = React.useState(false);
  const [options, setOptions] = React.useState<CustomerOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [addOpen, setAddOpen] = React.useState(false);
  const [addBusy, setAddBusy] = React.useState(false);
  const [addName, setAddName] = React.useState("");
  const [addEmail, setAddEmail] = React.useState("");
  const [addPhone, setAddPhone] = React.useState("");
  const [addAddress, setAddAddress] = React.useState("");
  const [addError, setAddError] = React.useState<string | null>(null);

  const resetAddForm = React.useCallback(() => {
    setAddName("");
    setAddEmail("");
    setAddPhone("");
    setAddAddress("");
    setAddError(null);
  }, []);

  React.useEffect(() => {
    if (!addOpen) resetAddForm();
  }, [addOpen, resetAddForm]);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/customers", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setOptions((data.customers ?? []) as CustomerOption[]))
      .catch(() => {
        setOptions([]);
      })
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((c) => {
      const hay = `${c.name} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, search]);

  const handleCreate = async () => {
    if (!addName.trim()) {
      setAddError("Name is required.");
      return;
    }
    setAddBusy(true);
    setAddError(null);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addName.trim(),
          email: addEmail.trim() || null,
          phone: addPhone.trim() || null,
          address: addAddress.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data?.message ?? "Failed to create customer.");
        return;
      }
      const created: CustomerOption = {
        id: data.id,
        name: data.name,
        address: data.address ?? "",
        phone: data.phone ?? "",
        email: data.email ?? "",
      };
      setOptions((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      onChange(created.id, created);
      setAddOpen(false);
      setOpen(false);
    } catch {
      setAddError("Failed to create customer.");
    } finally {
      setAddBusy(false);
    }
  };

  const current = options.find((o) => o.id === value) ?? null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {current ? (
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => onChange(null, null)}
          >
            Clear
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm"
      >
        <span className="truncate">
          {current ? (
            <>
              {current.name}
              {current.email ? (
                <span className="text-xs text-muted-foreground"> · {current.email}</span>
              ) : null}
            </>
          ) : (
            <span className="text-muted-foreground">Select customer</span>
          )}
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm border-border/60 rounded-md p-4 space-y-3">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Select customer</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Search by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
          />
          <div className="max-h-64 overflow-y-auto rounded-md border border-border/60 bg-background">
            {loading ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">No customers found.</div>
            ) : (
              filtered.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted/60"
                  onClick={() => {
                    onChange(c.id, c);
                    setOpen(false);
                  }}
                >
                  <span className="font-medium">{c.name}</span>
                  {c.email ? (
                    <span className="text-xs text-muted-foreground">{c.email}</span>
                  ) : null}
                </button>
              ))
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-sm text-xs"
            onClick={() => setAddOpen(true)}
          >
            + New Customer
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm border-border/60 rounded-md p-4 flex flex-col gap-3">
          <DialogHeader className="space-y-0">
            <DialogTitle className="text-sm font-semibold">New customer</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="new-customer-name"
                className="text-xs font-medium text-muted-foreground"
              >
                Name *
              </label>
              <Input
                id="new-customer-name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className="h-8 rounded-md text-sm"
                autoComplete="organization"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="new-customer-phone"
                className="text-xs font-medium text-muted-foreground"
              >
                Phone
              </label>
              <Input
                id="new-customer-phone"
                type="tel"
                value={addPhone}
                onChange={(e) => setAddPhone(e.target.value)}
                className="h-8 rounded-md text-sm"
                placeholder="Optional"
                autoComplete="tel"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="new-customer-email"
                className="text-xs font-medium text-muted-foreground"
              >
                Email
              </label>
              <Input
                id="new-customer-email"
                type="email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                className="h-8 rounded-md text-sm"
                placeholder="Optional"
                autoComplete="email"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="new-customer-address"
                className="text-xs font-medium text-muted-foreground"
              >
                Address
              </label>
              <Input
                id="new-customer-address"
                value={addAddress}
                onChange={(e) => setAddAddress(e.target.value)}
                className="h-8 rounded-md text-sm"
                placeholder="Optional"
                autoComplete="street-address"
              />
            </div>
          </div>
          {addError ? <p className="text-xs text-red-600">{addError}</p> : null}
          <DialogFooter className="gap-2 pt-1 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-sm"
              onClick={() => setAddOpen(false)}
              disabled={addBusy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="h-8 rounded-sm"
              onClick={handleCreate}
              disabled={addBusy}
            >
              <SubmitSpinner loading={addBusy} className="mr-2" />
              {addBusy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
