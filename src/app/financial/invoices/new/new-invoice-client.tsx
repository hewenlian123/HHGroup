"use client";

import * as React from "react";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/toast/toast-provider";
import { createInvoiceDraftAction } from "./actions";
import { getCompanyProfile } from "@/lib/company-profile";
import { formatCurrency } from "@/lib/formatters";
import { SubmitSpinner } from "@/components/ui/submit-spinner";

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
        "block min-h-[44px] w-full resize-none overflow-hidden rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm leading-5 text-zinc-600 shadow-none transition-all duration-150 placeholder:text-zinc-400 hover:bg-zinc-50/70 focus:border-sky-200 focus:bg-sky-50/40 focus:outline-none focus:ring-2 focus:ring-sky-100/80 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      ].join(" ")}
      {...props}
    />
  );
}

export default function NewInvoiceClient() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = React.useState(false);

  const [projects, setProjects] = React.useState<ProjectOption[]>([]);
  const [customers, setCustomers] = React.useState<CustomerOption[]>([]);

  const [projectId, setProjectId] = React.useState<string>("");
  const [customerId, setCustomerId] = React.useState<string>("");
  const [invoiceNo, setInvoiceNo] = React.useState<string>("");
  const [clientName, setClientName] = React.useState<string>("");

  const today = new Date().toISOString().slice(0, 10);
  const [issueDate, setIssueDate] = React.useState<string>(today);
  const [dueDate, setDueDate] = React.useState<string>(today);
  const [taxPct, setTaxPct] = React.useState<number>(0);
  const [taxTouched, setTaxTouched] = React.useState(false);
  const [notes, setNotes] = React.useState<string>("");

  const [lines, setLines] = React.useState<LineDraft[]>([newLineDraft()]);

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

    try {
      const profile = await getCompanyProfile(supabase);
      const pct = Number(profile?.default_tax_pct ?? 0);
      if (!taxTouched && Number.isFinite(pct) && pct >= 0) setTaxPct(pct);
    } catch {
      // ignore
    }

    setLoading(false);
  }, [supabase, configured, taxTouched]);

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
        clientName,
        issueDate,
        dueDate,
        taxPct: Math.max(0, safeNumber(taxPct)),
        notes,
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
      router.push(`/financial/invoices/${res.invoiceId}/preview`);
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
        clientName,
        issueDate,
        dueDate,
        taxPct: Math.max(0, safeNumber(taxPct)),
        notes,
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
      router.push(`/financial/invoices/${res.invoiceId}`);
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
    <div className="financial-nums mx-auto flex max-w-[920px] flex-col gap-6 p-6">
      <PageHeader
        title="New Invoice"
        description="Create a draft invoice for a project and client."
      />

      {error ? (
        <Card className="p-5">
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      ) : null}

      <Card className="p-5">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Project
              </label>
              <select
                data-testid="invoice-new-project-select"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="mt-1 flex h-10 w-full rounded-[10px] border border-input bg-white px-3 text-sm"
                aria-invalid={submitAttempted && !projectId}
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {submitAttempted && !projectId ? (
                <p className="mt-1 text-xs text-rose-600">Project is required.</p>
              ) : null}
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Customer (optional)
              </label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="mt-1 flex h-10 w-full rounded-[10px] border border-input bg-white px-3 text-sm"
              >
                <option value="">Select customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || "Unnamed customer"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Client name
              </label>
              <Input
                data-testid="invoice-new-client-input"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Client"
                className="mt-1"
                aria-invalid={submitAttempted && !clientName.trim()}
              />
              {submitAttempted && !clientName.trim() ? (
                <p className="mt-1 text-xs text-rose-600">Client name is required.</p>
              ) : null}
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Invoice number
              </label>
              <Input
                data-testid="invoice-new-number-input"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                placeholder="Auto if blank"
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Issue date
                </label>
                <Input
                  data-testid="invoice-new-issue-date-input"
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate((e.target.value || issueDate).slice(0, 10))}
                  onInput={(e) => setIssueDate((e.currentTarget.value || issueDate).slice(0, 10))}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Due date
                </label>
                <Input
                  data-testid="invoice-new-due-date-input"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate((e.target.value || dueDate).slice(0, 10))}
                  onInput={(e) => setDueDate((e.currentTarget.value || dueDate).slice(0, 10))}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Tax %
              </label>
              <Input
                data-testid="invoice-new-tax-input"
                type="number"
                min="0"
                step="0.01"
                value={taxPct}
                onChange={(e) => {
                  setTaxTouched(true);
                  setTaxPct(safeNumber(e.target.value));
                }}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Notes (optional)
              </label>
              <Input
                data-testid="invoice-new-notes-input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Terms / notes"
                className="mt-1"
              />
            </div>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden border-zinc-200/70 bg-white shadow-none">
        <div className="flex items-center justify-between border-b border-zinc-100/80 px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Line items</h2>
          <span className="text-xs text-muted-foreground">
            {lines.length} item{lines.length === 1 ? "" : "s"}
          </span>
        </div>
        {submitAttempted && !lines.some(lineHasContent) ? (
          <p className="px-4 pt-3 text-xs text-rose-600">At least one line item is required.</p>
        ) : null}
        <div className="space-y-3 px-3 py-3 sm:px-4">
          {lines.map((line, idx) => {
            const amount =
              Math.max(0, safeNumber(line.qty)) * Math.max(0, safeNumber(line.unitPrice));
            const invalidLine = submitAttempted && !lineHasContent(line);

            return (
              <div
                key={idx}
                className={[
                  "group relative rounded-xl border border-zinc-200/70 bg-white px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-150 hover:border-zinc-300/80 hover:bg-zinc-50/40 hover:shadow-[0_8px_24px_rgba(15,23,42,0.05)]",
                  invalidLine ? "border-rose-200 bg-rose-50/20" : "",
                ].join(" ")}
              >
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_72px_112px_132px_32px] md:items-start">
                  <div className="space-y-1 pr-9 md:pr-0">
                    <Input
                      data-testid={`invoice-new-line-${idx + 1}-item-input`}
                      value={line.itemName}
                      onChange={(e) => updateLine(idx, { itemName: e.target.value })}
                      placeholder="Item name"
                      aria-label={`Line item ${idx + 1} item name`}
                      aria-invalid={invalidLine}
                      className="h-8 min-h-8 border-transparent bg-transparent px-2 py-1 text-[15px] font-medium leading-5 text-zinc-950 placeholder:text-zinc-400 hover:bg-zinc-50/70 focus-visible:border-sky-200 focus-visible:bg-sky-50/40 focus-visible:ring-2 focus-visible:ring-sky-100/80 max-md:text-base"
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
                      <label className="block text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400">
                        Qty
                      </label>
                      <Input
                        data-testid={`invoice-new-line-${idx + 1}-qty-input`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.qty}
                        onChange={(e) => updateLine(idx, { qty: safeNumber(e.target.value) })}
                        className="h-8 min-h-8 rounded-lg border-zinc-100 bg-zinc-50/70 px-2 text-right text-sm font-normal tabular-nums text-zinc-500 hover:bg-white focus-visible:bg-white"
                        aria-label={`Line item ${idx + 1} quantity`}
                      />
                    </div>
                    <span className="pb-2 text-sm text-zinc-300 md:hidden">×</span>
                    <div className="space-y-1">
                      <label className="block text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400">
                        Rate
                      </label>
                      <Input
                        data-testid={`invoice-new-line-${idx + 1}-rate-input`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(e) => updateLine(idx, { unitPrice: safeNumber(e.target.value) })}
                        className="h-8 min-h-8 rounded-lg border-zinc-100 bg-zinc-50/70 px-2 text-right text-sm font-normal tabular-nums text-zinc-500 hover:bg-white focus-visible:bg-white"
                        aria-label={`Line item ${idx + 1} rate`}
                      />
                    </div>
                  </div>

                  <div className="flex items-end justify-between border-t border-zinc-100 pt-3 md:block md:border-0 md:pt-0 md:text-right">
                    <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400 md:block">
                      Amount
                    </span>
                    <span className="mt-2 block text-base font-semibold tabular-nums text-zinc-950">
                      {formatCurrency(amount)}
                    </span>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="btn-outline-ghost absolute right-3 top-3 h-8 w-8 border-transparent p-0 text-zinc-300 opacity-100 transition-colors hover:border-rose-100 hover:bg-rose-50 hover:text-rose-600 md:static md:mt-5 md:opacity-0 md:group-hover:opacity-100"
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
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add another item
          </button>
        </div>

        <div className="p-4 flex justify-end">
          <div className="w-full max-w-sm text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{formatCurrency(computedSubtotal)}</span>
            </div>
            {computedTax > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax ({taxPct || 0}%)</span>
                <span className="tabular-nums">{formatCurrency(computedTax)}</span>
              </div>
            ) : null}
            <div className="flex justify-between font-medium pt-2 border-t border-zinc-200/60">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(computedTotal)}</span>
            </div>
          </div>
        </div>
      </Card>

      <div className="-mx-6 sticky bottom-0 z-20 border-t border-border/60 bg-zinc-50/95 p-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={() => router.push("/financial/invoices")}
            disabled={saving}
            className="rounded-sm"
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={!canSubmit}
            className="rounded-sm"
          >
            Save draft
          </Button>
          <Button onClick={handleCreate} disabled={!canSubmit} className="rounded-sm">
            <SubmitSpinner loading={saving} className="mr-2" />
            {saving ? "Creating..." : "Create draft invoice"}
          </Button>
        </div>
        {submitAttempted && validationErrors.length > 0 ? (
          <p className="mt-2 text-center text-xs text-rose-600 sm:text-right">
            {validationErrors[0]}
          </p>
        ) : null}
      </div>
    </div>
  );
}
