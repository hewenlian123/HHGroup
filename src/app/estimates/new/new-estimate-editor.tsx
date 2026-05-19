"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createEstimateWithItemsAction } from "./actions";
import type { CostCode } from "@/lib/data";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/toast/toast-provider";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { createBrowserClient } from "@/lib/supabase";
import { getCompanyProfile } from "@/lib/company-profile";
import { formatEstimateCurrency } from "../_components/estimate-currency";
import { EstimateBuilderSummary } from "../_components/estimate-builder-summary";
import { EstimateBuilderAdvanced } from "../_components/estimate-builder-advanced";
import { EstimateLineItemsLocal } from "../_components/estimate-line-items-local";
import type { EditorLineItem } from "../_components/estimate-line-item-model";
import {
  CustomerSelectWithAdd,
  type CustomerOption,
} from "@/components/customers/customer-select-with-add";

type CostCodeType = "material" | "labor" | "subcontractor";

type PaymentMilestoneLocal = {
  id: string;
  title: string;
  amountType: "percent" | "fixed";
  value: number;
  dueRule: string;
  dueDate?: string;
  notes?: string;
};

type LineItem = {
  id: string;
  costCode: string;
  title: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  markupPct: number;
};

function lineTotal(li: LineItem): number {
  return li.qty * li.unitPrice * (1 + li.markupPct);
}

