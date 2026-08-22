"use client";

import * as React from "react";
import Link from "next/link";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { useRouter } from "next/navigation";
import {
  NeoActionFooter,
  NeoAmount,
  NeoFieldLabel,
  NeoFormGrid,
  NeoInput,
  NeoPanel,
  NeoSelect,
  PageHeader,
} from "@/components/base";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
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
import "./estimate-origin-invoice-operational.css";

type ProjectOption = { id: string; name: string };
type CustomerOption = { id: string; name: string | null };

export type ProjectInvoicePrefill = {
  projectId: string;
  projectName: string;
  customerId: string | null;
  customerName: string | null;
};

type LineDraft = {
  itemName: string;
  description: string;
  qty: number;
  unitPrice: number;
};

function safeNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isMissingTableError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "42P01";
}

function newLineDraft(prefill?: {
  itemName?: string;
  description?: string;
  unitPrice?: number;
}): LineDraft {
  return {
    itemName: prefill?.itemName ?? "",
    description: prefill?.description ?? "",
    qty: 1,
    unitPrice: prefill?.unitPrice ?? 0,
  };
}

function lineHasContent(line: LineDraft): boolean {
  return line.itemName.trim().length > 0 || line.description.trim().length > 0;
}

function composeLineDescription(line: LineDraft): string {
  const itemName = line.itemName.trim();
  const description = line.description.trim();
  if (itemName && description) return `${itemName}\n${description}`;
  return itemName || description;
}

