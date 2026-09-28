"use client";

import { computeInvoiceTotals } from "@/lib/money";
import { decimalDraftFromNumber, parseDecimalDraft } from "@/lib/decimal-draft";
import * as React from "react";
import Link from "next/link";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { useRouter } from "next/navigation";
import { NeoFieldLabel, NeoInput, NeoSelect, NeoPanel } from "@/components/base";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/components/toast/toast-provider";
import { createInvoiceDraftAction } from "./actions";
import { getCompanyProfile } from "@/lib/company-profile";
import { formatCurrency } from "@/lib/formatters";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import type { EstimateInvoicePrefillResult } from "./estimate-prefill";
import {
  appendEstimateReturnPath,
  safeEstimateReturnPath,
} from "@/app/estimates/_components/estimate-workflow-continuity";
import {
  invoiceLineDraftToInput,
  invoiceLineHasContent,
  newInvoiceLineDraft,
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
import "./estimate-origin-invoice-operational.css";

type ProjectOption = { id: string; name: string; address?: string | null };
type CustomerOption = { id: string; name: string | null; email?: string | null };

export type ProjectInvoicePrefill = {
  projectId: string;
  projectName: string;
  customerId: string | null;
  customerName: string | null;
};

const cardClass =
  "rounded-card border border-[var(--hh-line)] bg-[var(--hh-surface)] p-4 shadow-card sm:p-5";

function isMissingTableError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "42P01";
}

