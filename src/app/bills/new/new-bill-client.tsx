"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  NeoFieldLabel,
  NeoFormGrid,
  NeoInput,
  NeoPanel,
  NeoSelect,
  neoFormErrorClassName,
  neoFormFieldClassName,
} from "@/components/base";
import { Button } from "@/components/ui/button";
import { createApBill } from "@/lib/data";
import { AP_BILL_TYPES } from "@/lib/data";
import { cn } from "@/lib/utils";

type Props = {
  projects: { id: string; name: string }[];
  dataLoadWarning?: string | null;
};

const FORM_CARD_CLASS =
  "rounded-[1.25rem] border border-[rgb(190_198_210/0.14)] bg-[#111318] shadow-[0_1px_0_rgb(255_255_255/0.04)_inset,0_18px_48px_rgb(0_0_0/0.28)]";

const FORM_BODY_CLASS = "space-y-5 p-4 md:space-y-6 md:p-8";

const FIELD_CLASS = "mt-1.5 h-11 rounded-[0.625rem] text-[14px] max-md:min-h-11";

const DATE_INPUT_CLASS =
  "tabular-nums [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-55";

const AMOUNT_INPUT_CLASS =
  "neo-amount tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

const PRIMARY_BUTTON_CLASS =
  "h-11 rounded-[0.625rem] border-transparent bg-[var(--neo-gold)] text-zinc-950 hover:bg-[var(--neo-gold-soft)] focus-visible:ring-[var(--neo-gold-ring)]";

const SECONDARY_BUTTON_CLASS =
  "h-11 rounded-[0.625rem] border-[var(--neo-border)] bg-[var(--neo-surface-raised)] text-[var(--neo-text-primary)] hover:bg-[var(--neo-surface-muted)] hover:text-[var(--neo-text-primary)]";

export function NewBillClient({ projects, dataLoadWarning = null }: Props) {
  const router = useRouter();
  const [vendorName, setVendorName] = React.useState("");
  const [billType, setBillType] = React.useState<
    "Vendor" | "Labor" | "Overhead" | "Utility" | "Permit" | "Equipment" | "Other"
  >("Vendor");
  const [projectId, setProjectId] = React.useState("");
  const [issueDate, setIssueDate] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const vendor = vendorName.trim();
    if (!vendor) {
      setError("Vendor / payee name is required.");
      return;
    }
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt < 0) {
      setError("Enter a valid amount.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const bill = await createApBill({
        vendor_name: vendor,
        bill_type: billType,
        project_id: projectId || null,
        issue_date: issueDate || null,
        due_date: dueDate || null,
        amount: amt,
        category: category.trim() || null,
        notes: notes.trim() || null,
      });
      router.push(`/bills/${bill.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create bill.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1000px]">
      {dataLoadWarning ? (
        <p
          className="mb-4 rounded-lg border border-[rgb(184_147_90/0.24)] bg-[rgb(184_147_90/0.10)] px-3 py-2 text-[12px] leading-snug text-[var(--neo-text-primary)]"
          role="status"
        >
          {dataLoadWarning}
        </p>
      ) : null}

      <NeoPanel title="Bill details" className={FORM_CARD_CLASS} bodyClassName={FORM_BODY_CLASS}>
        <form onSubmit={handleSubmit} className="min-w-0 space-y-5 md:space-y-6">
          <div className={neoFormFieldClassName}>
            <NeoFieldLabel required>Vendor / payee name</NeoFieldLabel>
            <NeoInput
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              className={FIELD_CLASS}
              required
            />
          </div>

          <div className={neoFormFieldClassName}>
            <NeoFieldLabel>Bill type</NeoFieldLabel>
            <NeoSelect
              value={billType}
              onChange={(e) => setBillType(e.target.value as typeof billType)}
              className={FIELD_CLASS}
            >
              {AP_BILL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </NeoSelect>
          </div>

          <div className={neoFormFieldClassName}>
            <NeoFieldLabel>Project</NeoFieldLabel>
            <NeoSelect
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className={FIELD_CLASS}
            >
              <option value="">—</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NeoSelect>
          </div>

          <NeoFormGrid className="gap-5 md:gap-6">
            <div className={neoFormFieldClassName}>
              <NeoFieldLabel>Issue date</NeoFieldLabel>
              <NeoInput
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className={cn(FIELD_CLASS, DATE_INPUT_CLASS)}
              />
            </div>
            <div className={neoFormFieldClassName}>
              <NeoFieldLabel>Due date</NeoFieldLabel>
              <NeoInput
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={cn(FIELD_CLASS, DATE_INPUT_CLASS)}
              />
            </div>
          </NeoFormGrid>

          <div className={neoFormFieldClassName}>
            <NeoFieldLabel required>Amount</NeoFieldLabel>
            <NeoInput
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={cn(FIELD_CLASS, AMOUNT_INPUT_CLASS)}
              placeholder="0.00"
              required
            />
          </div>

          <div className={neoFormFieldClassName}>
            <NeoFieldLabel>Category</NeoFieldLabel>
            <NeoInput
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={FIELD_CLASS}
            />
          </div>

          <div className={neoFormFieldClassName}>
            <NeoFieldLabel>Notes</NeoFieldLabel>
            <NeoInput
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={FIELD_CLASS}
            />
          </div>

          {error ? <p className={neoFormErrorClassName}>{error}</p> : null}

          <div
            className={cn(
              "flex flex-col gap-2 border-t border-[var(--neo-border)] pt-5 sm:flex-row sm:items-center",
              "max-md:[&_button]:min-h-11 max-md:[&_button]:w-full"
            )}
          >
            <Button
              type="submit"
              size="touch"
              className={PRIMARY_BUTTON_CLASS}
              disabled={submitting}
            >
              {submitting ? "Creating…" : "Create bill"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="touch"
              className={SECONDARY_BUTTON_CLASS}
              asChild
            >
              <Link href="/bills">Cancel</Link>
            </Button>
          </div>
        </form>
      </NeoPanel>
    </div>
  );
}
