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
import { ExpenseSearchableSelect } from "@/components/expense-searchable-select";
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
  contentClassName?: string;
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
  contentClassName,
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
  const [newTypeOpen, setNewTypeOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const newInputRef = React.useRef<HTMLInputElement>(null);
  const newTypeTriggerRef = React.useRef<HTMLButtonElement>(null);
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
  const accountOptions = React.useMemo(
    () => [
      { value: EMPTY_VALUE, label: "—", searchText: "none no payment account" },
      ...accounts.map((account) => ({
        value: account.id,
        label: account.archived ? `${account.name} (Archived)` : account.name,
        searchText: account.name,
      })),
      ...(value && !selectedKnown && value !== ""
        ? [
            {
              value,
              label: (fallbackDisplayName ?? "").trim() || "Account",
              searchText: fallbackDisplayName ?? value,
            },
          ]
        : []),
    ],
    [accounts, fallbackDisplayName, selectedKnown, value]
  );
  const fallbackLabel =
    value && !selectedKnown && value !== ""
      ? (fallbackDisplayName ?? "").trim() || "Account"
      : undefined;

  return (
    <>
      <ExpenseSearchableSelect
        value={radixValue}
        disabled={disabled}
        loading={loading}
        options={accountOptions}
        actions={[
          {
            value: ADD_NEW_VALUE,
            label: "+ Add new account",
            searchText: "add new account payment",
            onSelect: () => setAddOpen(true),
          },
        ]}
        fallbackLabel={fallbackLabel}
        placeholder="Payment account"
        emptyText="No matching accounts"
        searchPlaceholder="Search payment accounts…"
        id={id}
        className={cn("h-10 max-md:h-10 max-md:min-h-10 [&>span]:line-clamp-1", className)}
        contentClassName={contentClassName}
        aria-label="Payment account"
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
        data-queue-row-id={dataQueueRowId}
        data-queue-field={dataQueueField}
        onValueChange={(v) => {
          if (v === EMPTY_VALUE) {
            onValueChange("");
            return;
          }
          onValueChange(v);
        }}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent
          data-expense-component-surface="create-option"
          className="expenses-ui-dialog max-w-sm !rounded-[10px] border-border/60 max-md:!rounded-b-none max-md:!rounded-t-[14px]"
        >
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
                open={newTypeOpen}
                onOpenChange={(nextOpen) => {
                  setNewTypeOpen(nextOpen);
                  if (!nextOpen) {
                    window.setTimeout(
                      () => newTypeTriggerRef.current?.focus({ preventScroll: true }),
                      220
                    );
                  }
                }}
                value={newType}
                disabled={creating}
                onValueChange={(v) => setNewType(v as PaymentAccountType)}
              >
                <SelectTrigger
                  ref={newTypeTriggerRef}
                  className="h-10 max-md:h-10 max-md:min-h-10 rounded-sm border-border/60"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  sideOffset={4}
                  onEscapeKeyDown={(event) => {
                    event.stopPropagation();
                  }}
                  className="expenses-ui-dialog max-h-56"
                  data-expense-component-surface="select"
                >
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
