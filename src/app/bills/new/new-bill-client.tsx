"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Divider, SectionHeader } from "@/components/base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createApBill } from "@/lib/data";
import { AP_BILL_TYPES } from "@/lib/data";

type Props = { projects: { id: string; name: string }[] };

export function NewBillClient({ projects }: Props) {
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
    <>
      <SectionHeader label="Bill details" />
      <Divider />
      <form onSubmit={handleSubmit} className="max-w-xl space-y-4 py-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Vendor / payee name *</label>
          <Input
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
            className="mt-1"
            required
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Bill type</label>
          <select
            value={billType}
            onChange={(e) => setBillType(e.target.value as typeof billType)}
            className="mt-1 min-h-[44px] w-full rounded border border-input bg-transparent px-2 text-sm md:min-h-0 md:h-9"
          >
            {AP_BILL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Project</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="mt-1 min-h-[44px] w-full rounded border border-input bg-transparent px-2 text-sm md:min-h-0 md:h-9"
          >
            <option value="">—</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Issue date</label>
            <Input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Due date</label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Amount *</label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1"
            placeholder="0.00"
            required
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Category</label>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Notes</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-col gap-2 pt-2 sm:flex-row">
          <Button type="submit" size="touch" className="min-h-[44px]" disabled={submitting}>
            {submitting ? "Creating…" : "Create bill"}
          </Button>
          <Button type="button" variant="outline" size="touch" className="min-h-[44px]" asChild>
            <Link href="/bills">Cancel</Link>
          </Button>
        </div>
      </form>
    </>
  );
}
