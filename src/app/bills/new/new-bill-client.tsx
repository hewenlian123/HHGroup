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
import { AP_BILL_TYPES } from "@/lib/data";
import { cn } from "@/lib/utils";
import { BillCategoryCombobox } from "../bill-category-combobox";
import {
  billsAmountInputClass,
  billsDateInputClass,
  billsFieldClass,
  billsFormBodyClass,
  billsFormCardClass,
  billsPrimaryButtonClass,
  billsSecondaryButtonClass,
} from "../bills-ui-styles";

type Props = {
  projects: { id: string; name: string }[];
  subcontractors?: { id: string; name: string; active: boolean }[];
  subcontracts?: {
    id: string;
    subcontractor_id: string;
    project_id: string;
    subcontractor_name: string;
    project_name: string;
    status: string;
    cost_code: string | null;
    description: string | null;
  }[];
  dataLoadWarning?: string | null;
};

async function readApiMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
  return typeof body?.message === "string" ? body.message : fallback;
}

function isActiveSubcontract(status: string | null | undefined): boolean {
  const normalized = (status ?? "Active").trim().toLowerCase();
  return !normalized || normalized === "active";
}

function subcontractOptionLabel(subcontract: NonNullable<Props["subcontracts"]>[number]): string {
  const project = subcontract.project_name || "Unassigned project";
  const scope = subcontract.cost_code || subcontract.description;
  return scope ? `${project} - ${scope}` : project;
}

export function NewBillClient({
  projects,
  subcontractors = [],
  subcontracts = [],
  dataLoadWarning = null,
}: Props) {
  const router = useRouter();
  const [billNo, setBillNo] = React.useState("");
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
  const [selectedSubcontractorId, setSelectedSubcontractorId] = React.useState("");
  const [selectedSubcontractId, setSelectedSubcontractId] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const lastSuggestedVendorRef = React.useRef<string | null>(null);

  const activeSubcontractors = React.useMemo(
    () => subcontractors.filter((subcontractor) => subcontractor.active !== false),
    [subcontractors]
  );
  const selectedSubcontractor = React.useMemo(
    () =>
      activeSubcontractors.find((subcontractor) => subcontractor.id === selectedSubcontractorId),
    [activeSubcontractors, selectedSubcontractorId]
  );
  const availableSubcontracts = React.useMemo(
    () =>
      subcontracts.filter(
        (subcontract) =>
          subcontract.subcontractor_id === selectedSubcontractorId &&
          isActiveSubcontract(subcontract.status)
      ),
    [selectedSubcontractorId, subcontracts]
  );
  const selectedSubcontract = React.useMemo(
    () => availableSubcontracts.find((subcontract) => subcontract.id === selectedSubcontractId),
    [availableSubcontracts, selectedSubcontractId]
  );

  function suggestVendorName(name: string | null | undefined) {
    const next = (name ?? "").trim();
    if (!next || next === "—") return;
    setVendorName((current) => {
      if (!current.trim() || current === lastSuggestedVendorRef.current) {
        lastSuggestedVendorRef.current = next;
        return next;
      }
      return current;
    });
  }

  function handleSubcontractorChange(value: string) {
    setSelectedSubcontractorId(value);
    setSelectedSubcontractId("");
    if (!value) return;
    const subcontractor = activeSubcontractors.find((item) => item.id === value);
    suggestVendorName(subcontractor?.name);
  }

  function handleSubcontractChange(value: string) {
    setSelectedSubcontractId(value);
    if (!value) return;
    const subcontract = availableSubcontracts.find((item) => item.id === value);
    if (!subcontract) return;
    if (subcontract.project_id) setProjectId(subcontract.project_id);
    suggestVendorName(subcontract.subcontractor_name || selectedSubcontractor?.name);
  }

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
      const linkedProjectId = selectedSubcontract?.project_id || projectId || null;
      const response = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bill_no: billNo.trim() || null,
          vendor_name: vendor,
          bill_type: billType,
          project_id: linkedProjectId,
          issue_date: issueDate || null,
          due_date: dueDate || null,
          amount: amt,
          category: category.trim() || null,
          notes: notes.trim() || null,
          subcontractor_id:
            selectedSubcontractorId || selectedSubcontract?.subcontractor_id || null,
          subcontract_id: selectedSubcontractId || null,
        }),
      });
      if (!response.ok) {
        throw new Error(await readApiMessage(response, "Failed to create bill."));
      }
      const body = (await response.json()) as { bill?: { id?: unknown } };
      const id = typeof body.bill?.id === "string" ? body.bill.id : null;
      if (!id) throw new Error("Failed to create bill.");
      router.push(`/bills/${id}`);
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
          className="mb-4 rounded-hh-standard border border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] px-3 py-2 text-hh-helper text-[var(--hh-warning)]"
          role="status"
        >
          {dataLoadWarning}
        </p>
      ) : null}

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
              placeholder="BILL-001"
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
            <NeoFieldLabel htmlFor="bill-type">Bill type</NeoFieldLabel>
            <NeoSelect
              id="bill-type"
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
            <NeoFieldLabel htmlFor="bill-project">Project</NeoFieldLabel>
            <NeoSelect
              id="bill-project"
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
              <NeoFieldLabel htmlFor="bill-subcontractor">Subcontractor</NeoFieldLabel>
              <NeoSelect
                id="bill-subcontractor"
                value={selectedSubcontractorId}
                onChange={(e) => handleSubcontractorChange(e.target.value)}
                className={billsFieldClass}
              >
                <option value="">—</option>
                {activeSubcontractors.map((subcontractor) => (
                  <option key={subcontractor.id} value={subcontractor.id}>
                    {subcontractor.name}
                  </option>
                ))}
              </NeoSelect>
            </div>
            <div className={neoFormFieldClassName}>
              <NeoFieldLabel htmlFor="bill-subcontract">Subcontract / Contract</NeoFieldLabel>
              <NeoSelect
                id="bill-subcontract"
                value={selectedSubcontractId}
                onChange={(e) => handleSubcontractChange(e.target.value)}
                className={billsFieldClass}
                disabled={!selectedSubcontractorId || availableSubcontracts.length === 0}
              >
                <option value="">—</option>
                {availableSubcontracts.map((subcontract) => (
                  <option key={subcontract.id} value={subcontract.id}>
                    {subcontractOptionLabel(subcontract)}
                  </option>
                ))}
              </NeoSelect>
            </div>
          </NeoFormGrid>

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
              placeholder="0.00"
              required
            />
          </div>

          <div className={neoFormFieldClassName}>
            <NeoFieldLabel>Category</NeoFieldLabel>
            <BillCategoryCombobox
              value={category}
              onChange={setCategory}
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

          {error ? <p className={neoFormErrorClassName}>{error}</p> : null}

          <div
            className={cn(
              "flex flex-col gap-2 border-t border-[var(--hh-border)] pt-5 sm:flex-row sm:items-center",
              "max-md:[&_button]:min-h-11 max-md:[&_button]:w-full"
            )}
          >
            <Button
              type="submit"
              size="touch"
              className={billsPrimaryButtonClass}
              disabled={submitting}
            >
              {submitting ? "Creating…" : "Create bill"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="touch"
              className={billsSecondaryButtonClass}
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
