"use client";

import { financePathWithReturn } from "@/lib/finance-navigation";
import { computeInvoiceTotals } from "@/lib/money";
import { parseDecimalDraft } from "@/lib/decimal-draft";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { NeoFieldLabel, NeoInput, NeoSelect } from "@/components/base";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { useToast } from "@/components/toast/toast-provider";
import { createBrowserClient } from "@/lib/supabase";
import type { InvoiceWithDerived } from "@/lib/data";
import { ArrowLeft } from "lucide-react";
import { updateInvoiceAction } from "../../actions";
import {
  invoiceLineDraftToInput,
  invoiceLineHasContent,
  invoiceLinesToDrafts,
  type InvoiceLineDraft,
} from "@/app/financial/invoices/_components/invoice-line-draft";
import {
  DecimalDraftField,
  InvoiceLineList,
} from "@/app/financial/invoices/_components/invoice-line-list";
import {
  InvoiceBillingHistory,
  InvoiceEditorShell,
  InvoiceEditorSummary,
  invoiceEditorFieldClass,
  invoiceEditorLabelClass,
} from "@/app/financial/invoices/_components/invoice-editor-shell";
import { useInvoiceContractBilling } from "@/app/financial/invoices/_components/use-invoice-contract-billing";

type ProjectOption = { id: string; name: string; address?: string | null };
type CustomerOption = { id: string; name: string | null; email?: string | null };

const cardClass =
  "rounded-card border border-[var(--hh-line)] bg-[var(--hh-surface)] p-4 shadow-card sm:p-5";

