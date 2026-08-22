"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
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
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { useToast } from "@/components/toast/toast-provider";
import { createBrowserClient } from "@/lib/supabase";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { InvoiceWithDerived } from "@/lib/data";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { updateInvoiceAction } from "../../actions";

type ProjectOption = { id: string; name: string };
type CustomerOption = { id: string; name: string | null };

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

function newLineDraft(): LineDraft {
  return { itemName: "", description: "", qty: 1, unitPrice: 0 };
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

function splitLineDescription(raw: string): Pick<LineDraft, "itemName" | "description"> {
  const normalized = (raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return { itemName: "", description: "" };
  const [itemName, ...descriptionParts] = normalized.split("\n");
  return {
    itemName: itemName.trim(),
    description: descriptionParts.join("\n").trim(),
  };
}

function invoiceLinesToDrafts(invoice: InvoiceWithDerived): LineDraft[] {
  if (!invoice.lineItems.length) return [newLineDraft()];
  return invoice.lineItems.map((line) => ({
    ...splitLineDescription(line.description ?? ""),
    qty: safeNumber(line.qty),
    unitPrice: safeNumber(line.unitPrice),
  }));
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
        "block min-h-[44px] w-full resize-none overflow-hidden rounded-hh-standard border border-transparent bg-transparent px-2 py-1.5 text-hh-body leading-5 text-[var(--hh-text-secondary)] shadow-none transition-all duration-150 placeholder:text-[var(--hh-text-tertiary)] hover:bg-[var(--hh-l3-hover)] focus:border-[var(--hh-action-primary)] focus:bg-[var(--hh-l3-selected)] focus:outline-none focus:ring-2 focus:ring-[var(--hh-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      ].join(" ")}
      {...props}
    />
  );
}

const PAGE_CLASS =
  "hh-fin mx-auto flex w-full max-w-[960px] flex-col gap-4 bg-[var(--hh-l0-canvas)] px-4 py-5 pb-[calc(10.5rem+env(safe-area-inset-bottom))] text-[var(--hh-text-secondary)] sm:px-6 md:gap-5 md:py-6 md:pb-[calc(6rem+env(safe-area-inset-bottom))]";
const FIELD_CLASS = "neo-input mt-1";
const ERROR_TEXT_CLASS = "mt-1 text-hh-metadata font-medium text-[var(--hh-danger)]";
const SKELETON_CLASS = "bg-[var(--hh-l2-operational-surface)]";
const LINE_CARD_CLASS =
  "group relative rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-4 py-4 shadow-none transition-all duration-150 hover:border-[var(--hh-border-strong)] hover:bg-[var(--hh-l3-hover)]";
const LINE_CARD_INVALID_CLASS = "border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)]";
const COMPACT_FIELD_CLASS =
  "neo-input h-8 min-h-8 rounded-hh-standard border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-2 text-right text-hh-body font-normal tabular-nums text-[var(--hh-text-secondary)] hover:bg-[var(--hh-l3-hover)] focus-visible:bg-[var(--hh-l3-selected)]";
const FOOTER_CLASS =
  "-mx-4 mt-0 flex-col gap-2 rounded-t-hh-task border-t border-[var(--hh-border)] bg-[var(--hh-l4-floating-surface)] px-4 pt-3 shadow-floating sm:mx-0 sm:rounded-hh-task sm:border sm:px-4 md:px-5 [&_button]:max-md:min-h-11 [&_button]:max-md:w-full";
const SECONDARY_BUTTON_CLASS =
  "rounded-hh-standard border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] text-[var(--hh-text-primary)] hover:bg-[var(--hh-l3-hover)] hover:text-[var(--hh-text-primary)]";
const PRIMARY_BUTTON_CLASS =
  "rounded-hh-standard border-transparent bg-[var(--hh-action-primary)] text-[var(--hh-action-primary-foreground)] hover:bg-[var(--hh-action-primary)] focus-visible:ring-[var(--hh-focus-ring)]";
const GHOST_BUTTON_CLASS =
  "-ml-2 rounded-hh-standard text-[var(--hh-text-secondary)] hover:bg-[var(--hh-l3-hover)] hover:text-[var(--hh-text-primary)]";

export default function EditInvoiceClient({
  invoice,
  initialProjectName,
}: {
  invoice: InvoiceWithDerived;
  initialProjectName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const detailHref = `/financial/invoices/${invoice.id}`;
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
  const [taxPct, setTaxPct] = React.useState<number>(safeNumber(invoice.taxPct ?? 0));
  const [notes, setNotes] = React.useState<string>(invoice.notes ?? "");
  const [lines, setLines] = React.useState<LineDraft[]>(() => invoiceLinesToDrafts(invoice));

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
    setProjects(((proj ?? []) as ProjectOption[]).filter((p) => p.id && p.name));

    if (custErr) {
      if (!isMissingTableError(custErr)) setError((p) => p ?? custErr.message);
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
    if (!lines.some(lineHasContent)) errors.push("At least one line item is required.");
    return errors;
  }, [clientName, lines, projectId]);

  const currentProjectOptionMissing =
    Boolean(projectId) && !projects.some((project) => project.id === projectId);
  const canSubmit = !loading && !saving;

  const updateLine = React.useCallback((idx: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((line, i) => (i === idx ? { ...line, ...patch } : line)));
  }, []);

  const addLine = React.useCallback(() => {
    setLines((prev) => [...prev, newLineDraft()]);
  }, []);

  const removeLine = React.useCallback((idx: number) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
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
        taxPct: Math.max(0, safeNumber(taxPct)),
        notes,
        lineItems: lines.map((line) => ({
          description: composeLineDescription(line),
          qty: Math.max(0, safeNumber(line.qty) || 0),
          unitPrice: Math.max(0, safeNumber(line.unitPrice) || 0),
        })),
      });

      if (!result.ok) {
        const msg = result.error ?? "Failed to save invoice.";
        setError(msg);
        toast({ title: "Could not save invoice", description: msg, variant: "error" });
        return;
      }

      toast({ title: "Invoice saved", variant: "success" });
      router.push(detailHref);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save invoice.";
      setError(msg);
      toast({ title: "Could not save invoice", description: msg, variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (invoice.status !== "Draft") {
    return (
      <div className={PAGE_CLASS}>
        <Button asChild variant="ghost" size="sm" className={GHOST_BUTTON_CLASS}>
          <Link href={detailHref}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to invoice
          </Link>
        </Button>
        <PageHeader
          title={
            <span className="inline-flex flex-wrap items-center gap-3">
              {invoice.invoiceNo}
              <InvoiceStatusBadge status={invoice.computedStatus} />
            </span>
          }
          description="Only draft invoices can be edited."
        />
        <NeoPanel bodyClassName="p-4 md:p-5">
          <p className="text-hh-body text-[var(--hh-text-secondary)]">
            Only draft invoices can be edited.
          </p>
        </NeoPanel>
      </div>
    );
  }

  return (
    <div className={PAGE_CLASS}>
      <Button asChild variant="ghost" size="sm" className={GHOST_BUTTON_CLASS}>
        <Link href={detailHref}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to invoice
        </Link>
      </Button>
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            Edit {invoice.invoiceNo}
            <InvoiceStatusBadge status={invoice.computedStatus} />
          </span>
        }
        description="Update project, client, dates, and billable items."
        actions={
          <div className="rounded-hh-standard border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] px-3 py-2 text-left text-hh-body text-[var(--hh-text-secondary)] shadow-operational sm:min-w-[220px] sm:text-right">
            <p className="font-medium text-[var(--hh-text-primary)]">{invoice.clientName}</p>
            <p>{initialProjectName}</p>
            <p>Issued {formatDate(invoice.issueDate)}</p>
          </div>
        }
      />

      {error ? (
        <NeoPanel bodyClassName="p-4">
          <p className="text-hh-body font-medium text-[var(--hh-danger)]">{error}</p>
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
                data-testid="invoice-edit-project-select"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className={FIELD_CLASS}
                aria-invalid={submitAttempted && !projectId}
              >
                <option value="">Select project</option>
                {currentProjectOptionMissing ? (
                  <option value={projectId}>{initialProjectName}</option>
                ) : null}
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
                data-testid="invoice-edit-client-input"
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
                data-testid="invoice-edit-number-input"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                placeholder="Invoice number"
                className={FIELD_CLASS}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <NeoFieldLabel>Issue date</NeoFieldLabel>
                <NeoInput
                  data-testid="invoice-edit-issue-date-input"
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
                  data-testid="invoice-edit-due-date-input"
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
                data-testid="invoice-edit-tax-input"
                type="number"
                min="0"
                step="0.01"
                value={taxPct}
                onChange={(e) => setTaxPct(safeNumber(e.target.value))}
                className={FIELD_CLASS}
              />
            </div>

            <div>
              <NeoFieldLabel>Notes (optional)</NeoFieldLabel>
              <NeoInput
                data-testid="invoice-edit-notes-input"
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
          <p className="px-4 pt-3 text-hh-metadata font-medium text-[var(--hh-danger)]">
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
                className={[LINE_CARD_CLASS, invalidLine ? LINE_CARD_INVALID_CLASS : ""].join(" ")}
              >
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_72px_112px_132px_32px] md:items-start">
                  <div className="space-y-1 pr-9 md:pr-0">
                    <NeoInput
                      data-testid={`invoice-edit-line-${idx + 1}-item-input`}
                      value={line.itemName}
                      onChange={(e) => updateLine(idx, { itemName: e.target.value })}
                      placeholder="Item name"
                      aria-label={`Line item ${idx + 1} item name`}
                      aria-invalid={invalidLine}
                      className="h-8 min-h-8 border-transparent bg-transparent px-2 py-1 text-hh-body font-medium leading-5 text-[var(--hh-text-primary)] placeholder:text-[var(--hh-text-tertiary)] hover:bg-[var(--hh-l3-hover)] focus-visible:border-[var(--hh-action-primary)] focus-visible:bg-[var(--hh-l3-selected)] focus-visible:ring-2 focus-visible:ring-[var(--hh-focus-ring)] hh-type-text-entry"
                    />
                    <AutoResizeTextarea
                      data-testid={`invoice-edit-line-${idx + 1}-description-input`}
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
                        data-testid={`invoice-edit-line-${idx + 1}-qty-input`}
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
                        data-testid={`invoice-edit-line-${idx + 1}-rate-input`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(e) => updateLine(idx, { unitPrice: safeNumber(e.target.value) })}
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
                    className="absolute right-3 top-3 h-8 w-8 border-transparent bg-transparent p-0 text-[var(--hh-text-tertiary)] opacity-100 transition-colors hover:border-[var(--hh-danger-border)] hover:bg-[var(--hh-danger-soft-fill)] hover:text-[var(--hh-danger)] md:static md:mt-5 md:opacity-0 md:group-hover:opacity-100"
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
            className="flex w-full items-center gap-2 rounded-hh-standard px-3 py-2 text-left text-hh-body font-medium text-[var(--hh-text-secondary)] transition-colors hover:bg-[var(--hh-l3-hover)] hover:text-[var(--hh-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
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
            onClick={() => router.push(detailHref)}
            disabled={saving}
            className={SECONDARY_BUTTON_CLASS}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSubmit} className={PRIMARY_BUTTON_CLASS}>
            <SubmitSpinner loading={saving} className="mr-2" />
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
        {submitAttempted && validationErrors.length > 0 ? (
          <p className="text-center text-hh-metadata font-medium text-[var(--hh-danger)] sm:text-right">
            {validationErrors[0]}
          </p>
        ) : null}
      </NeoActionFooter>
    </div>
  );
}
