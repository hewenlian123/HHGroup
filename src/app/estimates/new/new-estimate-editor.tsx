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
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createEstimateWithItemsAction } from "./actions";
import type { CostCode } from "@/lib/data";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/toast/toast-provider";
import { useOnAppSync } from "@/hooks/use-on-app-sync";
import { createBrowserClient } from "@/lib/supabase";
import { getCompanyProfile } from "@/lib/company-profile";
import { cn } from "@/lib/utils";
import { formatEstimateCurrency } from "../_components/estimate-currency";
import {
  parsePaymentPercentInput,
  paymentAmountFromPercent,
  paymentPercentFromAmount,
} from "../_components/estimate-payment-percent";
import { EstimateBuilderSummary } from "../_components/estimate-builder-summary";
import { EstimateBuilderAdvanced } from "../_components/estimate-builder-advanced";
import { EstimateNewCustomerSection } from "../_components/estimate-new-customer-section";
import { EstimateBuilderShell } from "../_components/estimate-builder-shell";
import { EstimateLineItemsLocal } from "../_components/estimate-line-items-local";
import { ProposalScopeEditor } from "../_components/proposal-scope-editor";
import { ProposalPaymentMilestoneList } from "../_components/proposal-payment-milestone-list";
import { EB, ebSheetGlassNarrow, ebSheetInput } from "../_components/estimate-builder-ui";
import { useEstimateOverviewScrollMotion } from "../_components/use-estimate-overview-scroll-motion";
import type { EditorLineItem } from "../_components/estimate-line-item-model";
import type { CustomerOption } from "@/components/customers/customer-select-with-add";

type CostCodeType = "material" | "labor" | "subcontractor";