export default function EditInvoiceClient({
  invoice,
  initialProjectName,
}: {
  invoice: InvoiceWithDerived;
  initialProjectName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const detailHref = financePathWithReturn(
    `/financial/invoices/${invoice.id}`,
    searchParams.get("returnTo")
  );
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = React.useState(false);

  const [projects, setProjects] = React.useState<ProjectOption[]>([]);
  const [customers, setCustomers] = React.useState<CustomerOption[]>([]);

  const [projectId, setProjectId] = React.useState<string>(invoice.projectId ?? "");
  const [customerId, setCustomerId] = React.useState<string>(invoice.customerId ?? "");
  const [invoiceNo, setInvoiceNo] = React.useState<string>(invoice.invoiceNo ?? "");
  const [clientName, setClientName] = React.useState<string>(invoice.clientName ?? "");
  const [issueDate, setIssueDate] = React.useState<string>((invoice.issueDate ?? "").slice(0, 10));
  const [dueDate, setDueDate] = React.useState<string>((invoice.dueDate ?? "").slice(0, 10));
  const [taxDraft, setTaxDraft] = React.useState<string>(String(invoice.taxPct ?? 0));
  const [notes, setNotes] = React.useState<string>(invoice.notes ?? "");
  const [lines, setLines] = React.useState<InvoiceLineDraft[]>(() =>
    invoiceLinesToDrafts(invoice.lineItems)
  );

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );
  const contractBilling = useInvoiceContractBilling(supabase, projectId, invoice.id);

  const load = React.useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      setError(configured ? "Supabase client unavailable." : "Supabase is not configured.");
      return;
    }
    setLoading(true);
    setError(null);

    const [{ data: proj, error: projErr }, { data: cust, error: custErr }] = await Promise.all([
      supabase
        .from("projects")
        .select("id,name,address")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("customers")
        .select("id,name,email")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    if (projErr) setError(projErr.message);
    setProjects(((proj ?? []) as ProjectOption[]).filter((project) => project.id && project.name));

    if (custErr) {
      const code = (custErr as { code?: string }).code;
      if (code !== "42P01") setError((previous) => previous ?? custErr.message);
      setCustomers([]);
    } else {
      setCustomers((cust ?? []) as CustomerOption[]);
    }

    setLoading(false);
  }, [supabase, configured]);

  React.useEffect(() => {
    void load();
  }, [load]);

  useOnAppSync(
    React.useCallback(() => {
      void load();
    }, [load]),
    [load]
  );

  React.useEffect(() => {
    const selected = customers.find((customer) => customer.id === customerId)?.name?.trim() ?? "";
    if (customerId && selected) setClientName(selected);
  }, [customerId, customers]);

  const taxPct = parseDecimalDraft(taxDraft);
  const invoiceTotals = React.useMemo(
    () =>
      computeInvoiceTotals(
        lines.map((line) => ({
          qty: parseDecimalDraft(line.qty),
          unitPrice: parseDecimalDraft(line.unitPrice),
        })),
        taxPct
      ),
    [lines, taxPct]
  );

  const validationErrors = React.useMemo(() => {
    const errors: string[] = [];
    if (!projectId) errors.push("Project is required.");
    if (!clientName.trim()) errors.push("Client name is required.");
    if (!lines.some(invoiceLineHasContent)) errors.push("At least one line item is required.");
    return errors;
  }, [clientName, lines, projectId]);

  const currentProjectOptionMissing =
    Boolean(projectId) && !projects.some((project) => project.id === projectId);
  const canSubmit = !loading && !saving;
  const selectedProject = projects.find((project) => project.id === projectId);
  const selectedCustomer = customers.find((customer) => customer.id === customerId);

  const updateLine = React.useCallback((index: number, patch: Partial<InvoiceLineDraft>) => {
    setLines((previous) =>
      previous.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line))
    );
  }, []);

  const addLine = React.useCallback(() => {
    setLines((previous) => [
      ...previous,
      { itemName: "", description: "", qty: "1", unitPrice: "0" },
    ]);
  }, []);

  const removeLine = React.useCallback((index: number) => {
    setLines((previous) =>
      previous.length <= 1 ? previous : previous.filter((_, i) => i !== index)
    );
  }, []);

  const handleSave = async () => {
    if (saving || loading) return;
    setSubmitAttempted(true);
    if (validationErrors.length > 0) {
      const msg = validationErrors[0] ?? "Please complete the invoice.";
      setError(msg);
      toast({ title: "Invoice is incomplete", description: msg, variant: "error" });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await updateInvoiceAction(invoice.id, {
        invoiceNo,
        projectId,
        customerId: customerId || null,
        clientName,
        issueDate,
        dueDate,
        taxPct: Math.max(0, taxPct),
        notes,
        lineItems: lines.map(invoiceLineDraftToInput),
      });

      if (!result.ok) {
        const msg = result.error ?? "Failed to save invoice.";
        setError(msg);
        toast({ title: "Could not save invoice", description: msg, variant: "error" });
        return;
      }

      toast({ title: "Invoice saved", variant: "success" });
      router.push(detailHref);
    } catch (saveError) {
      const msg = saveError instanceof Error ? saveError.message : "Failed to save invoice.";
      setError(msg);
      toast({ title: "Could not save invoice", description: msg, variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (invoice.status !== "Draft") {
    return (
      <div data-revenue-ar-v2 className="mx-auto w-full max-w-[1120px] px-4 py-6 sm:px-6 lg:px-10">
        <Button asChild variant="ghost" size="sm">
          <Link href={detailHref}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to invoice
          </Link>
        </Button>
        <h1 className="mt-4 text-title-page text-[var(--hh-ink)]">{invoice.invoiceNo}</h1>
        <p className="mt-2 text-[var(--hh-text)]">Only draft invoices can be edited.</p>
      </div>
    );
  }

  return (
    <div data-revenue-ar-v2 data-testid="invoice-editor">
      <InvoiceEditorShell
        header={
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-hh-label font-[650] uppercase tracking-[0.08em] text-[var(--hh-muted)]">
                  Invoice
                </p>
                <InvoiceStatusBadge status={invoice.computedStatus} />
              </div>
              <h1 className="mt-1 break-words text-[26px] font-[650] leading-8 tracking-[-0.022em] text-[var(--hh-ink)] lg:text-title-page">
                {invoice.invoiceNo || "Invoice"}
              </h1>
              <p className="mt-1 text-hh-metadata text-[var(--hh-muted)]">
                {selectedProject?.name || initialProjectName || "No project"} · {lines.length} line
                {lines.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary">
                <Link href={`/financial/invoices/${invoice.id}/preview`}>Preview</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href={detailHref}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to invoice
                </Link>
              </Button>
            </div>
          </div>
        }
        banner={
          error ? (
            <p className="rounded-card border border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] px-4 py-3 text-[13px] font-medium text-[var(--hh-danger)]">
              {error}
            </p>
          ) : null
        }
        parties={
          <section className={cardClass}>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-44 bg-[var(--hh-chip)]" />
                <Skeleton className="h-11 w-full bg-[var(--hh-chip)]" />
                <Skeleton className="h-11 w-full bg-[var(--hh-chip)]" />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <h2 className="text-title-card text-[var(--hh-ink)]">Bill to</h2>
                </div>
                <div className="sm:col-span-1">
                  <NeoFieldLabel
                    htmlFor="invoice-edit-page-client-name"
                    required
                    className={invoiceEditorLabelClass}
                  >
                    Client name
                  </NeoFieldLabel>
                  <NeoInput
                    id="invoice-edit-page-client-name"
                    data-testid="invoice-edit-client-input"
                    value={clientName}
                    onChange={(event) => setClientName(event.target.value)}
                    placeholder="Client"
                    className={invoiceEditorFieldClass}
                    aria-invalid={submitAttempted && !clientName.trim()}
                  />
                  {selectedCustomer?.email ? (
                    <p className="mt-1 text-hh-metadata text-[var(--hh-muted)]">
                      {selectedCustomer.email}
                    </p>
                  ) : null}
                  {submitAttempted && !clientName.trim() ? (
                    <p className="mt-1 text-hh-metadata font-medium text-[var(--hh-danger)]">
                      Client name is required.
                    </p>
                  ) : null}
                </div>

                <div>
                  <NeoFieldLabel
                    htmlFor="invoice-edit-page-project"
                    required
                    className={invoiceEditorLabelClass}
                  >
                    Project
                  </NeoFieldLabel>
                  <NeoSelect
                    id="invoice-edit-page-project"
                    data-testid="invoice-edit-project-select"
                    value={projectId}
                    onChange={(event) => setProjectId(event.target.value)}
                    className={invoiceEditorFieldClass}
                    aria-invalid={submitAttempted && !projectId}
                  >
                    <option value="">Select project</option>
                    {currentProjectOptionMissing ? (
                      <option value={projectId}>{initialProjectName}</option>
                    ) : null}
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </NeoSelect>
                  {selectedProject?.address ? (
                    <p className="mt-1 text-hh-metadata text-[var(--hh-muted)]">
                      {selectedProject.address}
                    </p>
                  ) : null}
                  {submitAttempted && !projectId ? (
                    <p className="mt-1 text-hh-metadata font-medium text-[var(--hh-danger)]">
                      Project is required.
                    </p>
                  ) : null}
                </div>

                <div>
                  <NeoFieldLabel
                    htmlFor="invoice-edit-page-issue-date"
                    className={invoiceEditorLabelClass}
                  >
                    Issue date
                  </NeoFieldLabel>
                  <NeoInput
                    id="invoice-edit-page-issue-date"
                    data-testid="invoice-edit-issue-date-input"
                    type="date"
                    value={issueDate}
                    onChange={(event) =>
                      setIssueDate((event.target.value || issueDate).slice(0, 10))
                    }
                    onInput={(event) =>
                      setIssueDate((event.currentTarget.value || issueDate).slice(0, 10))
                    }
                    className={invoiceEditorFieldClass}
                  />
                </div>

                <div>
                  <NeoFieldLabel
                    htmlFor="invoice-edit-page-due-date"
                    className={invoiceEditorLabelClass}
                  >
                    Due date
                  </NeoFieldLabel>
                  <NeoInput
                    id="invoice-edit-page-due-date"
                    data-testid="invoice-edit-due-date-input"
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate((event.target.value || dueDate).slice(0, 10))}
                    onInput={(event) =>
                      setDueDate((event.currentTarget.value || dueDate).slice(0, 10))
                    }
                    className={invoiceEditorFieldClass}
                  />
                </div>

                <div>
                  <NeoFieldLabel
                    htmlFor="invoice-edit-page-customer"
                    className={invoiceEditorLabelClass}
                  >
                    Customer (optional)
                  </NeoFieldLabel>
                  <NeoSelect
                    id="invoice-edit-page-customer"
                    value={customerId}
                    onChange={(event) => setCustomerId(event.target.value)}
                    className={invoiceEditorFieldClass}
                  >
                    <option value="">Select customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name || "Unnamed customer"}
                      </option>
                    ))}
                  </NeoSelect>
                </div>

                <div>
                  <NeoFieldLabel
                    htmlFor="invoice-edit-page-number"
                    className={invoiceEditorLabelClass}
                  >
                    Invoice number
                  </NeoFieldLabel>
                  <NeoInput
                    id="invoice-edit-page-number"
                    data-testid="invoice-edit-number-input"
                    value={invoiceNo}
                    onChange={(event) => setInvoiceNo(event.target.value)}
                    placeholder="Invoice number"
                    className={invoiceEditorFieldClass}
                  />
                </div>
              </div>
            )}
          </section>
        }
        lines={
          <InvoiceLineList
            lines={lines}
            idPrefix="invoice-edit"
            subtotal={invoiceTotals.subtotal}
            saving={saving}
            submitAttempted={submitAttempted}
            onChange={updateLine}
            onAdd={addLine}
            onRemove={removeLine}
          />
        }
        notes={
          <section className={cardClass}>
            <NeoFieldLabel htmlFor="invoice-edit-page-notes" className={invoiceEditorLabelClass}>
              Notes (optional)
            </NeoFieldLabel>
            <textarea
              id="invoice-edit-page-notes"
              data-testid="invoice-edit-notes-input"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Terms / notes"
              rows={4}
              className="mt-1.5 min-h-[88px] w-full rounded-hh-standard border border-[var(--hh-line-input)] bg-[var(--hh-surface)] px-3 py-2 text-[13px] text-[var(--hh-ink)] placeholder:text-[var(--hh-placeholder)] focus:border-[var(--hh-link)] focus:outline-none"
            />
          </section>
        }
        summary={
          <InvoiceEditorSummary
            subtotal={invoiceTotals.subtotal}
            taxAmount={invoiceTotals.taxAmount}
            total={invoiceTotals.total}
            billing={contractBilling}
            thisInvoiceExTax={invoiceTotals.subtotal}
            alert={submitAttempted ? validationErrors[0] : null}
            taxControl={
              <div>
                <NeoFieldLabel htmlFor="invoice-edit-page-tax" className={invoiceEditorLabelClass}>
                  Tax %
                </NeoFieldLabel>
                <DecimalDraftField
                  id="invoice-edit-page-tax"
                  data-testid="invoice-edit-tax-input"
                  value={taxDraft}
                  onValue={setTaxDraft}
                  className={invoiceEditorFieldClass}
                />
              </div>
            }
            actions={
              <>
                <Button onClick={handleSave} disabled={!canSubmit} className="min-h-11 w-full">
                  <SubmitSpinner loading={saving} className="mr-2" />
                  {saving ? "Saving..." : "Save changes"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => router.push(detailHref)}
                  disabled={saving}
                  className="min-h-11 w-full"
                >
                  Cancel
                </Button>
              </>
            }
          />
        }
        history={<InvoiceBillingHistory billing={contractBilling} currentInvoiceId={invoice.id} />}
      />
    </div>
  );
}
