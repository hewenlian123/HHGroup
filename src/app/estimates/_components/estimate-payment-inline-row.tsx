"use client";

import * as React from "react";
import { formatEstimateCurrency } from "./estimate-currency";
import { formatEstimatePaymentDueDate } from "./estimate-payment-date";
import { ChevronDown, GripVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import {
  paymentAmountFromPercent,
  paymentPercentFromAmount,
  parsePaymentPercentInput,
} from "./estimate-payment-percent";
import { EstimateNoteBody } from "./estimate-notes-clarifications";

export type InlinePaymentValue = {
  id: string;
  title: string;
  amount: number;
  description?: string | null;
  dueDate?: string | null;
  paymentTerm?: string | null;
};

/** Edits existing fixed-dollar fields; percentages remain a conversion helper. */
export function EstimatePaymentInlineRow({
  value,
  total,
  disabled = false,
  autoFocus,
  onChange,
  onSave,
  actions,
  maxAmount,
  onReorder,
}: {
  value: InlinePaymentValue;
  total: number;
  disabled?: boolean;
  autoFocus?: boolean;
  onChange: (value: InlinePaymentValue) => void;
  onSave?: (value: InlinePaymentValue) => Promise<{ ok: boolean; error?: string }>;
  actions: React.ReactNode;
  maxAmount?: number;
  onReorder?: (sourceId: string, targetId: string) => void;
}) {
  const [amountEditing, setAmountEditing] = React.useState(false);
  const [dateEditing, setDateEditing] = React.useState(false);
  const focusDateAfterMenu = React.useRef(false);
  const [percent, setPercent] = React.useState(() => paymentPercentFromAmount(value.amount, total));
  const [amountText, setAmountText] = React.useState(() => value.amount.toFixed(2));
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const form = React.useRef<HTMLDivElement>(null);
  const lastSaved = React.useRef(JSON.stringify(value));
  const latest = React.useRef(value);
  const queue = React.useRef(Promise.resolve());
  latest.current = value;
  React.useEffect(() => {
    if (autoFocus) {
      const input = form.current?.querySelector("input");
      input?.focus();
      input?.select();
    }
  }, [autoFocus]);
  React.useEffect(() => {
    setPercent(paymentPercentFromAmount(value.amount, total));
    if (document.activeElement !== form.current?.querySelector('[aria-label="Payment amount"]'))
      setAmountText(value.amount.toFixed(2));
  }, [value.amount, total]);
  const save = (): void => {
    if (
      !onSave ||
      !form.current ||
      !Array.from(form.current.querySelectorAll("input")).every((input) => input.checkValidity())
    )
      return;
    const snapshot = latest.current;
    if (
      !snapshot.title.trim() ||
      !Number.isFinite(snapshot.amount) ||
      snapshot.amount < 0 ||
      (maxAmount !== undefined && snapshot.amount > maxAmount + 0.005)
    )
      return;
    queue.current = queue.current.then(async () => {
      const serialized = JSON.stringify(snapshot);
      if (serialized === lastSaved.current || serialized !== JSON.stringify(latest.current)) return;
      setBusy(true);
      try {
        const result = await onSave(snapshot);
        if (result.ok) {
          lastSaved.current = serialized;
          setError(null);
        } else setError(result.error ?? "Could not save payment. Retry.");
      } catch {
        setError("Could not save payment. Retry.");
      } finally {
        setBusy(false);
      }
    });
  };
  const saveRef = React.useRef(save);
  saveRef.current = save;
  const autoSaveEnabled = Boolean(onSave);
  React.useEffect(() => {
    if (!autoSaveEnabled || JSON.stringify(value) === lastSaved.current) return;
    const timer = window.setTimeout(() => saveRef.current(), 500);
    return () => window.clearTimeout(timer);
  }, [value, autoSaveEnabled]);

  const updateDueDate = (dueDate: string) => {
    if (dueDate === (latest.current.dueDate ?? "")) return;
    const next = { ...latest.current, dueDate };
    latest.current = next;
    onChange(next);
  };

  return (
    <div
      ref={form}
      className="estimate-payment-entry"
      onDragOver={(event) => {
        if (
          !disabled &&
          onReorder &&
          event.dataTransfer.types.includes("application/x-estimate-payment")
        )
          event.preventDefault();
      }}
      onDrop={(event) => {
        const id = event.dataTransfer.getData("application/x-estimate-payment");
        if (!disabled && onReorder && id && id !== value.id) {
          event.preventDefault();
          onReorder(id, value.id);
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) save();
      }}
    >
      <div className="estimate-payment-entry-fields">
        <button
          type="button"
          className="estimate-payment-drag"
          aria-label={`Reorder ${value.title}`}
          disabled={disabled || !onReorder}
          draggable={!disabled && Boolean(onReorder)}
          onDragStart={(event) => {
            event.dataTransfer.setData("application/x-estimate-payment", value.id);
            event.dataTransfer.effectAllowed = "move";
          }}
        >
          <GripVertical size={14} />
        </button>
        <input
          aria-label="Milestone name"
          placeholder="Milestone name"
          value={value.title}
          required
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={(event) => onChange({ ...value, title: event.target.value })}
          onBlur={save}
        />
        <div className="estimate-payment-date-cell">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="estimate-payment-due-trigger"
                aria-label="Payment due"
                disabled={disabled}
              >
                {formatEstimatePaymentDueDate(value.dueDate) ?? "Upon Completion"}
                <ChevronDown size={12} aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="estimate-builder-menu"
              onCloseAutoFocus={(event) => {
                if (focusDateAfterMenu.current) {
                  event.preventDefault();
                  focusDateAfterMenu.current = false;
                  form.current
                    ?.querySelector<HTMLInputElement>('[aria-label="Payment due date"]')
                    ?.focus();
                }
              }}
            >
              <DropdownMenuRadioGroup
                value={value.dueDate || dateEditing ? "specific" : "completion"}
              >
                <DropdownMenuRadioItem
                  value="completion"
                  onSelect={() => {
                    setDateEditing(false);
                    onChange({ ...value, dueDate: null });
                  }}
                >
                  Upon Completion
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value="specific"
                  onSelect={() => {
                    focusDateAfterMenu.current = true;
                    setDateEditing(true);
                  }}
                >
                  Specific Date
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {dateEditing ? (
            <input
              aria-label="Payment due date"
              type="date"
              value={value.dueDate ?? ""}
              disabled={disabled}
              onInput={(event) => updateDueDate(event.currentTarget.value)}
              onChange={(event) => updateDueDate(event.currentTarget.value)}
              onBlur={(event) => {
                updateDueDate(event.currentTarget.value);
                save();
                setDateEditing(false);
              }}
            />
          ) : null}
        </div>
        <div
          className="estimate-payment-amount-cell"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null))
              setAmountEditing(false);
          }}
        >
          {!amountEditing ? (
            <button
              type="button"
              className="estimate-payment-value-display"
              disabled={disabled}
              onClick={() => {
                setAmountEditing(true);
                requestAnimationFrame(() =>
                  form.current
                    ?.querySelector<HTMLInputElement>('[aria-label="Payment amount"]')
                    ?.focus()
                );
              }}
            >
              {formatEstimateCurrency(value.amount)} <span>({percent || "0"}%)</span>
            </button>
          ) : null}
          <div className="estimate-payment-amount-edit" hidden={!amountEditing}>
            <label>
              <span aria-hidden="true">$</span>
              <input
                aria-label="Payment amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={amountText}
                required
                disabled={disabled}
                onChange={(event) => {
                  setAmountText(event.target.value);
                  const amount = event.target.valueAsNumber;
                  if (Number.isFinite(amount) && amount >= 0) onChange({ ...value, amount });
                }}
                onBlur={save}
              />
            </label>
            <label className="estimate-payment-percent-cell">
              <input
                aria-label="Percentage"
                title={total > 0 ? "% of Estimate total" : "Add scope pricing to use percentages"}
                type="number"
                min="0"
                max="100"
                step="0.01"
                inputMode="decimal"
                value={percent}
                disabled={disabled}
                onChange={(event) => {
                  const raw = event.target.value;
                  setPercent(raw);
                  const parsed = parsePaymentPercentInput(raw);
                  if (parsed !== null)
                    onChange({ ...value, amount: paymentAmountFromPercent(parsed, total) });
                }}
                onBlur={save}
              />
              <span aria-hidden="true">%</span>
            </label>
          </div>
        </div>

        <span ref={(node) => { if (node) node.inert = busy; }}>{actions}</span>
      </div>
      <details className="estimate-payment-entry-details">
        <summary>{value.description?.trim() ? "Note" : "Add note"}</summary>
        <EstimateNoteBody
          body={value.description ?? ""}
          label="Payment note"
          onChange={(description) => onChange({ ...value, description })}
          disabled={disabled}
          onBlur={save}
        />
      </details>
      {maxAmount !== undefined && value.amount > maxAmount + 0.005 ? (
        <p role="alert" className="text-xs text-destructive">
          This payment exceeds the remaining allocation.
        </p>
      ) : null}
      {onSave ? (
        <span
          role="status"
          className="estimate-payment-save-feedback text-xs text-muted-foreground"
        >
          {busy
            ? "Saving…"
            : error
              ? "Save failed"
              : JSON.stringify(value) !== lastSaved.current
                ? "Unsaved"
                : "Saved"}
        </span>
      ) : null}
      {error ? (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={save}>
            Retry
          </button>
        </p>
      ) : null}
    </div>
  );
}
