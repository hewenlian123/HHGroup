"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { NeoFieldLabel, NeoModal, neoFormErrorClassName } from "@/components/base";
import {
  buildCustomerApiPayload,
  CustomerFormFields,
  emptyCustomerFormValues,
  type CustomerFormValues,
} from "@/components/customers/customer-form-fields";
import { cn } from "@/lib/utils";

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
  selectedOption?: CustomerOption | null;
  onChange: (customerId: string | null, customer?: CustomerOption | null) => void;
  triggerClassName?: string;
};

export function CustomerSelectWithAdd({
  label = "Customer",
  value,
  selectedOption,
  onChange,
  triggerClassName,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [options, setOptions] = React.useState<CustomerOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [addOpen, setAddOpen] = React.useState(false);
  const [addBusy, setAddBusy] = React.useState(false);
  const [addForm, setAddForm] = React.useState<CustomerFormValues>(emptyCustomerFormValues);
  const [addError, setAddError] = React.useState<string | null>(null);

  const resetAddForm = React.useCallback(() => {
    setAddForm(emptyCustomerFormValues());
    setAddError(null);
  }, []);

  const patchAddForm = React.useCallback((patch: Partial<CustomerFormValues>) => {
    setAddForm((prev) => ({ ...prev, ...patch }));
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
    if (!addForm.name.trim()) {
      setAddError("Name is required.");
      return;
    }
    setAddBusy(true);
    setAddError(null);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCustomerApiPayload(addForm)),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data?.message ?? "Failed to create customer.");
        return;
      }
      const created: CustomerOption = {
        id: data.id,
        name: data.name ?? "",
        address: data.address ?? null,
        phone: data.phone ?? null,
        email: data.email ?? null,
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

  const current =
    options.find((o) => o.id === value) ??
    (selectedOption && selectedOption.id === value ? selectedOption : null);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <NeoFieldLabel>{label}</NeoFieldLabel>
        {current ? (
          <button
            type="button"
            className="text-hh-status text-[var(--hh-text-secondary)] transition-colors hover:text-[var(--hh-text-primary)]"
            onClick={() => onChange(null, null)}
          >
            Clear
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "hh-focus-ring flex h-10 w-full items-center justify-between rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 text-left text-hh-body text-[var(--hh-text-primary)] transition-colors duration-150 ease-out hover:bg-[var(--hh-l3-hover)] max-md:min-h-11",
          triggerClassName
        )}
      >
        <span className="truncate">
          {current ? (
            <>
              {current.name}
              {current.email ? (
                <span className="text-xs text-[var(--hh-text-secondary)]"> · {current.email}</span>
              ) : null}
            </>
          ) : (
            <span className="text-[var(--hh-text-tertiary)]">Select customer</span>
          )}
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <NeoModal title="Select customer" className="max-w-sm" bodyClassName="space-y-3">
          <Input
            placeholder="Search by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 text-sm"
          />
          <div className="max-h-64 overflow-y-auto rounded-hh-standard border border-[var(--hh-border-floating)] bg-[var(--hh-l4-floating-surface)] shadow-floating">
            {loading ? (
              <div className="px-3 py-2 text-xs text-[var(--hh-text-secondary)]">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[var(--hh-text-secondary)]">
                No customers found.
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className="flex w-full flex-col items-start px-3 py-2 text-left text-sm text-[var(--hh-text-primary)] transition-colors hover:bg-[var(--hh-l2-operational-surface)]"
                  onClick={() => {
                    onChange(c.id, c);
                    setOpen(false);
                  }}
                >
                  <span className="font-medium">{c.name}</span>
                  {c.email ? (
                    <span className="text-xs text-[var(--hh-text-secondary)]">{c.email}</span>
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
        </NeoModal>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <NeoModal
          title="New customer"
          className="max-w-md"
          bodyClassName="space-y-3"
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-md"
                onClick={() => setAddOpen(false)}
                disabled={addBusy}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                className="h-9 rounded-md"
                data-testid="new-customer-save"
                onClick={handleCreate}
                disabled={addBusy}
              >
                <SubmitSpinner loading={addBusy} className="mr-2" />
                {addBusy ? "Saving…" : "Save"}
              </Button>
            </>
          }
        >
          <CustomerFormFields idPrefix="new-customer" values={addForm} onChange={patchAddForm} />
          {addError ? <p className={neoFormErrorClassName}>{addError}</p> : null}
        </NeoModal>
      </Dialog>
    </div>
  );
}