export default function NewInvoiceClient({
  estimatePrefill,
  projectPrefill,
  estimateReturnPath,
}: {
  estimatePrefill?: EstimateInvoicePrefillResult | null;
  projectPrefill?: ProjectInvoicePrefill | null;
  estimateReturnPath?: string | null;
}) {
  const prefill = estimatePrefill?.ok ? estimatePrefill.prefill : null;
  const safeEstimateReturn = safeEstimateReturnPath(estimateReturnPath);
  const isEstimateOrigin = Boolean(estimatePrefill || safeEstimateReturn);
  const projectContextPrefill = React.useMemo(
    () =>
      prefill || !projectPrefill
        ? null
        : {
            projectId: projectPrefill.projectId,
            projectName: projectPrefill.projectName,
            customerId: projectPrefill.customerId ?? "",
            customerName: projectPrefill.customerName ?? "",
          },
    [prefill, projectPrefill]
  );
  const initialProjectId = prefill?.projectId ?? projectContextPrefill?.projectId ?? "";
  const initialCustomerId = prefill?.customerId ?? projectContextPrefill?.customerId ?? "";
  const initialClientName = prefill?.customerName ?? projectContextPrefill?.customerName ?? "";
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(
    estimatePrefill && !estimatePrefill.ok ? estimatePrefill.error : null
  );
  const [submitAttempted, setSubmitAttempted] = React.useState(false);

  const [projects, setProjects] = React.useState<ProjectOption[]>([]);
  const [customers, setCustomers] = React.useState<CustomerOption[]>([]);

  const [projectId, setProjectId] = React.useState<string>(initialProjectId);
  const [customerId, setCustomerId] = React.useState<string>(initialCustomerId);
  const [invoiceNo, setInvoiceNo] = React.useState<string>("");
  const [clientName, setClientName] = React.useState<string>(initialClientName);

  const today = new Date().toISOString().slice(0, 10);
  const [issueDate, setIssueDate] = React.useState<string>(today);
  const [dueDate, setDueDate] = React.useState<string>(prefill?.dueDate || today);
  const [taxDraft, setTaxDraft] = React.useState<string>(
    decimalDraftFromNumber(prefill?.invoiceTaxPct ?? 0)
  );
  const [taxTouched, setTaxTouched] = React.useState(Boolean(prefill));
  const [notes, setNotes] = React.useState<string>(prefill?.notes ?? "");
  const [lines, setLines] = React.useState<InvoiceLineDraft[]>([
    newInvoiceLineDraft(
      prefill
        ? {
            itemName: prefill.milestoneTitle,
            description: prefill.milestoneDescription,
            unitPrice: prefill.invoiceSubtotal,
          }
        : undefined
    ),
  ]);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );
  const contractBilling = useInvoiceContractBilling(supabase, projectId, null);

  const load = React.useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      setError(configured ? "Supabase client unavailable." : "Supabase is not configured.");
      return;
    }
    setLoading(true);
    setError(estimatePrefill && !estimatePrefill.ok ? estimatePrefill.error : null);

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
    const projectOptions = ((proj ?? []) as ProjectOption[]).filter(
      (project) => project.id && project.name
    );
    const projectPrefillOption =
      prefill?.projectId && prefill.projectName
        ? { id: prefill.projectId, name: prefill.projectName }
        : projectContextPrefill?.projectId && projectContextPrefill.projectName
          ? { id: projectContextPrefill.projectId, name: projectContextPrefill.projectName }
          : null;
    if (
      projectPrefillOption &&
      !projectOptions.some((project) => project.id === projectPrefillOption.id)
    ) {
      projectOptions.unshift(projectPrefillOption);
    }
    setProjects(projectOptions);

    if (custErr) {
      if (!isMissingTableError(custErr)) setError((previous) => previous ?? custErr.message);
      setCustomers([]);
    } else {
      const customerOptions = (cust ?? []) as CustomerOption[];
      const customerPrefillOption =
        prefill?.customerId && prefill.customerName
          ? { id: prefill.customerId, name: prefill.customerName }
          : projectContextPrefill?.customerId && projectContextPrefill.customerName
            ? { id: projectContextPrefill.customerId, name: projectContextPrefill.customerName }
            : null;
      if (
        customerPrefillOption &&
        !customerOptions.some((customer) => customer.id === customerPrefillOption.id)
      ) {
        customerOptions.unshift(customerPrefillOption);
      }
      setCustomers(customerOptions);
    }

    try {
      const profile = await getCompanyProfile(supabase);
      const pct = Number(profile?.default_tax_pct ?? 0);
      if (!taxTouched && Number.isFinite(pct) && pct >= 0) setTaxDraft(decimalDraftFromNumber(pct));
    } catch {
      // Company tax is a default only. A missing profile leaves the typed draft alone.
    }

    setLoading(false);
  }, [supabase, configured, taxTouched, prefill, projectContextPrefill, estimatePrefill]);

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

  const canSubmit = Boolean(supabase) && !loading && !saving;
  const selectedProject = projects.find((project) => project.id === projectId);
  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const lineItems = lines.map(invoiceLineDraftToInput);

  const updateLine = React.useCallback((index: number, patch: Partial<InvoiceLineDraft>) => {
    setLines((previous) =>
      previous.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line))
    );
  }, []);

  const addLine = React.useCallback(() => {
    setLines((previous) => [...previous, newInvoiceLineDraft()]);
  }, []);

  const removeLine = React.useCallback((index: number) => {
    setLines((previous) =>
      previous.length <= 1 ? previous : previous.filter((_, i) => i !== index)
    );
  }, []);

  const handleCreate = async () => {
    if (!supabase || saving || loading) return;
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
      const res = await createInvoiceDraftAction({
        invoiceNo,
        projectId,
        customerId: customerId || null,
        clientName,
        issueDate,
        dueDate,
        taxPct: Math.max(0, taxPct),
        notes,
        sourceEstimateId: prefill?.sourceEstimateId,
        paymentScheduleItemId: prefill?.paymentScheduleItemId,
        lineItems,
      });
      if (!res.ok || !res.invoiceId) {
        const msg = res.error ?? "Failed to create invoice.";
        setError(msg);
        toast({ title: "Create invoice failed", description: msg, variant: "error" });
        return;
      }
      toast({
        title: "Invoice created",
        description: "Draft invoice created.",
        variant: "success",
      });
      router.push(
        appendEstimateReturnPath(`/financial/invoices/${res.invoiceId}/preview`, safeEstimateReturn)
      );
    } catch (createError) {
      const msg = createError instanceof Error ? createError.message : "Failed to create invoice.";
      setError(msg);
      toast({ title: "Create invoice failed", description: msg, variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!supabase || saving || loading) return;
    setSaving(true);
    setError(null);
    try {
      const res = await createInvoiceDraftAction({
        invoiceNo,
        projectId,
        customerId: customerId || null,
        clientName,
        issueDate,
        dueDate,
        taxPct: Math.max(0, taxPct),
        notes,
        sourceEstimateId: prefill?.sourceEstimateId,
        paymentScheduleItemId: prefill?.paymentScheduleItemId,
        allowIncomplete: true,
        lineItems,
      });
      if (!res.ok || !res.invoiceId) {
        const msg = res.error ?? "Failed to save draft.";
        setError(msg);
        toast({ title: "Save draft failed", description: msg, variant: "error" });
        return;
      }
      toast({
        title: "Draft saved",
        description: "Invoice draft saved.",
        variant: "success",
      });
      router.push(
        appendEstimateReturnPath(`/financial/invoices/${res.invoiceId}`, safeEstimateReturn)
      );
    } catch (saveError) {
      const msg = saveError instanceof Error ? saveError.message : "Failed to save draft.";
      setError(msg);
      toast({ title: "Save draft failed", description: msg, variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-testid={isEstimateOrigin ? "invoice-estimate-origin-workspace" : "invoice-editor"}
      className={isEstimateOrigin ? "invoice-estimate-origin-workspace" : "min-h-full"}
    >
      <div data-testid={isEstimateOrigin ? "invoice-editor" : undefined}>
        <InvoiceEditorShell
          header={
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-hh-label font-[650] uppercase text-[var(--hh-muted)]">
                    Invoice
                  </p>
                  <Badge variant="neutral">Draft</Badge>
                </div>
                <h1 className="mt-1 text-title-page text-[var(--hh-ink)]">New Invoice</h1>
                <p className="mt-1 text-hh-metadata text-[var(--hh-muted)]">
                  {prefill
                    ? `Invoice for ${prefill.milestoneTitle} from Estimate ${prefill.estimateNumber}.`
                    : projectContextPrefill
                      ? `Invoice for ${projectContextPrefill.projectName}.`
                      : selectedProject?.name
                        ? `${selectedProject.name} · ${lines.length} line${lines.length === 1 ? "" : "s"}`
                        : "Create a draft invoice for a project and client."}
                </p>
              </div>
            </div>
          }
          banner={
            <>
              {prefill ? (
                <div data-testid="invoice-estimate-origin-context" className={cardClass}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-hh-label font-[650] uppercase text-[var(--hh-muted)]">
                        Estimate milestone
                      </p>
                      <p className="mt-1 text-title-card text-[var(--hh-ink)]">
                        Estimate {prefill.estimateNumber}
                      </p>
                      <p className="mt-1 text-hh-metadata leading-relaxed text-[var(--hh-muted)]">
                        This creates one Draft invoice linked to the selected payment milestone.
                      </p>
                    </div>
                    {safeEstimateReturn ? (
                      <Button variant="secondary" className="min-h-11" asChild>
                        <Link href={safeEstimateReturn} data-testid="invoice-new-back-to-estimate">
                          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
                          Back to estimate
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                  <dl className="mt-4 grid gap-3 text-hh-metadata sm:grid-cols-2 lg:grid-cols-4">
                    <div className="min-w-0">
                      <dt className="text-[var(--hh-muted)]">Customer</dt>
                      <dd className="mt-0.5 truncate font-medium text-[var(--hh-ink)]">
                        {prefill.customerName || "—"}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[var(--hh-muted)]">Project</dt>
                      <dd className="mt-0.5 truncate font-medium text-[var(--hh-ink)]">
                        {prefill.projectName || "—"}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[var(--hh-muted)]">Milestone</dt>
                      <dd className="mt-0.5 truncate font-medium text-[var(--hh-ink)]">
                        {prefill.milestoneTitle}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[var(--hh-muted)]">Milestone amount</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-[var(--hh-ink)]">
                        {formatCurrency(prefill.amount)}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : null}
              {error ? (
                <NeoPanel bodyClassName="p-4">
                  <p className="invoice-new-error-text text-hh-body font-medium text-[var(--hh-danger)]">
                    {error}
                  </p>
                  {estimatePrefill && !estimatePrefill.ok && estimatePrefill.existingInvoiceId ? (
                    <Button variant="secondary" className="mt-3 min-h-11" asChild>
                      <Link
                        href={appendEstimateReturnPath(
                          `/financial/invoices/${estimatePrefill.existingInvoiceId}`,
                          safeEstimateReturn
                        )}
                      >
                        View linked invoice
                      </Link>
                    </Button>
                  ) : null}
                </NeoPanel>
              ) : null}
              {projectContextPrefill && !projectContextPrefill.customerId ? (
                <NeoPanel bodyClassName="p-4">
                  <p className="text-hh-body font-medium text-[var(--hh-ink)]">
                    Project context loaded
                  </p>
                  <p className="mt-1 text-hh-metadata text-[var(--hh-muted)]">
                    This project is not linked to a customer yet. Add or confirm the client name
                    before saving.
                  </p>
                </NeoPanel>
              ) : null}
            </>
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
                  <div>
                    <NeoFieldLabel className={invoiceEditorLabelClass} required>
                      Client name
                    </NeoFieldLabel>
                    <NeoInput
                      data-testid="invoice-new-client-input"
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
                      <p className="invoice-new-error-text mt-1 text-hh-metadata font-medium text-[var(--hh-danger)]">
                        Client name is required.
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <NeoFieldLabel className={invoiceEditorLabelClass} required>
                      Project
                    </NeoFieldLabel>
                    <NeoSelect
                      data-testid="invoice-new-project-select"
                      value={projectId}
                      onChange={(event) => setProjectId(event.target.value)}
                      className={invoiceEditorFieldClass}
                      aria-invalid={submitAttempted && !projectId}
                    >
                      <option value="">Select project</option>
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
                      <p className="invoice-new-error-text mt-1 text-hh-metadata font-medium text-[var(--hh-danger)]">
                        Project is required.
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <NeoFieldLabel className={invoiceEditorLabelClass}>Issue date</NeoFieldLabel>
                    <NeoInput
                      data-testid="invoice-new-issue-date-input"
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
                    <NeoFieldLabel className={invoiceEditorLabelClass}>Due date</NeoFieldLabel>
                    <NeoInput
                      data-testid="invoice-new-due-date-input"
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
                    <NeoFieldLabel className={invoiceEditorLabelClass}>
                      Customer (optional)
                    </NeoFieldLabel>
                    <NeoSelect
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
                    <NeoFieldLabel className={invoiceEditorLabelClass}>
                      Invoice number
                    </NeoFieldLabel>
                    <NeoInput
                      data-testid="invoice-new-number-input"
                      value={invoiceNo}
                      onChange={(event) => setInvoiceNo(event.target.value)}
                      placeholder="Auto if blank"
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
              idPrefix="invoice-new"
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
              <NeoFieldLabel className={invoiceEditorLabelClass}>Notes (optional)</NeoFieldLabel>
              <textarea
                data-testid="invoice-new-notes-input"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Terms / notes"
                rows={4}
                className="mt-1.5 min-h-[88px] w-full rounded-hh-standard border border-[var(--hh-line-input)] bg-[var(--hh-surface)] px-3 py-2 text-hh-body text-[var(--hh-ink)] placeholder:text-[var(--hh-placeholder)] focus:border-[var(--hh-link)] focus:outline-none"
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
                  <NeoFieldLabel className={invoiceEditorLabelClass}>Tax %</NeoFieldLabel>
                  <DecimalDraftField
                    data-testid="invoice-new-tax-input"
                    value={taxDraft}
                    onValue={(next) => {
                      setTaxTouched(true);
                      setTaxDraft(next);
                    }}
                    className={invoiceEditorFieldClass}
                  />
                </div>
              }
              actions={
                <>
                  <Button onClick={handleCreate} disabled={!canSubmit} className="min-h-11 w-full">
                    <SubmitSpinner loading={saving} className="mr-2" />
                    {saving ? "Creating..." : "Create draft invoice"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleSaveDraft}
                    disabled={!canSubmit}
                    className="min-h-11 w-full"
                  >
                    Save draft
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => router.push(safeEstimateReturn ?? "/financial/invoices")}
                    disabled={saving}
                    className="min-h-11 w-full"
                  >
                    {safeEstimateReturn ? "Cancel and return" : "Cancel"}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled
                    className="min-h-11 w-full"
                    title="Save the draft before previewing."
                  >
                    Preview PDF
                  </Button>
                </>
              }
            />
          }
          history={<InvoiceBillingHistory billing={contractBilling} />}
        />
      </div>
    </div>
  );
}
