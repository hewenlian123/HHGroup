"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addPaymentAccount,
  getPaymentAccountsForExpensePicker,
  type PaymentAccountPickerRow,
  type PaymentAccountType,
} from "@/lib/data";
import { useToast } from "@/components/toast/toast-provider";
import { cn } from "@/lib/utils";

const ADD_NEW_VALUE = "__hh_add_payment_account__";
const EMPTY_VALUE = "__hh_pay_empty__";

export type PaymentAccountSelectProps = {
  value: string;
  onValueChange: (accountId: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  autoFocus?: boolean;
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
  onAccountsUpdated?: (rows: PaymentAccountPickerRow[]) => void;
  /** When `value` is set but not in the loaded list yet (e.g. stale id), show this label in the trigger */
  fallbackDisplayName?: string;
  "data-queue-row-id"?: string;
  "data-queue-field"?: string;
};

export function PaymentAccountSelect({
  value,
  onValueChange,
  disabled,
  className,
  id,
  autoFocus,
  onKeyDown,
  onAccountsUpdated,
  fallbackDisplayName,
  "data-queue-row-id": dataQueueRowId,
  "data-queue-field": dataQueueField,
}: PaymentAccountSelectProps) {
  const { toast } = useToast();
  const [accounts, setAccounts] = React.useState<PaymentAccountPickerRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [addOpen, setAddOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newType, setNewType] = React.useState<PaymentAccountType>("card");
  const [creating, setCreating] = React.useState(false);
  const newInputRef = React.useRef<HTMLInputElement>(null);
  const onAccountsUpdatedRef = React.useRef(onAccountsUpdated);
  onAccountsUpdatedRef.current = onAccountsUpdated;

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const rows = await getPaymentAccountsForExpensePicker(value);
        if (cancelled) return;
        setAccounts(rows);
        onAccountsUpdatedRef.current?.(rows);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Failed to load payment accounts";
        toast({ title: "Payment", description: msg, variant: "error" });
        setAccounts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast, value]);

  React.useEffect(() => {
    if (addOpen) {
      setNewName("");
      setNewType("card");
      const t = window.setTimeout(() => newInputRef.current?.focus(), 50);
      return () => window.clearTimeout(t);
    }
  }, [addOpen]);

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      toast({ title: "Name required", variant: "error" });
      return;
    }
    const lower = trimmed.toLowerCase();
    if (accounts.some((a) => a.name.toLowerCase() === lower)) {
      toast({
        title: "Duplicate",
        description: `“${trimmed}” already exists.`,
        variant: "error",
      });
      return;
    }
    setCreating(true);
    try {
      const row = await addPaymentAccount(trimmed, newType);
      if (!row) {
        toast({ title: "Payment", description: "Could not add account.", variant: "error" });
        return;
      }
      const next = await getPaymentAccountsForExpensePicker(row.id);
      setAccounts(next);
      onAccountsUpdatedRef.current?.(next);
      if (row.name.toLowerCase() !== lower) {
        toast({ title: "Using existing account", description: row.name, variant: "default" });
      }
      onValueChange(row.id);
      setAddOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Create failed";
      toast({ title: "Payment", description: msg, variant: "error" });
    } finally {
      setCreating(false);
    }
  };

  const selectedKnown = Boolean(value && accounts.some((a) => a.id === value));
  const radixValue = !value || value === "" ? EMPTY_VALUE : value;

  return (
    <>
      <Select
        value={radixValue}
        disabled={disabled || loading}
        onValueChange={(v) => {
          if (v === ADD_NEW_VALUE) {
            setAddOpen(true);
            return;
          }
          if (v === EMPTY_VALUE) {
            onValueChange("");
            return;
          }
          onValueChange(v);
        }}
      >
        <SelectTrigger
          id={id}
          className={cn("h-10 max-md:h-10 max-md:min-h-10 [&>span]:line-clamp-1", className)}
          aria-busy={loading}
          data-queue-row-id={dataQueueRowId}
          data-queue-field={dataQueueField}
          autoFocus={autoFocus}
          onKeyDown={onKeyDown as React.KeyboardEventHandler<HTMLButtonElement>}
        >
          <SelectValue placeholder="Payment account" />
        </SelectTrigger>
        <SelectContent position="popper" sideOffset={4} className="max-h-56">
          <SelectItem value={EMPTY_VALUE}>—</SelectItem>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.archived ? `${a.name} (Archived)` : a.name}
            </SelectItem>
          ))}
          {value && !selectedKnown && value !== "" ? (
            <SelectItem value={value}>{(fallbackDisplayName ?? "").trim() || "Account"}</SelectItem>
          ) : null}
          <SelectItem value={ADD_NEW_VALUE}>+ Add new account</SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm rounded-sm border-border/60">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">New payment account</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">Name</label>
              <Input
                ref={newInputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name (e.g. Amex)"
                className="h-10 rounded-sm border-border/60"
                disabled={creating}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleCreate();
                  }
                }}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">Type</label>
              <Select
                value={newType}
                disabled={creating}
                onValueChange={(v) => setNewType(v as PaymentAccountType)}
              >
                <SelectTrigger className="h-10 max-md:h-10 max-md:min-h-10 rounded-sm border-border/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4} className="max-h-56">
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              disabled={creating}
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={creating}
              onClick={() => void handleCreate()}
            >
              <SubmitSpinner loading={creating} className="mr-2" />
              {creating ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
