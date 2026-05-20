"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createEstimateWithItemsAction } from "./actions";
import type { CostCode } from "@/lib/data";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/toast/toast-provider";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { createBrowserClient } from "@/lib/supabase";
import { getCompanyProfile } from "@/lib/company-profile";
import { cn } from "@/lib/utils";
import { formatEstimateCurrency } from "../_components/estimate-currency";
import { EstimateBuilderSummary } from "../_components/estimate-builder-summary";
import { EstimateBuilderAdvanced } from "../_components/estimate-builder-advanced";
import { EstimateNewCustomerSection } from "../_components/estimate-new-customer-section";
import { EstimateBuilderShell } from "../_components/estimate-builder-shell";
import { EstimateLineItemsLocal } from "../_components/estimate-line-items-local";
import { EB, ebInput } from "../_components/estimate-builder-ui";
import type { EditorLineItem } from "../_components/estimate-line-item-model";
import type { CustomerOption } from "@/components/customers/customer-select-with-add";

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

  const handleSave = async () => {
    if (saving) return;
    setSubmitAttempted(true);
    const client = clientName.trim();
    const project = projectName.trim();
    if (validationErrors.length > 0) {
      const msg = validationErrors[0] ?? "Please complete the estimate.";
      setFormError(msg);
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
  const scheduleDrawerClass = cn(
    "w-[420px] border-white/10 bg-[rgba(14,18,28,0.96)] p-5 text-zinc-100 shadow-[inset_1px_0_0_rgba(255,255,255,0.06),-24px_0_64px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:w-[480px]",
    "[&>button]:text-zinc-400 [&>button]:hover:bg-white/[0.08] [&>button]:hover:text-zinc-100"
  );
  const scheduleLabelClass = "text-[11px] font-medium text-zinc-500";
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
    <EstimateBuilderShell>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-10 lg:items-start">
        <div className="min-w-0 space-y-5 pb-[calc(10rem+env(safe-area-inset-bottom))] lg:pb-0">
          <header className={EB.glassHeader}>
            <Link href="/estimates" className={cn(EB.backLink, "text-xs")}>
              ← Estimates
            </Link>
            <h1 className={cn("mt-3", EB.pageTitle)}>New Estimate</h1>
            <p className={cn("mt-1.5", EB.pageMeta)}>Draft · {estimateDate}</p>
          </header>

          {formError ? (
            <div
              role="alert"
              className="rounded-lg border border-rose-300/20 bg-rose-500/10 p-3 text-sm text-rose-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
            >
              {formError}
            </div>
          ) : null}

          <EstimateNewCustomerSection
            clientName={clientName}
            projectName={projectName}
            address={address}
            phone={phone}
            email={email}
            estimateDate={estimateDate}
            validUntil={validUntil}
            salesPerson={salesPerson}
            notes={notes}
            tax={tax}
            discount={discount}
            overheadPct={overheadPct}
            profitPct={profitPct}
            selectedCustomer={selectedCustomer}
            submitAttempted={submitAttempted}
            onClientNameChange={setClientName}
            onProjectNameChange={setProjectName}
            onAddressChange={setAddress}
            onPhoneChange={setPhone}
            onEmailChange={setEmail}
            onValidUntilChange={setValidUntil}
            onSalesPersonChange={setSalesPerson}
            onNotesChange={setNotes}
            onTaxChange={setTax}
            onTaxTouched={() => setTaxTouched(true)}
            onDiscountChange={setDiscount}
            onOverheadPctChange={setOverheadPct}
            onProfitPctChange={setProfitPct}
            onCustomerPickerChange={handleCustomerPickerChange}
          />

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
              <div className="flex items-center justify-between gap-3 py-2">
                <h3 className="text-sm font-medium text-foreground">Payment schedule</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn("min-h-11 px-3 md:min-h-8", EB.btnGhost)}
                  onClick={() => setScheduleOpen(true)}
                  disabled={saving}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Schedule Payment
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-6 py-2 text-sm text-muted-foreground/80">
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
                    <tr className="border-b border-border/25">
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
                          m.amountType === "percent"
                            ? (summary.grandTotal * m.value) / 100
                            : m.value;
                        return (
                          <tr
                            key={m.id}
                            className="border-b border-border/20 transition-colors hover:bg-muted/[0.03]"
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
                                className={cn(
                                  "min-h-11 min-w-11 text-red-300 hover:bg-red-500/10 md:h-8 md:min-h-8 md:w-8 md:min-w-8",
                                  EB.btnGhost
                                )}
                                aria-label="Delete payment milestone"
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
                <SheetContent side="right" className={scheduleDrawerClass}>
                  <SheetHeader>
                    <SheetTitle className="text-zinc-50">Schedule Payment</SheetTitle>
                    <SheetDescription className="sr-only">
                      Add a payment milestone to this estimate.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-4 space-y-4">
                    <div className="space-y-1">
                      <Label htmlFor="pm-title" className={scheduleLabelClass}>
                        Payment Name
                      </Label>
                      <Input
                        id="pm-title"
                        value={pmTitle}
                        onChange={(e) => setPmTitle(e.target.value)}
                        placeholder="e.g. Deposit"
                        className={ebInput("h-10 md:h-9")}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className={scheduleLabelClass}>Amount</Label>
                      <div className="flex gap-2">
                        <select
                          value={pmAmountType}
                          onChange={(e) => setPmAmountType(e.target.value as "percent" | "fixed")}
                          className={ebInput("h-10 flex-1 appearance-none md:h-9")}
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
                          className={ebInput("h-10 w-28 text-right md:h-9")}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pm-terms" className={scheduleLabelClass}>
                        Payment Terms
                      </Label>
                      <Input
                        id="pm-terms"
                        value={pmDueRule}
                        onChange={(e) => setPmDueRule(e.target.value)}
                        placeholder="e.g. Due on signing"
                        className={ebInput("h-10 md:h-9")}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pm-dueDate" className={scheduleLabelClass}>
                        Due Date
                      </Label>
                      <Input
                        id="pm-dueDate"
                        value={pmDueDate}
                        onChange={(e) => setPmDueDate(e.target.value)}
                        type="date"
                        className={ebInput(cn(EB.dateField, "h-10 md:h-9"))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pm-notes" className={scheduleLabelClass}>
                        Notes
                      </Label>
                      <textarea
                        id="pm-notes"
                        value={pmNotes}
                        onChange={(e) => setPmNotes(e.target.value)}
                        placeholder="Optional"
                        className={ebInput("min-h-[96px] resize-none py-2 leading-relaxed")}
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <Button
                        type="button"
                        className={cn(
                          "min-h-11 px-4 font-medium md:min-h-10",
                          EB.portalPrimaryButton
                        )}
                        onClick={addPaymentMilestoneLocal}
                      >
                        Save
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn("min-h-11 px-4 md:min-h-10", EB.portalGhostButton)}
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

        <aside className="hidden lg:block lg:pl-1">
          <EstimateBuilderSummary
            floating
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
          />
        </aside>

        <div
          className={cn(
            "fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 px-4 py-3 lg:hidden",
            EB.glassMobileBar
          )}
          aria-label="Estimate total"
        >
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500">
              Total
            </span>
            <span
              className={cn(
                "text-[1.75rem] font-semibold leading-none tabular-nums tracking-tight",
                EB.goldTotal
              )}
            >
              {formatEstimateCurrency(summary.grandTotal)}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              asChild
              className={cn("min-h-11 flex-1", EB.btnGhost)}
            >
              <Link href="/estimates">Cancel</Link>
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className={cn("min-h-11 flex-1 font-medium", EB.btnPrimary)}
            >
              <SubmitSpinner loading={saving} className="mr-2" />
              {saving ? "Saving…" : "Save Estimate"}
            </Button>
          </div>
          {submitAttempted && validationErrors.length > 0 ? (
            <p className="mt-2 text-center text-xs text-muted-foreground">{validationErrors[0]}</p>
          ) : null}
        </div>

        <div className="hidden lg:col-span-2 lg:flex lg:justify-end lg:gap-2 lg:pt-4">
          <Button type="button" variant="ghost" asChild className={cn("min-h-11", EB.btnGhost)}>
            <Link href="/estimates">Cancel</Link>
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className={cn("min-h-11 px-6 font-medium", EB.btnPrimary)}
          >
            <SubmitSpinner loading={saving} className="mr-2" />
            {saving ? "Saving…" : "Save Estimate"}
          </Button>
        </div>
      </div>
    </EstimateBuilderShell>
  );
}