export function NewEstimateEditor({ costCodes }: { costCodes: CostCode[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const router = useRouter();
  const { toast } = useToast();

  const [clientName, setClientName] = React.useState("");
  const [projectName, setProjectName] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [selectedCustomer, setSelectedCustomer] = React.useState<CustomerOption | null>(null);
  const [estimateDate] = React.useState(today);
  const [validUntil, setValidUntil] = React.useState("");
  const [salesPerson, setSalesPerson] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [tax, setTax] = React.useState(0);
  const [taxTouched, setTaxTouched] = React.useState(false);
  const [defaultTaxPct, setDefaultTaxPct] = React.useState(0);
  const [discount, setDiscount] = React.useState(0);
  const [overheadPct, setOverheadPct] = React.useState(5);
  const [profitPct, setProfitPct] = React.useState(10);
  const [categoryNames, setCategoryNames] = React.useState<Record<string, string>>({});
  const [lineItems, setLineItems] = React.useState<LineItem[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [submitAttempted, setSubmitAttempted] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  /** Estimate Information: read-only summary by default; Edit opens the form. */
  const [isEditing, setIsEditing] = React.useState(true);
  const [paymentMilestones, setPaymentMilestones] = React.useState<PaymentMilestoneLocal[]>([]);
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [pmTitle, setPmTitle] = React.useState("");
  const [pmAmountType, setPmAmountType] = React.useState<"percent" | "fixed">("percent");
  const [pmValue, setPmValue] = React.useState("");
  const [pmDueRule, setPmDueRule] = React.useState("");
  const [pmDueDate, setPmDueDate] = React.useState("");
  const [pmNotes, setPmNotes] = React.useState("");

  const codeToType = React.useMemo(() => {
    const m = new Map<string, CostCodeType>();
    costCodes.forEach((c) => {
      if ("type" in c && (c as { type?: string }).type)
        m.set(c.code, (c as { type: CostCodeType }).type);
    });
    return m;
  }, [costCodes]);

  const summary = React.useMemo(() => {
    let materialCost = 0,
      laborCost = 0,
      subcontractorCost = 0;
    lineItems.forEach((li) => {
      const t = codeToType.get(li.costCode);
      const tot = lineTotal(li);
      if (t === "material") materialCost += tot;
      else if (t === "labor") laborCost += tot;
      else if (t === "subcontractor") subcontractorCost += tot;
    });
    const subtotal = lineItems.reduce((s, li) => s + lineTotal(li), 0);
    const overhead = subtotal * (overheadPct / 100);
    const profit = subtotal * (profitPct / 100);
    const grandTotal = subtotal + overhead + profit + tax - discount;
    return {
      materialCost,
      laborCost,
      subcontractorCost,
      subtotal,
      overhead,
      profit,
      tax,
      discount,
      grandTotal,
    };
  }, [lineItems, codeToType, overheadPct, profitPct, tax, discount]);

  const hasValidLineItem = React.useMemo(
    () => lineItems.some((li) => li.title.trim().length > 0 || li.description.trim().length > 0),
    [lineItems]
  );

  const validationErrors = React.useMemo(() => {
    const errors: string[] = [];
    if (!clientName.trim()) errors.push("Client name is required.");
    if (!projectName.trim()) errors.push("Project name is required.");
    if (!hasValidLineItem) errors.push("At least one line item is required.");
    return errors;
  }, [clientName, hasValidLineItem, projectName]);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(url && anon);
  const supabase = React.useMemo(
    () => (configured ? createBrowserClient(url as string, anon as string) : null),
    [configured, url, anon]
  );

  const loadCompanyTaxDefaults = React.useCallback(async () => {
    if (!supabase) return;
    try {
      const profile = await getCompanyProfile(supabase);
      const pct = Number(profile?.default_tax_pct ?? 0);
      if (Number.isFinite(pct) && pct >= 0) setDefaultTaxPct(pct);
    } catch {
      // ignore
    }
  }, [supabase]);

  React.useEffect(() => {
    void loadCompanyTaxDefaults();
  }, [loadCompanyTaxDefaults]);

  useOnAppSync(
    React.useCallback(() => {
      void loadCompanyTaxDefaults();
    }, [loadCompanyTaxDefaults]),
    [loadCompanyTaxDefaults]
  );

  React.useEffect(() => {
    if (taxTouched) return;
    const pct = Math.max(0, Number(defaultTaxPct) || 0);
    if (!(pct > 0)) {
      if (tax !== 0) setTax(0);
      return;
    }
    const computed = summary.subtotal * (pct / 100);
    if (Number.isFinite(computed)) setTax(Number(computed.toFixed(2)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultTaxPct, summary.subtotal, taxTouched]);

  const applyCustomerSelection = React.useCallback((customer: CustomerOption) => {
    setSelectedCustomer(customer);
    setClientName(customer.name ?? "");
    setAddress((prev) => (!prev.trim() ? (customer.address ?? "") : prev));
    setPhone((prev) => (!prev.trim() ? (customer.phone ?? "") : prev));
    setEmail((prev) => (!prev.trim() ? (customer.email ?? "") : prev));
  }, []);

  const handleCustomerPickerChange = React.useCallback(
    (customerId: string | null, customer?: CustomerOption | null) => {
      if (!customerId || !customer) {
        setSelectedCustomer(null);
        return;
      }
      applyCustomerSelection(customer);
    },
    [applyCustomerSelection]
  );

  const beginEstimateInfoEdit = () => {
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (saving) return;
    setSubmitAttempted(true);
    const client = clientName.trim();
    const project = projectName.trim();
    if (validationErrors.length > 0) {
      const msg = validationErrors[0] ?? "Please complete the estimate.";
      setFormError(msg);
      setIsEditing(true);
      toast({ title: "Estimate is incomplete", description: msg, variant: "error" });
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const res = await createEstimateWithItemsAction({
        clientName: client,
        projectName: project,
        address,
        clientPhone: phone,
        clientEmail: email,
        estimateDate: estimateDate || undefined,
        validUntil: validUntil || undefined,
        notes: notes.trim() || undefined,
        salesPerson: salesPerson.trim() || undefined,
        tax,
        discount,
        overheadPct: overheadPct / 100,
        profitPct: profitPct / 100,
        costCategoryNames: Object.keys(categoryNames).length ? categoryNames : undefined,
        items: lineItems
          .map((li) => {
            const title = li.title.trim();
            const description = li.description.trim();
            return {
              costCode: li.costCode,
              desc: description ? `${title || "Line item"}\n${description}` : title,
              qty: li.qty,
              unit: li.unit,
              unitCost: li.unitPrice,
              markupPct: li.markupPct,
            };
          })
          .filter((li) => li.desc.trim().length > 0),
        paymentSchedule: paymentMilestones.length
          ? paymentMilestones.map((m) => ({
              title: m.title,
              amountType: m.amountType,
              value: m.value,
              dueRule: m.dueRule,
              dueDate: m.dueDate || null,
              notes: m.notes ?? null,
            }))
          : undefined,
      });
      if (!res.ok || !res.estimateId) {
        const msg = res.error ?? "操作失败";
        setFormError(msg);
        toast({ title: "Create failed", description: msg, variant: "error" });
        return;
      }
      setIsEditing(false);
      toast({ title: "Created", description: "Estimate created.", variant: "success" });
      router.push(`/estimates/${res.estimateId}?created=1`);
    } finally {
      setSaving(false);
    }
  };

  const totalScheduled = paymentMilestones.reduce(
    (sum, m) => sum + (m.amountType === "percent" ? (summary.grandTotal * m.value) / 100 : m.value),
    0
  );
  const remaining = Math.max(0, summary.grandTotal - totalScheduled);
  const resetPaymentDraft = () => {
    setPmTitle("");
    setPmAmountType("percent");
    setPmValue("");
    setPmDueRule("");
    setPmDueDate("");
    setPmNotes("");
  };
  const addPaymentMilestoneLocal = () => {
    const title = pmTitle.trim();
    if (!title) return;
    const value = Number(pmValue) || 0;
    setPaymentMilestones((prev) => [
      ...prev,
      {
        id: `pm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title,
        amountType: pmAmountType,
        value,
        dueRule: pmDueRule.trim(),
        dueDate: pmDueDate || undefined,
        notes: pmNotes.trim() || undefined,
      },
    ]);
    setScheduleOpen(false);
    resetPaymentDraft();
  };

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-10 lg:items-start">
      <div className="min-w-0 space-y-8 pb-[calc(10rem+env(safe-area-inset-bottom))] lg:pb-0">
        <header className="border-b border-border/60 pb-4">
          <Link
            href="/estimates"
            className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground"
          >
            ← Estimates
          </Link>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
            New Estimate
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Draft · {estimateDate}</p>
        </header>

        {formError ? (
          <div
            role="alert"
            className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          >
            {formError}
          </div>
        ) : null}

        {/* B. Compact Estimate Information */}
        <section className="border-b border-border/60 pb-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">Customer & project</h2>
              <p className="mt-0.5 text-xs text-muted-foreground truncate">
                {clientName || "Client"} · {projectName || "Project"} · Draft
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isEditing ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="btn-outline-ghost rounded-md h-8"
                  onClick={() => setIsEditing(false)}
                  disabled={saving}
                >
                  Hide details
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="btn-outline-ghost rounded-md h-8 text-muted-foreground hover:text-foreground"
                  onClick={beginEstimateInfoEdit}
                >
                  Edit
                </Button>
              )}
            </div>
          </div>

          <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Client
              </div>
              <div className="truncate font-medium text-foreground">{clientName || "—"}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Project
              </div>
              <div className="truncate font-medium text-foreground">{projectName || "—"}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Estimate #
              </div>
              <div className="truncate font-medium text-foreground tabular-nums">
                Auto-generated
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Status
              </div>
              <div className="truncate font-medium text-foreground">Draft</div>
            </div>
            <div className="min-w-0 md:col-span-2">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Address
              </div>
              <div className="truncate text-muted-foreground">{address || "—"}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Phone
              </div>
              <div className="truncate text-muted-foreground">{phone || "—"}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Email
              </div>
              <div className="truncate text-muted-foreground">{email || "—"}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Estimate Date
              </div>
              <div className="tabular-nums text-muted-foreground">{estimateDate}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Valid Until
              </div>
              <div className="tabular-nums text-muted-foreground">{validUntil || "—"}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Sales
              </div>
              <div className="truncate text-muted-foreground">{salesPerson || "—"}</div>
            </div>
            <div className="min-w-0 md:col-span-2 lg:col-span-3">
              <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                Notes
              </div>
              <div className="truncate text-muted-foreground">{notes || "—"}</div>
            </div>
          </div>

          {isEditing && (
            <div className="p-4 pt-0 space-y-4 border-t border-zinc-200/60 dark:border-border animate-in fade-in-0 transition-all duration-200 ease-in-out">
              <div className="border-b border-zinc-200/60 dark:border-border pb-4">
                <CustomerSelectWithAdd
                  label="Select customer"
                  value={selectedCustomer?.id ?? null}
                  onChange={handleCustomerPickerChange}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="clientName" className="text-xs">
                    Client / Customer
                  </Label>
                  <Input
                    id="clientName"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Client or company name"
                    className="h-8 rounded-md text-sm"
                    aria-invalid={submitAttempted && !clientName.trim()}
                    required
                  />
                  {submitAttempted && !clientName.trim() ? (
                    <p className="text-xs text-rose-600">Client name is required.</p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="projectName" className="text-xs">
                    Project
                  </Label>
                  <Input
                    id="projectName"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Project name"
                    className="h-8 rounded-md text-sm"
                    aria-invalid={submitAttempted && !projectName.trim()}
                    required
                  />
                  {submitAttempted && !projectName.trim() ? (
                    <p className="text-xs text-rose-600">Project name is required.</p>
                  ) : null}
                </div>
              </div>
              <div className="space-y-1.5 pt-2 border-t border-zinc-200/60 dark:border-border">
                <Label htmlFor="address" className="text-xs">
                  Address
                </Label>
                <Input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Site or client address"
                  className="h-8 rounded-md text-sm"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-zinc-200/60 dark:border-border">
                <div className="space-y-1.5">
                  <Label htmlFor="clientPhone" className="text-xs">
                    Phone
                  </Label>
                  <Input
                    id="clientPhone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Phone"
                    className="h-8 rounded-md text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="clientEmail" className="text-xs">
                    Email
                  </Label>
                  <Input
                    id="clientEmail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    className="h-8 rounded-md text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-zinc-200/60 dark:border-border">
                <div className="space-y-1.5">
                  <Label className="text-xs">Estimate Number</Label>
                  <Input
                    placeholder="Auto-generated"
                    className="h-8 rounded-md text-sm bg-muted/50"
                    disabled
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Estimate Date</Label>
                  <Input
                    type="date"
                    value={estimateDate}
                    className="h-8 rounded-md text-sm"
                    readOnly
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Valid Until</Label>
                  <Input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="h-8 rounded-md text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Input value="Draft" className="h-8 rounded-md text-sm bg-muted/50" readOnly />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-zinc-200/60 dark:border-border">
                <div className="space-y-1.5">
                  <Label className="text-xs">Sales Person</Label>
                  <Input
                    value={salesPerson}
                    onChange={(e) => setSalesPerson(e.target.value)}
                    placeholder="Optional"
                    className="h-8 rounded-md text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Notes</Label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional notes"
                    className="h-8 rounded-md text-sm"
                  />
                </div>
              </div>
            </div>
          )}
        </section>

        <EstimateLineItemsLocal
          costCodes={costCodes}
          lineItems={lineItems as EditorLineItem[]}
          onLineItemsChange={(items) => setLineItems(items as LineItem[])}
          categoryNames={categoryNames}
          onCategoryNamesChange={setCategoryNames}
          disabled={saving}
          submitAttempted={submitAttempted}
          lineItemsError={
            submitAttempted && !hasValidLineItem ? "At least one line item is required." : null
          }
        />

        <EstimateBuilderAdvanced title="Payment schedule">
          <section>
            <div className="px-4 py-3 border-b border-zinc-200/60 dark:border-border bg-muted/20 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">Payment Schedule</h2>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-md h-8"
                onClick={() => setScheduleOpen(true)}
                disabled={saving}
              >
                <Plus className="h-4 w-4 mr-2" />
                Schedule Payment
              </Button>
            </div>
            <div className="px-4 py-3 flex flex-wrap items-center gap-6 text-sm border-b border-zinc-200/60 dark:border-border">
              <span className="text-muted-foreground">
                Estimate total{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {formatEstimateCurrency(summary.grandTotal)}
                </span>
              </span>
              <span className="text-muted-foreground">
                Scheduled{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {formatEstimateCurrency(totalScheduled)}
                </span>
              </span>
              <span className="text-muted-foreground">
                Remaining{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {formatEstimateCurrency(remaining)}
                </span>
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200/60 dark:border-border bg-muted/10">
                    <th className="text-left py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                      Payment Name
                    </th>
                    <th className="text-right py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium tabular-nums">
                      Amount
                    </th>
                    <th className="text-left py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                      Payment Terms
                    </th>
                    <th className="text-left py-2 px-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                      Due Date
                    </th>
                    <th className="w-16" />
                  </tr>
                </thead>
                <tbody>
                  {paymentMilestones.length === 0 ? (
                    <tr className="border-b border-zinc-100/50 dark:border-border/30">
                      <td
                        colSpan={5}
                        className="py-8 px-4 text-center text-sm text-muted-foreground"
                      >
                        No payment milestones yet.
                      </td>
                    </tr>
                  ) : (
                    paymentMilestones.map((m) => {
                      const amount =
                        m.amountType === "percent" ? (summary.grandTotal * m.value) / 100 : m.value;
                      return (
                        <tr
                          key={m.id}
                          className="table-row-compact border-b border-zinc-100/50 dark:border-border/30 hover:bg-muted/20 transition-colors"
                        >
                          <td className="py-2 px-4 font-medium text-foreground">{m.title}</td>
                          <td className="py-2 px-4 text-right tabular-nums font-medium text-foreground">
                            {formatEstimateCurrency(amount)}
                          </td>
                          <td className="py-2 px-4 text-muted-foreground">{m.dueRule || "—"}</td>
                          <td className="py-2 px-4 text-muted-foreground tabular-nums">
                            {m.dueDate || "—"}
                          </td>
                          <td className="py-2 px-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="btn-outline-ghost h-8 w-8 text-destructive"
                              onClick={() =>
                                setPaymentMilestones((prev) => prev.filter((x) => x.id !== m.id))
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <Sheet
              open={scheduleOpen}
              onOpenChange={(open) => {
                setScheduleOpen(open);
                if (!open) resetPaymentDraft();
              }}
            >
              <SheetContent side="right" className="w-[420px] sm:w-[480px]">
                <SheetHeader>
                  <SheetTitle>Schedule Payment</SheetTitle>
                </SheetHeader>
                <div className="mt-4 space-y-4">
                  <div className="space-y-1">
                    <Label htmlFor="pm-title" className="text-xs">
                      Payment Name
                    </Label>
                    <Input
                      id="pm-title"
                      value={pmTitle}
                      onChange={(e) => setPmTitle(e.target.value)}
                      placeholder="e.g. Deposit"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Amount</Label>
                    <div className="flex gap-2">
                      <select
                        value={pmAmountType}
                        onChange={(e) => setPmAmountType(e.target.value as "percent" | "fixed")}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm flex-1"
                      >
                        <option value="fixed">Fixed</option>
                        <option value="percent">Percent</option>
                      </select>
                      <Input
                        value={pmValue}
                        onChange={(e) => setPmValue(e.target.value)}
                        type="number"
                        step="0.01"
                        min={0}
                        placeholder={pmAmountType === "percent" ? "30" : "2500"}
                        className="h-9 w-28 text-right"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pm-terms" className="text-xs">
                      Payment Terms
                    </Label>
                    <Input
                      id="pm-terms"
                      value={pmDueRule}
                      onChange={(e) => setPmDueRule(e.target.value)}
                      placeholder="e.g. Due on signing"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pm-dueDate" className="text-xs">
                      Due Date
                    </Label>
                    <Input
                      id="pm-dueDate"
                      value={pmDueDate}
                      onChange={(e) => setPmDueDate(e.target.value)}
                      type="date"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pm-notes" className="text-xs">
                      Notes
                    </Label>
                    <textarea
                      id="pm-notes"
                      value={pmNotes}
                      onChange={(e) => setPmNotes(e.target.value)}
                      placeholder="Optional"
                      className="min-h-[96px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <Button type="button" className="rounded-md" onClick={addPaymentMilestoneLocal}>
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-md"
                      onClick={() => {
                        setScheduleOpen(false);
                        resetPaymentDraft();
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </section>
        </EstimateBuilderAdvanced>
      </div>

      <aside className="hidden lg:block lg:sticky lg:top-6">
        <EstimateBuilderSummary
          summary={{
            materialCost: summary.materialCost,
            laborCost: summary.laborCost,
            subcontractorCost: summary.subcontractorCost,
            subtotal: summary.subtotal,
            tax: summary.tax,
            discount: summary.discount,
            markup: summary.overhead + summary.profit,
            grandTotal: summary.grandTotal,
            overheadPct: overheadPct / 100,
            profitPct: profitPct / 100,
            overhead: summary.overhead,
            profit: summary.profit,
          }}
          showInternal
          editable={{
            tax,
            discount,
            markupPct: overheadPct + profitPct,
            onTaxChange: setTax,
            onDiscountChange: setDiscount,
            onMarkupPctChange: (v) => {
              setOverheadPct(v / 2);
              setProfitPct(v / 2);
            },
            onTaxTouched: () => setTaxTouched(true),
          }}
        />
      </aside>

      <div
        className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 border-t border-border/60 bg-background/95 px-4 py-3 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-sm lg:hidden"
        aria-label="Estimate total"
      >
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-sm font-medium text-muted-foreground">Total</span>
          <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
            {formatEstimateCurrency(summary.grandTotal)}
          </span>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" asChild className="min-h-11 flex-1 rounded-sm">
            <Link href="/estimates">Cancel</Link>
          </Button>
          <Button onClick={handleSave} disabled={saving} className="min-h-11 flex-1 rounded-sm">
            <SubmitSpinner loading={saving} className="mr-2" />
            {saving ? "Saving…" : "Save Estimate"}
          </Button>
        </div>
        {submitAttempted && validationErrors.length > 0 ? (
          <p className="mt-2 text-center text-xs text-muted-foreground">{validationErrors[0]}</p>
        ) : null}
      </div>

      <div className="hidden lg:col-span-2 lg:flex lg:justify-end lg:gap-2 lg:pt-2">
        <Button type="button" variant="outline" asChild className="min-h-11 rounded-sm">
          <Link href="/estimates">Cancel</Link>
        </Button>
        <Button onClick={handleSave} disabled={saving} className="min-h-11 rounded-sm px-6">
          <SubmitSpinner loading={saving} className="mr-2" />
          {saving ? "Saving…" : "Save Estimate"}
        </Button>
      </div>
    </div>
  );
}