function AutoResizeTextarea({
  className = "",
  value,
  onChange,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = React.useRef<HTMLTextAreaElement | null>(null);

  const resize = React.useCallback((node: HTMLTextAreaElement | null) => {
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, []);

  React.useLayoutEffect(() => {
    resize(ref.current);
  }, [resize, value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => {
        onChange?.(e);
        resize(e.currentTarget);
      }}
      className={[
        "block min-h-[44px] w-full resize-none overflow-hidden rounded-hh-standard border border-transparent bg-transparent px-2 py-1.5 text-hh-body leading-5 text-[var(--hh-text-secondary)] shadow-none transition-[border-color,background-color,box-shadow] duration-150 placeholder:text-[var(--hh-text-tertiary)] hover:bg-[var(--hh-l3-hover)] focus:border-[var(--hh-action-primary)] focus:bg-[var(--hh-l3-selected)] focus:outline-none focus:ring-2 focus:ring-[var(--hh-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      ].join(" ")}
      {...props}
    />
  );
}

const PAGE_LAYOUT_CLASS =
  "hh-fin mx-auto flex w-full max-w-[960px] flex-col gap-4 px-4 py-5 pb-[calc(10.5rem+env(safe-area-inset-bottom))] sm:px-6 md:gap-5 md:py-6 md:pb-[calc(6rem+env(safe-area-inset-bottom))]";
const PAGE_DARK_CLASS = "bg-[var(--hh-l0-canvas)] text-[var(--hh-text-secondary)]";
const FIELD_CLASS = "neo-input mt-1";
const ERROR_TEXT_CLASS =
  "invoice-new-error-text mt-1 text-hh-metadata font-medium text-[var(--hh-danger)]";
const SKELETON_CLASS = "bg-[var(--hh-l2-operational-surface)]";
const LINE_CARD_CLASS =
  "invoice-new-line-card group relative rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-4 py-4 shadow-none transition-[border-color,background-color] duration-150 hover:border-[var(--hh-border-strong)] hover:bg-[var(--hh-l3-hover)]";
const LINE_CARD_INVALID_CLASS = "border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)]";
const COMPACT_FIELD_CLASS =
  "neo-input h-8 min-h-8 rounded-hh-standard border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-2 text-right text-hh-body font-normal tabular-nums text-[var(--hh-text-secondary)] hover:bg-[var(--hh-l3-hover)] focus-visible:bg-[var(--hh-l3-selected)]";
const FOOTER_CLASS =
  "invoice-new-action-footer -mx-4 mt-0 flex-col gap-2 rounded-t-hh-task border-t border-[var(--hh-border)] bg-[var(--hh-l4-floating-surface)] px-4 pt-3 shadow-floating sm:mx-0 sm:rounded-hh-task sm:border sm:px-4 md:px-5 [&_button]:max-md:min-h-11 [&_button]:max-md:w-full";
const SECONDARY_BUTTON_CLASS =
  "rounded-hh-standard border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-primary)] hover:bg-[var(--hh-l3-hover)] hover:text-[var(--hh-text-primary)]";
const PRIMARY_BUTTON_CLASS =
  "invoice-new-primary-action rounded-hh-standard border-transparent bg-[var(--hh-action-primary)] text-[var(--hh-action-primary-foreground)] hover:bg-[var(--hh-action-primary)] focus-visible:ring-[var(--hh-focus-ring)]";

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
  const [taxPct, setTaxPct] = React.useState<number>(0);
  const [taxTouched, setTaxTouched] = React.useState(Boolean(prefill));
  const [notes, setNotes] = React.useState<string>(prefill?.notes ?? "");

  const [lines, setLines] = React.useState<LineDraft[]>([
    newLineDraft(
      prefill
        ? {
            itemName: prefill.milestoneTitle,
            description: prefill.milestoneDescription,
            unitPrice: prefill.amount,
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
        .select("id,name")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("customers")
        .select("id,name")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    if (projErr) setError(projErr.message);
    const projectOptions = ((proj ?? []) as ProjectOption[]).filter((p) => p.id && p.name);
    const projectPrefillOption =
      prefill?.projectId && prefill.projectName
        ? { id: prefill.projectId, name: prefill.projectName }
        : projectContextPrefill?.projectId && projectContextPrefill.projectName
          ? { id: projectContextPrefill.projectId, name: projectContextPrefill.projectName }
          : null;
    if (projectPrefillOption && !projectOptions.some((p) => p.id === projectPrefillOption.id)) {
      projectOptions.unshift(projectPrefillOption);
    }
    setProjects(projectOptions);

    if (custErr) {
      if (!isMissingTableError(custErr)) setError((p) => p ?? custErr.message);
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
        !customerOptions.some((c) => c.id === customerPrefillOption.id)
      ) {
        customerOptions.unshift(customerPrefillOption);
      }
      setCustomers(customerOptions);
    }

    try {
      const profile = await getCompanyProfile(supabase);
      const pct = Number(profile?.default_tax_pct ?? 0);
      if (!taxTouched && Number.isFinite(pct) && pct >= 0) setTaxPct(pct);
    } catch {
      // ignore
    }

    setLoading(false);
  }, [supabase, configured, taxTouched, prefill, projectContextPrefill]);

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
    const selected = customers.find((c) => c.id === customerId)?.name?.trim() ?? "";
    if (customerId && selected) setClientName(selected);
  }, [customerId, customers]);

  const computedSubtotal = React.useMemo(() => {
    return lines.reduce(
      (sum, l) => sum + Math.max(0, safeNumber(l.qty)) * Math.max(0, safeNumber(l.unitPrice)),
      0
    );
  }, [lines]);
  const computedTax = React.useMemo(
    () => computedSubtotal * (Math.max(0, safeNumber(taxPct)) / 100),
    [computedSubtotal, taxPct]
  );
  const computedTotal = React.useMemo(
    () => computedSubtotal + computedTax,
    [computedSubtotal, computedTax]
  );

  const validationErrors = React.useMemo(() => {
    const errors: string[] = [];
    if (!projectId) errors.push("Project is required.");
    if (!clientName.trim()) errors.push("Client name is required.");
    if (!lines.some(lineHasContent)) {
      errors.push("At least one line item is required.");
    }
    return errors;
  }, [clientName, lines, projectId]);

  const canSubmit = Boolean(supabase) && !loading && !saving;

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
        taxPct: Math.max(0, safeNumber(taxPct)),
        notes,
        sourceEstimateId: prefill?.sourceEstimateId,
        paymentScheduleItemId: prefill?.paymentScheduleItemId,
        lineItems: lines.map((l) => ({
          description: composeLineDescription(l),
          qty: Math.max(0, safeNumber(l.qty) || 0),
          unitPrice: Math.max(0, safeNumber(l.unitPrice) || 0),
        })),
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create invoice.";
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
        taxPct: Math.max(0, safeNumber(taxPct)),
        notes,
        sourceEstimateId: prefill?.sourceEstimateId,
        paymentScheduleItemId: prefill?.paymentScheduleItemId,
        allowIncomplete: true,
        lineItems: lines.map((l) => ({
          description: composeLineDescription(l),
          qty: Math.max(0, safeNumber(l.qty) || 0),
          unitPrice: Math.max(0, safeNumber(l.unitPrice) || 0),
        })),
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save draft.";
      setError(msg);
      toast({ title: "Save draft failed", description: msg, variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const updateLine = React.useCallback((idx: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((line, i) => (i === idx ? { ...line, ...patch } : line)));
  }, []);

  const addLine = React.useCallback(() => {
    setLines((prev) => [...prev, newLineDraft()]);
  }, []);

  const removeLine = React.useCallback((idx: number) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }, []);

  return (
    <div
      data-testid={isEstimateOrigin ? "invoice-estimate-origin-workspace" : undefined}
      className={isEstimateOrigin ? "invoice-estimate-origin-workspace" : "min-h-full"}
    >
      <div className={`${PAGE_LAYOUT_CLASS} ${isEstimateOrigin ? "" : PAGE_DARK_CLASS}`}>
        <PageHeader
          title="New Invoice"
          description={
            prefill
              ? `Invoice for ${prefill.milestoneTitle} from Estimate ${prefill.estimateNumber}.`
              : projectContextPrefill
                ? `Invoice for ${projectContextPrefill.projectName}.`
                : "Create a draft invoice for a project and client."
          }
        />

        {prefill ? (
          <div data-testid="invoice-estimate-origin-context">
            <NeoPanel bodyClassName="p-4 md:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-hh-metadata font-semibold uppercase tracking-normal text-[var(--hh-action-primary)]">
                    Estimate milestone
                  </p>
                  <p className="mt-1 text-hh-body font-semibold text-[var(--hh-text-primary)]">
                    Estimate {prefill.estimateNumber}
                  </p>
                  <p className="mt-1 text-hh-metadata leading-relaxed text-[var(--hh-text-secondary)]">
                    This creates one Draft invoice linked to the selected payment milestone.
                  </p>
                </div>
                {safeEstimateReturn ? (
                  <Button
                    variant="outline"
                    className={`min-h-11 ${SECONDARY_BUTTON_CLASS}`}
                    asChild
                  >
                    <Link href={safeEstimateReturn} data-testid="invoice-new-back-to-estimate">
                      <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
                      Back to estimate
                    </Link>
                  </Button>
                ) : null}
              </div>
              <dl className="mt-4 grid gap-3 text-hh-metadata sm:grid-cols-2 lg:grid-cols-4">
                <div className="min-w-0">
                  <dt className="text-[var(--hh-text-tertiary)]">Customer</dt>
                  <dd className="mt-0.5 truncate font-medium text-[var(--hh-text-primary)]">
                    {prefill.customerName || "—"}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[var(--hh-text-tertiary)]">Project</dt>
                  <dd className="mt-0.5 truncate font-medium text-[var(--hh-text-primary)]">
                    {prefill.projectName || "—"}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[var(--hh-text-tertiary)]">Milestone</dt>
                  <dd className="mt-0.5 truncate font-medium text-[var(--hh-text-primary)]">
                    {prefill.milestoneTitle}
                  </dd>
                </div>
                <div className="min-w-0 sm:text-right lg:text-left">
                  <dt className="text-[var(--hh-text-tertiary)]">Milestone amount</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-[var(--hh-text-primary)]">
                    {formatCurrency(prefill.amount)}
                  </dd>
                </div>
              </dl>
            </NeoPanel>
          </div>
        ) : null}

        {error ? (
          <NeoPanel bodyClassName="p-4">
            <p className="invoice-new-error-text text-hh-body font-medium text-[var(--hh-danger)]">
              {error}
            </p>
            {estimatePrefill && !estimatePrefill.ok && estimatePrefill.existingInvoiceId ? (
              <Button variant="outline" className={`mt-3 ${SECONDARY_BUTTON_CLASS}`} asChild>
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
            <p className="text-hh-body font-medium text-[var(--hh-action-primary)]">
              Project context loaded
            </p>
            <p className="mt-1 text-hh-metadata text-[var(--hh-text-secondary)]">
              This project is not linked to a customer yet. Add or confirm the client name before
              saving.
            </p>
          </NeoPanel>
        ) : null}

        <NeoPanel bodyClassName="p-4 md:p-5">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className={`h-6 w-44 ${SKELETON_CLASS}`} />
              <Skeleton className={`h-10 w-full ${SKELETON_CLASS}`} />
              <Skeleton className={`h-10 w-full ${SKELETON_CLASS}`} />
              <Skeleton className={`h-10 w-full ${SKELETON_CLASS}`} />
            </div>
          ) : (
            <NeoFormGrid className="md:grid-cols-2">
              <div>
                <NeoFieldLabel required>Project</NeoFieldLabel>
                <NeoSelect
                  data-testid="invoice-new-project-select"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className={FIELD_CLASS}
                  aria-invalid={submitAttempted && !projectId}
                >
                  <option value="">Select project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NeoSelect>
                {submitAttempted && !projectId ? (
                  <p className={ERROR_TEXT_CLASS}>Project is required.</p>
                ) : null}
              </div>

              <div>
                <NeoFieldLabel>Customer (optional)</NeoFieldLabel>
                <NeoSelect
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className={FIELD_CLASS}
                >
                  <option value="">Select customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || "Unnamed customer"}
                    </option>
                  ))}
                </NeoSelect>
              </div>

              <div>
                <NeoFieldLabel required>Client name</NeoFieldLabel>
                <NeoInput
                  data-testid="invoice-new-client-input"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Client"
                  className={FIELD_CLASS}
                  aria-invalid={submitAttempted && !clientName.trim()}
                />
                {submitAttempted && !clientName.trim() ? (
                  <p className={ERROR_TEXT_CLASS}>Client name is required.</p>
                ) : null}
              </div>

              <div>
                <NeoFieldLabel>Invoice number</NeoFieldLabel>
                <NeoInput
                  data-testid="invoice-new-number-input"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  placeholder="Auto if blank"
                  className={FIELD_CLASS}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <NeoFieldLabel>Issue date</NeoFieldLabel>
                  <NeoInput
                    data-testid="invoice-new-issue-date-input"
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate((e.target.value || issueDate).slice(0, 10))}
                    onInput={(e) => setIssueDate((e.currentTarget.value || issueDate).slice(0, 10))}
                    className={FIELD_CLASS}
                  />
                </div>
                <div>
                  <NeoFieldLabel>Due date</NeoFieldLabel>
                  <NeoInput
                    data-testid="invoice-new-due-date-input"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate((e.target.value || dueDate).slice(0, 10))}
                    onInput={(e) => setDueDate((e.currentTarget.value || dueDate).slice(0, 10))}
                    className={FIELD_CLASS}
                  />
                </div>
              </div>

              <div>
                <NeoFieldLabel>Tax %</NeoFieldLabel>
                <NeoInput
                  data-testid="invoice-new-tax-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={taxPct}
                  onChange={(e) => {
                    setTaxTouched(true);
                    setTaxPct(safeNumber(e.target.value));
                  }}
                  className={FIELD_CLASS}
                />
              </div>

              <div>
                <NeoFieldLabel>Notes (optional)</NeoFieldLabel>
                <NeoInput
                  data-testid="invoice-new-notes-input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Terms / notes"
                  className={FIELD_CLASS}
                />
              </div>
            </NeoFormGrid>
          )}
        </NeoPanel>

        <NeoPanel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--hh-border)] px-4 py-3">
            <h2 className="text-hh-body font-semibold text-[var(--hh-text-primary)]">Line items</h2>
            <span className="text-hh-metadata text-[var(--hh-text-tertiary)]">
              {lines.length} item{lines.length === 1 ? "" : "s"}
            </span>
          </div>
          {submitAttempted && !lines.some(lineHasContent) ? (
            <p className="invoice-new-error-text px-4 pt-3 text-hh-metadata font-medium text-[var(--hh-danger)]">
              At least one line item is required.
            </p>
          ) : null}
          <div className="space-y-3 px-3 py-3 sm:px-4">
            {lines.map((line, idx) => {
              const amount =
                Math.max(0, safeNumber(line.qty)) * Math.max(0, safeNumber(line.unitPrice));
              const invalidLine = submitAttempted && !lineHasContent(line);

              return (
                <div
                  key={idx}
                  className={[LINE_CARD_CLASS, invalidLine ? LINE_CARD_INVALID_CLASS : ""].join(
                    " "
                  )}
                >
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_72px_112px_132px_32px] md:items-start">
                    <div className="space-y-1 pr-12 md:pr-0">
                      <NeoInput
                        data-testid={`invoice-new-line-${idx + 1}-item-input`}
                        value={line.itemName}
                        onChange={(e) => updateLine(idx, { itemName: e.target.value })}
                        placeholder="Item name"
                        aria-label={`Line item ${idx + 1} item name`}
                        aria-invalid={invalidLine}
                        className="h-8 min-h-8 border-transparent bg-transparent px-2 py-1 text-hh-body font-medium leading-5 text-[var(--hh-text-primary)] placeholder:text-[var(--hh-text-tertiary)] hover:bg-[var(--hh-l3-hover)] focus-visible:border-[var(--hh-action-primary)] focus-visible:bg-[var(--hh-l3-selected)] focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)] hh-type-text-entry"
                      />
                      <AutoResizeTextarea
                        data-testid={`invoice-new-line-${idx + 1}-description-input`}
                        value={line.description}
                        onChange={(e) => updateLine(idx, { description: e.target.value })}
                        placeholder="Describe the scope of work, materials, or service…"
                        aria-label={`Line item ${idx + 1} description`}
                        aria-invalid={invalidLine}
                      />
                    </div>

                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2 md:contents">
                      <div className="space-y-1">
                        <NeoFieldLabel className="text-hh-status">Qty</NeoFieldLabel>
                        <NeoInput
                          data-testid={`invoice-new-line-${idx + 1}-qty-input`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.qty}
                          onChange={(e) => updateLine(idx, { qty: safeNumber(e.target.value) })}
                          className={COMPACT_FIELD_CLASS}
                          aria-label={`Line item ${idx + 1} quantity`}
                        />
                      </div>
                      <span className="pb-2 text-hh-body text-[var(--hh-text-tertiary)] md:hidden">
                        ×
                      </span>
                      <div className="space-y-1">
                        <NeoFieldLabel className="text-hh-status">Rate</NeoFieldLabel>
                        <NeoInput
                          data-testid={`invoice-new-line-${idx + 1}-rate-input`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unitPrice}
                          onChange={(e) =>
                            updateLine(idx, { unitPrice: safeNumber(e.target.value) })
                          }
                          className={COMPACT_FIELD_CLASS}
                          aria-label={`Line item ${idx + 1} rate`}
                        />
                      </div>
                    </div>

                    <div className="flex items-end justify-between border-t border-[var(--hh-border)] pt-3 md:block md:border-0 md:pt-0 md:text-right">
                      <span className="text-hh-status font-medium uppercase tracking-normal text-[var(--hh-text-tertiary)] md:block">
                        Amount
                      </span>
                      <NeoAmount className="mt-2 block hh-type-text-entry">
                        {formatCurrency(amount)}
                      </NeoAmount>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="absolute right-1.5 top-1.5 h-11 w-11 border-transparent bg-transparent p-0 text-[var(--hh-text-tertiary)] opacity-100 transition-colors hover:border-[var(--hh-danger-border)] hover:bg-[var(--hh-danger-soft-fill)] hover:text-[var(--hh-danger)] focus-visible:opacity-100 md:static md:mt-5 md:h-8 md:w-8 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                      aria-label="Remove line item"
                      disabled={saving || lines.length <= 1}
                      onClick={() => removeLine(idx)}
                      title="Remove line item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={addLine}
              disabled={saving}
              className="flex min-h-11 w-full items-center gap-2 rounded-hh-standard px-3 py-2 text-left text-hh-body font-medium text-[var(--hh-text-secondary)] transition-colors hover:bg-[var(--hh-l3-hover)] hover:text-[var(--hh-text-primary)] disabled:cursor-not-allowed disabled:opacity-50 md:min-h-10"
            >
              <Plus className="h-4 w-4" />
              Add another item
            </button>
          </div>

          <div className="flex justify-end border-t border-[var(--hh-border)] p-4">
            <div className="w-full max-w-sm space-y-1 text-hh-body">
              <div className="flex justify-between">
                <span className="text-[var(--hh-text-secondary)]">Subtotal</span>
                <NeoAmount tone="muted">{formatCurrency(computedSubtotal)}</NeoAmount>
              </div>
              {computedTax > 0 ? (
                <div className="flex justify-between">
                  <span className="text-[var(--hh-text-secondary)]">Tax ({taxPct || 0}%)</span>
                  <NeoAmount tone="muted">{formatCurrency(computedTax)}</NeoAmount>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-[var(--hh-border)] pt-2 font-medium text-[var(--hh-text-primary)]">
                <span>Total</span>
                <NeoAmount className="text-hh-financial-total">
                  {formatCurrency(computedTotal)}
                </NeoAmount>
              </div>
            </div>
          </div>
        </NeoPanel>

        <NeoActionFooter className={FOOTER_CLASS}>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => router.push(safeEstimateReturn ?? "/financial/invoices")}
              disabled={saving}
              className={SECONDARY_BUTTON_CLASS}
            >
              {safeEstimateReturn ? "Cancel and return" : "Cancel"}
            </Button>
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={!canSubmit}
              className={SECONDARY_BUTTON_CLASS}
            >
              Save draft
            </Button>
            <Button onClick={handleCreate} disabled={!canSubmit} className={PRIMARY_BUTTON_CLASS}>
              <SubmitSpinner loading={saving} className="mr-2" />
              {saving ? "Creating..." : "Create draft invoice"}
            </Button>
          </div>
          {submitAttempted && validationErrors.length > 0 ? (
            <p className="invoice-new-error-text text-center text-hh-metadata font-medium text-[var(--hh-danger)] sm:text-right">
              {validationErrors[0]}
            </p>
          ) : null}
        </NeoActionFooter>
      </div>
    </div>
  );
}
