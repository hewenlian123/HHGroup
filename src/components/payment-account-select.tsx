"use client";

import * as React from "react";
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
  addPaymentAccount,
  getPaymentAccounts,
  type PaymentAccountRow,
  type PaymentAccountType,
} from "@/lib/data";
import { useToast } from "@/components/toast/toast-provider";
import { cn } from "@/lib/utils";

const ADD_NEW_VALUE = "__hh_add_payment_account__";

export type PaymentAccountSelectProps = {
  value: string;
  onValueChange: (accountId: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  autoFocus?: boolean;
  onKeyDown?: React.KeyboardEventHandler<HTMLSelectElement>;
  onAccountsUpdated?: (rows: PaymentAccountRow[]) => void;
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
}: PaymentAccountSelectProps) {
  const { toast } = useToast();
  const [accounts, setAccounts] = React.useState<PaymentAccountRow[]>([]);
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
        const rows = await getPaymentAccounts();
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
  }, [toast]);

  React.useEffect(() => {
    if (addOpen) {
      setNewName("");
      setNewType("card");
      const t = window.setTimeout(() => newInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [addOpen]);

  const byId = React.useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (v === ADD_NEW_VALUE) {
      setAddOpen(true);
      return;
    }
    onValueChange(v);
  };

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
      const next = await getPaymentAccounts();
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

  const selected = value && byId.get(value);
  const validValue = selected ? value : "";

  return (
    <>
      <select
        id={id}
        value={validValue}
        disabled={disabled || loading}
        onChange={handleSelectChange}
        onKeyDown={onKeyDown}
        className={cn(className)}
        autoFocus={autoFocus}
        aria-busy={loading}
      >
        <option value="">—</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
        <option value={ADD_NEW_VALUE}>+ Add new account</option>
      </select>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm rounded-sm border-border/60">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">New payment account</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              ref={newInputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name (e.g. Amex)"
              className="h-9"
              disabled={creating}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
            />
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Type</label>
              <select
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                value={newType}
                disabled={creating}
                onChange={(e) => setNewType(e.target.value as PaymentAccountType)}
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="bank">Bank</option>
              </select>
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
              {creating ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
