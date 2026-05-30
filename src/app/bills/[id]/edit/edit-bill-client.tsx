"use client";

import { syncRouterNonBlocking } from "@/components/perf/sync-router-non-blocking";
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
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { updateApBill } from "@/lib/data";
import { AP_BILL_TYPES } from "@/lib/data";
import type { ApBillWithProject } from "@/lib/data";
import { cn } from "@/lib/utils";
import { BillCategoryCombobox } from "../../bill-category-combobox";
import {
  billsAmountInputClass,
  billsDateInputClass,
  billsFieldClass,
  billsFormBodyClass,
  billsFormCardClass,
  billsPrimaryButtonClass,
  billsSecondaryButtonClass,
} from "../../bills-ui-styles";

type Props = {
  bill: ApBillWithProject;
  projects: { id: string; name: string }[];
  learnedCategories?: string[];
};

export function EditBillClient({ bill, projects, learnedCategories = [] }: Props) {
  const router = useRouter();
  const [billNo, setBillNo] = React.useState(bill.bill_no ?? "");
  const [vendorName, setVendorName] = React.useState(bill.vendor_name);
  const [billType, setBillType] = React.useState(bill.bill_type);
  const [projectId, setProjectId] = React.useState(bill.project_id ?? "");
  const [issueDate, setIssueDate] = React.useState(bill.issue_date ?? "");
  const [dueDate, setDueDate] = React.useState(bill.due_date ?? "");
  const [amount, setAmount] = React.useState(String(bill.amount));
  const [category, setCategory] = React.useState(bill.category ?? "");
  const [notes, setNotes] = React.useState(bill.notes ?? "");
  const [attachmentUrl, setAttachmentUrl] = React.useState(bill.attachment_url ?? "");
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
      await updateApBill(bill.id, {
        bill_no: billNo.trim() || null,
        vendor_name: vendor,
        bill_type: billType,
        project_id: projectId || null,
        issue_date: issueDate || null,
        due_date: dueDate || null,
        amount: amt,
        category: category.trim() || null,
        notes: notes.trim() || null,
        attachment_url: attachmentUrl.trim() || null,
      });
      router.push(`/bills/${bill.id}`);
      syncRouterNonBlocking(router);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update bill.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1000px]">
      <NeoPanel
        title="Bill details"
        className={billsFormCardClass}
        bodyClassName={billsFormBodyClass}
      >
        <form onSubmit={handleSubmit} className="min-w-0 space-y-5 md:space-y-6">
          <div className={neoFormFieldClassName}>
            <NeoFieldLabel>Bill no.</NeoFieldLabel>
            <NeoInput
              value={billNo}
              onChange={(e) => setBillNo(e.target.value)}
              className={billsFieldClass}
            />
          </div>

          <div className={neoFormFieldClassName}>
            <NeoFieldLabel required>Vendor / payee name</NeoFieldLabel>
            <NeoInput
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              className={billsFieldClass}
              required
            />
          </div>

          <div className={neoFormFieldClassName}>
            <NeoFieldLabel>Bill type</NeoFieldLabel>
            <NeoSelect
              value={billType}
              onChange={(e) => setBillType(e.target.value as typeof billType)}
              className={billsFieldClass}
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
              className={billsFieldClass}
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
                className={cn(billsFieldClass, billsDateInputClass)}
              />
            </div>
            <div className={neoFormFieldClassName}>
              <NeoFieldLabel>Due date</NeoFieldLabel>
              <NeoInput
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={cn(billsFieldClass, billsDateInputClass)}
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
              className={cn(billsFieldClass, billsAmountInputClass)}
              required
            />
          </div>

          <div className={neoFormFieldClassName}>
            <NeoFieldLabel>Category</NeoFieldLabel>
            <BillCategoryCombobox
              value={category}
              onChange={setCategory}
              learnedCategories={learnedCategories}
              inputClassName={billsFieldClass}
            />
          </div>

          <div className={neoFormFieldClassName}>
            <NeoFieldLabel>Notes</NeoFieldLabel>
            <NeoInput
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={billsFieldClass}
            />
          </div>

          <div className={neoFormFieldClassName}>
            <NeoFieldLabel>Attachment URL</NeoFieldLabel>
            <NeoInput
              value={attachmentUrl}
              onChange={(e) => setAttachmentUrl(e.target.value)}
              className={billsFieldClass}
              placeholder="https://..."
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
              className={billsPrimaryButtonClass}
              disabled={submitting}
            >
              <SubmitSpinner loading={submitting} className="mr-2" />
              {submitting ? "Saving…" : "Save changes"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="touch"
              className={billsSecondaryButtonClass}
              asChild
            >
              <Link href={`/bills/${bill.id}`}>Cancel</Link>
            </Button>
          </div>
        </form>
      </NeoPanel>
    </div>
  );
}