type PaymentMilestoneLocal = {
  id: string;
  title: string;
  description: string;
  amount: number;
  dueDate?: string;
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
  hideAmountOnPdf: boolean;
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
  const [editingPaymentMilestoneId, setEditingPaymentMilestoneId] = React.useState<string | null>(
    null
  );
  const [pmTitle, setPmTitle] = React.useState("");
  const [pmDescription, setPmDescription] = React.useState("");
  const [pmAmount, setPmAmount] = React.useState("");
  const [pmPercent, setPmPercent] = React.useState("");
  const [pmDueDate, setPmDueDate] = React.useState("");
  const { asideRef, overviewFloating } = useEstimateOverviewScrollMotion();

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
              hideAmountOnPdf: li.hideAmountOnPdf,
            };
          })
          .filter((li) => li.desc.trim().length > 0),
        paymentSchedule: paymentMilestones.length
          ? paymentMilestones.map((m) => ({
              title: m.title,
              description: m.description || null,
              amount: m.amount,
              dueDate: m.dueDate || null,
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

  const totalScheduled = paymentMilestones.reduce((sum, m) => sum + m.amount, 0);
  const remaining = Math.max(0, summary.grandTotal - totalScheduled);

  const paymentHeaderSummary = React.useMemo(() => {
    if (!paymentMilestones.length) return null;
    return {
      milestoneCount: paymentMilestones.length,
      scheduledTotal: totalScheduled,
    };
  }, [paymentMilestones, totalScheduled]);

  const estimateTotalDollars = summary.grandTotal;

  const resetPaymentDraft = () => {
    setEditingPaymentMilestoneId(null);
    setPmTitle("");
    setPmDescription("");
    setPmAmount("");
    setPmPercent("");
    setPmDueDate("");
  };
  const openPaymentMilestoneDrawer = (milestone?: PaymentMilestoneLocal) => {
    if (milestone) {
      setEditingPaymentMilestoneId(milestone.id);
      setPmTitle(milestone.title);
      setPmDescription(milestone.description);
      setPmAmount(String(milestone.amount));
      setPmPercent(
        estimateTotalDollars > 0
          ? paymentPercentFromAmount(milestone.amount, estimateTotalDollars)
          : ""
      );
      setPmDueDate(milestone.dueDate ?? "");
    } else {
      resetPaymentDraft();
    }
    setScheduleOpen(true);
  };

  const handlePmAmountChange = (raw: string): void => {
    setPmAmount(raw);
    if (estimateTotalDollars <= 0) return;
    if (raw.trim() === "") {
      setPmPercent("");
      return;
    }
    const amount = Number(raw);
    if (!Number.isFinite(amount)) return;
    setPmPercent(paymentPercentFromAmount(Math.max(0, amount), estimateTotalDollars));
  };

  const handlePmPercentChange = (raw: string): void => {
    setPmPercent(raw);
    if (raw.trim() === "") return;
    const parsed = parsePaymentPercentInput(raw);
    if (parsed === null) return;
    setPmPercent(String(parsed));
    if (estimateTotalDollars > 0) {
      setPmAmount(String(paymentAmountFromPercent(parsed, estimateTotalDollars)));
    }
  };

  const pmPercentParsed = parsePaymentPercentInput(pmPercent);
  const pmPercentHelperText =
    estimateTotalDollars <= 0
      ? "Add estimate items to calculate by percentage."
      : pmPercentParsed !== null
        ? `${pmPercentParsed}% of ${formatEstimateCurrency(estimateTotalDollars)}`
        : null;
  const savePaymentMilestoneLocal = () => {
    const title = pmTitle.trim();
    if (!title) return;
    const amount = Math.max(0, Number(pmAmount) || 0);
    const next: PaymentMilestoneLocal = {
      id: editingPaymentMilestoneId ?? `pm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      title,
      description: pmDescription.trim(),
      amount,
      dueDate: pmDueDate || undefined,
    };
    setPaymentMilestones((prev) =>
      editingPaymentMilestoneId
        ? prev.map((item) => (item.id === editingPaymentMilestoneId ? next : item))
        : [...prev, next]
    );
    setScheduleOpen(false);
    resetPaymentDraft();
  };

  return (
    <EstimateBuilderShell className="estimate-builder-new">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_18.5rem] lg:gap-7 lg:items-start">
        <div className="min-w-0 space-y-4 pb-[calc(10rem+env(safe-area-inset-bottom))] lg:pb-0">
          <header className={EB.glassHeader}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Link href="/estimates" className={EB.backLink}>
                  ← Estimates
                </Link>
                <h1 className="sr-only">New Estimate</h1>
              </div>
              <div className="hidden flex-wrap justify-end gap-2 lg:flex">
                <Button
                  type="button"
                  variant="ghost"
                  asChild
                  className={cn("min-h-11 md:min-h-8", EB.btnGhost)}
                >
                  <Link href="/estimates">Cancel</Link>
                </Button>
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className={cn("min-h-11 px-5 font-medium md:min-h-8", EB.btnPrimary)}
                >
                  <SubmitSpinner loading={saving} className="mr-2" />
                  {saving ? "Saving…" : "Save Estimate"}
                </Button>
              </div>
            </div>
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

          <EstimateBuilderAdvanced title="Payment schedule" defaultOpen>
            <section className={cn(EB.paymentSchedule, EB.paymentScheduleNested)}>
              <div className="flex flex-wrap items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <h3 className={cn(EB.paymentTitle, EB.paymentHeaderDuplicate)}>
                    Payment schedule
                  </h3>
                  <p className={EB.paymentSubtitle}>Contractor milestones</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn("min-h-11 shrink-0 px-2.5 md:min-h-8", EB.actionSecondary)}
                  onClick={() => openPaymentMilestoneDrawer()}
                  disabled={saving}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                  Schedule Payment
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-2">
                <span className={EB.paymentStatLabel}>
                  Estimate total{" "}
                  <span className={EB.paymentStatValue}>
                    {formatEstimateCurrency(summary.grandTotal)}
                  </span>
                </span>
                <span className={EB.paymentStatLabel}>
                  Scheduled{" "}
                  <span className={EB.paymentStatValue}>
                    {formatEstimateCurrency(totalScheduled)}
                  </span>
                </span>
                <span className={EB.paymentStatLabel}>
                  Remaining{" "}
                  <span className={EB.paymentStatValue}>{formatEstimateCurrency(remaining)}</span>
                </span>
              </div>
              <ProposalPaymentMilestoneList
                milestones={paymentMilestones.map((m) => ({
                  id: m.id,
                  title: m.title,
                  amount: m.amount,
                  description: m.description,
                  dueDate: m.dueDate,
                }))}
                actions={(m) => (
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className={cn(
                        "min-h-11 min-w-11 md:h-8 md:min-h-8 md:w-8 md:min-w-8",
                        EB.btnGhost
                      )}
                      aria-label={`Edit ${m.title}`}
                      onClick={() => {
                        const full = paymentMilestones.find((x) => x.id === m.id);
                        if (full) openPaymentMilestoneDrawer(full);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className={cn(
                        "min-h-11 min-w-11 text-red-300 hover:bg-red-500/10 md:h-8 md:min-h-8 md:w-8 md:min-w-8",
                        EB.btnGhost
                      )}
                      aria-label={`Delete ${m.title}`}
                      onClick={() =>
                        setPaymentMilestones((prev) => prev.filter((x) => x.id !== m.id))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              />
              <Sheet
                open={scheduleOpen}
                onOpenChange={(open) => {
                  setScheduleOpen(open);
                  if (!open) resetPaymentDraft();
                }}
              >
                <SheetContent side="right" className={ebSheetGlassNarrow(EB.shellNew)}>
                  <SheetHeader className={EB.sheetHeader}>
                    <SheetTitle className={EB.sheetTitle}>
                      {editingPaymentMilestoneId ? "Edit Payment" : "Schedule Payment"}
                    </SheetTitle>
                    <SheetDescription className="sr-only">
                      Add a payment milestone to this estimate.
                    </SheetDescription>
                  </SheetHeader>
                  <div className={EB.sheetContent}>
                    <div className={cn(EB.sheetContentInner, "max-w-none space-y-[1.125rem]")}>
                      <div className={EB.sheetField}>
                        <Label htmlFor="pm-title" className={EB.sheetLabel}>
                          Payment Name
                        </Label>
                        <Input
                          id="pm-title"
                          value={pmTitle}
                          onChange={(e) => setPmTitle(e.target.value)}
                          placeholder="e.g. Deposit"
                          className={ebSheetInput("text-sm")}
                        />
                      </div>
                      <div className={EB.sheetField}>
                        <div className={EB.paymentAmountRow}>
                          <div className={EB.paymentAmountCol}>
                            <Label htmlFor="pm-amount" className={EB.sheetLabel}>
                              Amount
                            </Label>
                            <Input
                              id="pm-amount"
                              value={pmAmount}
                              onChange={(e) => handlePmAmountChange(e.target.value)}
                              type="number"
                              step="0.01"
                              min={0}
                              placeholder="2500"
                              className={ebSheetInput(
                                cn("text-sm text-right text-[#F4F7FB]", EB.inputNumeric)
                              )}
                            />
                          </div>
                          <div className={EB.paymentPercentCol}>
                            <Label htmlFor="pm-percent" className={EB.sheetLabel}>
                              % of estimate
                            </Label>
                            <Input
                              id="pm-percent"
                              value={pmPercent}
                              onChange={(e) => handlePmPercentChange(e.target.value)}
                              type="number"
                              step="0.01"
                              min={0}
                              max={100}
                              placeholder="20"
                              className={ebSheetInput(
                                cn("text-sm text-right text-[#F4F7FB]", EB.inputNumeric)
                              )}
                              aria-describedby={
                                pmPercentHelperText ? "pm-percent-helper" : undefined
                              }
                            />
                          </div>
                        </div>
                        {pmPercentHelperText ? (
                          <p id="pm-percent-helper" className={EB.paymentPercentHelper}>
                            {pmPercentHelperText}
                          </p>
                        ) : null}
                      </div>
                      <div className={EB.sheetField}>
                        <Label htmlFor="pm-description" className={EB.sheetLabel}>
                          Description
                        </Label>
                        <ProposalScopeEditor
                          id="pm-description"
                          value={pmDescription}
                          onChange={setPmDescription}
                          density="comfortable"
                          showHandle={false}
                          placeholder="What this payment covers…"
                          ariaLabel="Payment milestone description"
                          className={cn(EB.sheetTextarea, "rounded-md px-2 py-2")}
                        />
                      </div>
                      <div className={EB.sheetField}>
                        <Label htmlFor="pm-dueDate" className={EB.sheetLabel}>
                          Due Date
                        </Label>
                        <Input
                          id="pm-dueDate"
                          value={pmDueDate}
                          onChange={(e) => setPmDueDate(e.target.value)}
                          type="date"
                          className={ebSheetInput(cn(EB.dateField, "text-sm"))}
                        />
                      </div>
                    </div>
                  </div>
                  <SheetFooter className={EB.sheetFooter}>
                    <div className={EB.sheetFooterActions}>
                      <Button
                        type="button"
                        size="sm"
                        className={EB.sheetPrimary}
                        onClick={savePaymentMilestoneLocal}
                      >
                        Save
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={EB.sheetSecondary}
                        onClick={() => {
                          setScheduleOpen(false);
                          resetPaymentDraft();
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </SheetFooter>
                </SheetContent>
              </Sheet>
            </section>
          </EstimateBuilderAdvanced>
        </div>

        <aside
          ref={asideRef}
          className={cn(
            "hidden lg:block lg:pl-1",
            EB.overviewStickyAside,
            overviewFloating && EB.overviewStickyFloating
          )}
        >
          <EstimateBuilderSummary
            floating
            paymentSummary={paymentHeaderSummary}
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
      </div>

      <div
        className={cn(
          "fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 px-4 py-3 lg:hidden",
          EB.glassMobileBar
        )}
        aria-label="Estimate total"
      >
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] leading-tight text-[#9EA8B8]">
            Total
          </span>
          <span
            className={cn(
              "text-[1.8125rem] font-semibold leading-none tabular-nums tracking-[-0.02em] [font-feature-settings:'tnum']",
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
            className={cn("min-h-11 min-w-[44px] flex-1", EB.btnGhost)}
          >
            <Link href="/estimates">Cancel</Link>
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className={cn("min-h-11 min-w-[44px] flex-1 font-medium", EB.btnPrimary)}
          >
            <SubmitSpinner loading={saving} className="mr-2" />
            {saving ? "Saving…" : "Save Estimate"}
          </Button>
        </div>
        {submitAttempted && validationErrors.length > 0 ? (
          <p className="mt-2 text-center text-xs text-muted-foreground">{validationErrors[0]}</p>
        ) : null}
      </div>
    </EstimateBuilderShell>
  );
}
