"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Divider, SectionHeader } from "@/components/base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateApBill } from "@/lib/data";
import { AP_BILL_TYPES } from "@/lib/data";
import type { ApBillWithProject } from "@/lib/data";

type Props = { bill: ApBillWithProject; projects: { id: string; name: string }[] };

export function EditBillClient({ bill, projects }: Props) {
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
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update bill.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <SectionHeader label="Bill details" />
      <Divider />
      <form onSubmit={handleSubmit} className="max-w-xl space-y-4 py-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Bill no.</label>
          <Input value={billNo} onChange={(e) => setBillNo(e.target.value)} className="mt-1 h-9" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Vendor / payee name *</label>
          <Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} className="mt-1 h-9" required />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Bill type</label>
          <select value={billType} onChange={(e) => setBillType(e.target.value as typeof billType)} className="mt-1 h-9 w-full rounded border border-input bg-transparent px-2 text-sm">
            {AP_BILL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Project</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="mt-1 h-9 w-full rounded border border-input bg-transparent px-2 text-sm">
            <option value="">—</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Issue date</label>
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="mt-1 h-9" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Due date</label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1 h-9" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Amount *</label>
          <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 h-9" required />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Category</label>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 h-9" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Notes</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 h-9" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Attachment URL</label>
          <Input value={attachmentUrl} onChange={(e) => setAttachmentUrl(e.target.value)} className="mt-1 h-9" placeholder="https://..." />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2 pt-2">
          <Button type="submit" size="sm" disabled={submitting}>{submitting ? "Saving…" : "Save"}</Button>
          <Button type="button" variant="outline" size="sm" asChild><Link href={`/bills/${bill.id}`}>Cancel</Link></Button>
        </div>
      </form>
    </>
  );
}
