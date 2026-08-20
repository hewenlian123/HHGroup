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
import { FileText, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useToast } from "@/components/toast/toast-provider";
import { cn } from "@/lib/utils";
import { formatEstimateCurrency } from "../_components/estimate-currency";
import {
  parsePaymentPercentInput,
  paymentAmountFromPercent,
  paymentPercentFromAmount,
} from "../_components/estimate-payment-percent";
import {
  EstimateBuilderCompactSummary,
  EstimateBuilderMobileSummary,
} from "../_components/estimate-builder-summary";
import { EstimateBuilderAdvanced } from "../_components/estimate-builder-advanced";
import { EstimateNewCustomerSection } from "../_components/estimate-new-customer-section";
import { EstimateBuilderShell } from "../_components/estimate-builder-shell";
import { EstimateLineItemsLocal } from "../_components/estimate-line-items-local";
import { ProposalScopeEditor } from "../_components/proposal-scope-editor";
import { ProposalPaymentMilestoneList } from "../_components/proposal-payment-milestone-list";
import {
  EB,
  ebGlassPanel,
  ebInput,
  ebSheetGlassNarrow,
  ebSheetInput,
} from "../_components/estimate-builder-ui";
import type { EditorLineItem } from "../_components/estimate-line-item-model";
import {
  EstimateNotesClarifications,
  type EstimateNoteBlock,
} from "../_components/estimate-notes-clarifications";
import {
  DEFAULT_LINE_ITEM_STATUS,
  type EstimateLineItemStatus,
} from "../_components/estimate-line-item-status";
import type { CustomerOption } from "@/components/customers/customer-select-with-add";
import type { EstimateDocumentStyle } from "@/lib/estimate-document-style";
import type { EstimateTemplateRecord } from "@/lib/estimate-templates";
import { createProposalSectionId } from "../_components/estimate-section-templates";
import {
  EstimateBuilderSaveStatus,
  type EstimateSaveStatus,
} from "../_components/estimate-builder-save-status";
import { useEstimateUnsavedWarning } from "../_components/use-estimate-unsaved-warning";
import {
  buildOrderedEstimateCategoryNames,
  isEstimateSaveShortcut,
  reconcileEstimateSectionOrder,
} from "../_components/estimate-builder-productivity";
import {
  buildEstimatePreviewHref,
  captureEstimateBuilderReturnContext,
} from "../_components/estimate-workflow-continuity";
import {
  ESTIMATE_HEADER_BUTTON,
  ESTIMATE_HEADER_PRIMARY_BUTTON,
  EstimateWorkspaceCommandHeader,
} from "../_components/estimate-workspace-command-header";

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
  hideAmountOnPdf: boolean;
  status?: EstimateLineItemStatus;
};

function lineTotal(li: LineItem): number {
  return li.qty * li.unitPrice;
}

const LINE_ITEM_STATUSES = new Set<EstimateLineItemStatus>([
  "included",
  "optional",
  "allowance",
  "excluded",
  "owner_supplied",
]);

function normalizeTemplateLineItemStatus(status: unknown): EstimateLineItemStatus {
  return LINE_ITEM_STATUSES.has(status as EstimateLineItemStatus)
    ? (status as EstimateLineItemStatus)
    : DEFAULT_LINE_ITEM_STATUS;
}

function EstimateTemplateSelector({
  templates,
  selectedTemplateId,
  onTemplateChange,
}: {
  templates: EstimateTemplateRecord[];
  selectedTemplateId: string;
  onTemplateChange: (templateId: string) => void;
}) {
  return (
    <section className="eb-estimate-template-tool" data-testid="estimate-template-selector">
      <div className={ebGlassPanel("px-3 py-2 sm:px-4")}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="eb-estimate-template-tool-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--eb-border)] bg-[var(--eb-bg-soft)] text-[var(--eb-muted)]">
              <Sparkles className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="whitespace-nowrap text-[12.5px] font-semibold leading-snug text-foreground sm:text-[13px]">
                Start from template
              </h2>
              <p className="hidden truncate text-[11.5px] leading-snug text-muted-foreground sm:block">
                Optional reusable scope
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <select
              value={selectedTemplateId}
              onChange={(event) => onTemplateChange(event.target.value)}
              className={ebInput(
                "min-h-11 w-[7.5rem] min-w-0 shrink-0 px-2 text-sm sm:w-[11rem] sm:px-3 md:h-8 md:min-h-8 md:w-[220px]"
              )}
              aria-label="Estimate template"
              data-testid="estimate-template-select"
            >
              <option value="">Blank Estimate</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              asChild
              className={cn(
                "min-h-11 w-11 shrink-0 px-0 sm:w-auto sm:px-3 md:min-h-8",
                EB.actionSecondary
              )}
            >
              <Link href="/estimate-templates" aria-label="Estimate templates">
                <FileText className="h-4 w-4 sm:mr-2" />
                <span className="sr-only sm:not-sr-only">Templates</span>
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function NewEstimateEditor({
  costCodes,
  initialDefaultTaxPct = 0,
  templates = [],
  initialTemplateId,
}: {
  costCodes: CostCode[];
  initialDefaultTaxPct?: number;
  templates?: EstimateTemplateRecord[];
  initialTemplateId?: string;
}) {
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
  const [defaultTaxPct] = React.useState(() =>
    Number.isFinite(initialDefaultTaxPct) && initialDefaultTaxPct >= 0 ? initialDefaultTaxPct : 0
  );
  const [templateDefaultTaxPct, setTemplateDefaultTaxPct] = React.useState<number | null>(null);
  const [discount, setDiscount] = React.useState(0);
  const [documentStyle, setDocumentStyle] = React.useState<EstimateDocumentStyle>("proposal");
  const [categoryNames, setCategoryNames] = React.useState<Record<string, string>>({});
  const [sectionOrder, setSectionOrder] = React.useState<string[]>([]);
  const [lineItems, setLineItems] = React.useState<LineItem[]>([]);
  const [estimateNotes, setEstimateNotes] = React.useState<EstimateNoteBlock[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<EstimateSaveStatus>("idle");
  const [submitAttempted, setSubmitAttempted] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [paymentMilestones, setPaymentMilestones] = React.useState<PaymentMilestoneLocal[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState(initialTemplateId ?? "");
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [editingPaymentMilestoneId, setEditingPaymentMilestoneId] = React.useState<string | null>(
    null
  );
  const [pmTitle, setPmTitle] = React.useState("");
  const [pmDescription, setPmDescription] = React.useState("");
  const [pmAmount, setPmAmount] = React.useState("");
  const [pmPercent, setPmPercent] = React.useState("");
  const [pmDueDate, setPmDueDate] = React.useState("");
  const [pmError, setPmError] = React.useState<string | null>(null);
  const initialTemplateAppliedRef = React.useRef<string | null>(null);
  const dirtyTrackingReadyRef = React.useRef(false);
  const saveInFlightRef = React.useRef(false);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      dirtyTrackingReadyRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  React.useEffect(() => {
    if (!dirtyTrackingReadyRef.current) return;
    setDirty(true);
    setSaveStatus((current) => (current === "saving" ? current : "unsaved"));
  }, [
    address,
    categoryNames,
    clientName,
    discount,
    documentStyle,
    email,
    estimateNotes,
    lineItems,
    paymentMilestones,
    phone,
    projectName,
    salesPerson,
    sectionOrder,
    selectedCustomer?.id,
    selectedTemplateId,
    tax,
    validUntil,
  ]);

  useEstimateUnsavedWarning(dirty && !saving);

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
    const grandTotal = subtotal + tax - discount;
    return {
      materialCost,
      laborCost,
      subcontractorCost,
      subtotal,
      overhead: 0,
      profit: 0,
      tax,
      discount,
      grandTotal,
    };
  }, [lineItems, codeToType, tax, discount]);

  const hasValidLineItem = React.useMemo(
    () => lineItems.some((li) => li.title.trim().length > 0 || li.description.trim().length > 0),
    [lineItems]
  );

  React.useEffect(() => {
    setSectionOrder((prev) => {
      const next = reconcileEstimateSectionOrder(
        prev,
        categoryNames,
        lineItems.map((lineItem) => lineItem.costCode)
      );
      const unchanged = next.length === prev.length && next.every((code, i) => code === prev[i]);
      return unchanged ? prev : next;
    });
  }, [categoryNames, lineItems]);

  const costCategoryNamesForSave = React.useCallback((): Record<string, string> | undefined => {
    const catalogNameByCode = Object.fromEntries(costCodes.map((code) => [code.code, code.name]));
    const names = buildOrderedEstimateCategoryNames(
      sectionOrder,
      categoryNames,
      lineItems.map((lineItem) => lineItem.costCode),
      catalogNameByCode
    );
    return Object.keys(names).length > 0 ? names : undefined;
  }, [lineItems, sectionOrder, categoryNames, costCodes]);

  const lineItemsForSave = React.useCallback((): LineItem[] => {
    const codesInItems = [...new Set(lineItems.map((li) => li.costCode))];
    const orderedCodes =
      sectionOrder.length > 0 ? sectionOrder.filter((c) => codesInItems.includes(c)) : codesInItems;
    const missingCodes = codesInItems.filter((c) => !orderedCodes.includes(c));
    const allCodes = [...orderedCodes, ...missingCodes];
    const out: LineItem[] = [];
    for (const code of allCodes) {
      out.push(...lineItems.filter((li) => li.costCode === code));
    }
    return out;
  }, [lineItems, sectionOrder]);

  const validationErrors = React.useMemo(() => {
    const errors: string[] = [];
    if (!clientName.trim()) errors.push("Client name is required.");
    if (!projectName.trim()) errors.push("Project name is required.");
    if (!hasValidLineItem) errors.push("At least one line item is required.");
    return errors;
  }, [clientName, hasValidLineItem, projectName]);

  React.useEffect(() => {
    if (taxTouched) return;
    const pct = Math.max(0, Number(templateDefaultTaxPct ?? defaultTaxPct) || 0);
    if (!(pct > 0)) {
      if (tax !== 0) setTax(0);
      return;
    }
    const computed = summary.subtotal * (pct / 100);
    if (Number.isFinite(computed)) setTax(Number(computed.toFixed(2)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultTaxPct, summary.subtotal, taxTouched, templateDefaultTaxPct]);

  const applyEstimateTemplate = React.useCallback(
    (template: EstimateTemplateRecord, options: { quiet?: boolean } = {}): void => {
      const usedSectionIds = new Set<string>();
      const nextCategoryNames: Record<string, string> = {};
      const nextSectionOrder: string[] = [];
      const nextLineItems: LineItem[] = [];

      template.templateData.sections.forEach((section, sectionIndex) => {
        const code = createProposalSectionId(usedSectionIds);
        usedSectionIds.add(code);
        const sectionTitle = section.title.trim() || `Section ${sectionIndex + 1}`;
        nextCategoryNames[code] = sectionTitle;
        nextSectionOrder.push(code);
        section.items.forEach((item) => {
          nextLineItems.push({
            id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            costCode: code,
            title: item.title,
            description: item.description,
            qty: item.qty,
            unit: item.unit || "EA",
            unitPrice: item.unitPrice,
            hideAmountOnPdf: Boolean(item.hideAmountOnPdf),
            status: normalizeTemplateLineItemStatus(item.status),
          });
        });
      });

      const templateNotes = template.templateData.notes ?? [];
      const notesWithTerms = [...templateNotes];
      const hasPaymentTerms = notesWithTerms.some((note) => note.type === "payment_terms");
      if (template.defaultTerms && !hasPaymentTerms) {
        notesWithTerms.push({
          id: `note-template-terms-${Date.now()}`,
          type: "payment_terms",
          title: "Payment Terms",
          body: template.defaultTerms,
        });
      }

      setCategoryNames(nextCategoryNames);
      setSectionOrder(nextSectionOrder);
      setLineItems(nextLineItems);
      setEstimateNotes(
        notesWithTerms.map((note) => ({
          ...note,
          id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        }))
      );
      setTemplateDefaultTaxPct(template.defaultTaxRate);
      setTaxTouched(false);
      setTax(0);
      setDiscount(0);

      if (!options.quiet) {
        toast({
          title: "Template applied",
          description: `${template.name} loaded into this estimate.`,
          variant: "success",
        });
      }
    },
    [toast]
  );

  const handleTemplateChange = React.useCallback(
    (templateId: string): void => {
      setSelectedTemplateId(templateId);
      if (!templateId) {
        setTemplateDefaultTaxPct(null);
        setCategoryNames({});
        setSectionOrder([]);
        setLineItems([]);
        setEstimateNotes([]);
        setTaxTouched(false);
        setTax(0);
        return;
      }
      const template = templates.find((item) => item.id === templateId);
      if (template) applyEstimateTemplate(template);
    },
    [applyEstimateTemplate, templates]
  );

  React.useEffect(() => {
    if (!initialTemplateId || initialTemplateAppliedRef.current === initialTemplateId) return;
    const template = templates.find((item) => item.id === initialTemplateId);
    if (!template) return;
    initialTemplateAppliedRef.current = initialTemplateId;
    setSelectedTemplateId(initialTemplateId);
    applyEstimateTemplate(template, { quiet: true });
  }, [applyEstimateTemplate, initialTemplateId, templates]);

  /** Link customer: name always; phone / email / address only when the field is still empty. */
  const applyCustomerSelection = React.useCallback((customer: CustomerOption) => {
    setSelectedCustomer(customer);
    setClientName((customer.name ?? "").trim());
    const nextAddress = (customer.address ?? "").trim();
    const nextPhone = (customer.phone ?? "").trim();
    const nextEmail = (customer.email ?? "").trim();
    setAddress((prev) => (!prev.trim() && nextAddress ? nextAddress : prev));
    setPhone((prev) => (!prev.trim() && nextPhone ? nextPhone : prev));
    setEmail((prev) => (!prev.trim() && nextEmail ? nextEmail : prev));
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

  const handleSave = async (destination: "detail" | "preview" = "detail") => {
    if (saving || saveInFlightRef.current) return;
    const returnContext = destination === "preview" ? captureEstimateBuilderReturnContext() : null;
    saveInFlightRef.current = true;
    setSubmitAttempted(true);
    const client = clientName.trim();
    const project = projectName.trim();
    if (validationErrors.length > 0) {
      const msg = validationErrors[0] ?? "Please complete the estimate.";
      setFormError(msg);
      toast({ title: "Estimate is incomplete", description: msg, variant: "error" });
      saveInFlightRef.current = false;
      return;
    }

    setSaving(true);
    setSaveStatus("saving");
    setFormError(null);
    try {
      const res = await createEstimateWithItemsAction({
        customerId: selectedCustomer?.id,
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
        overheadPct: 0,
        profitPct: 0,
        documentStyle,
        costCategoryNames: costCategoryNamesForSave(),
        documentNotes: estimateNotes,
        items: lineItemsForSave()
          .map((li, index) => {
            const title = li.title.trim();
            const description = li.description.trim();
            return {
              costCode: li.costCode,
              desc: description ? `${title || "Line item"}\n${description}` : title,
              qty: li.qty,
              unit: li.unit,
              unitCost: li.unitPrice,
              markupPct: 0,
              hideAmountOnPdf: li.hideAmountOnPdf,
              status: li.status ?? DEFAULT_LINE_ITEM_STATUS,
              sortOrder: index,
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
        setSaveStatus("failed");
        toast({ title: "Create failed", description: msg, variant: "error" });
        return;
      }
      setDirty(false);
      setSaveStatus("saved");
      toast({ title: "Created", description: "Estimate created.", variant: "success" });
      router.push(
        destination === "preview"
          ? buildEstimatePreviewHref(res.estimateId, returnContext ?? {})
          : `/estimates/${res.estimateId}?created=1`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Please try again.";
      setFormError(message);
      setSaveStatus("failed");
      toast({ title: "Create failed", description: message, variant: "error" });
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  const handleSaveShortcutRef = React.useRef(handleSave);
  handleSaveShortcutRef.current = handleSave;
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!isEstimateSaveShortcut(event)) return;
      event.preventDefault();
      void handleSaveShortcutRef.current("detail");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
    setPmError(null);
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
    if (raw.trim() === "") {
      setPmAmount("");
      return;
    }
    const parsed = parsePaymentPercentInput(raw);
    if (parsed === null) return;
    setPmPercent(String(parsed));
    if (estimateTotalDollars > 0) {
      setPmAmount(String(paymentAmountFromPercent(parsed, estimateTotalDollars)));
    }
  };

  const pmPercentDisplay = pmPercent.trim() === "" ? null : Number(pmPercent);
  const pmPercentHelperText =
    estimateTotalDollars <= 0
      ? "Add estimate items to calculate by percentage."
      : pmPercentDisplay !== null && Number.isFinite(pmPercentDisplay)
        ? pmPercentDisplay > 100
          ? "Exceeds estimate total."
          : `${pmPercentDisplay}% of ${formatEstimateCurrency(estimateTotalDollars)}`
        : null;
  const savePaymentMilestoneLocal = () => {
    const title = pmTitle.trim();
    if (!title) {
      setPmError("Enter a payment name before saving this milestone.");
      return;
    }
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
      <div>
        <div className="min-w-0 space-y-4 pb-[calc(10rem+env(safe-area-inset-bottom))] lg:pb-0">
          <EstimateWorkspaceCommandHeader
            title="New Estimate"
            status="Draft"
            context={[clientName, projectName, address]}
            contextFallback="Unsaved Estimate"
            saveStatus={saveStatus}
            reserveSaveStatusSpace
            testId="estimate-new-header"
          >
            <div className="flex w-full shrink-0 flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end lg:max-w-[58%] lg:flex-nowrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "min-h-11 whitespace-nowrap px-4 max-md:flex-1 lg:min-h-8",
                  ESTIMATE_HEADER_BUTTON
                )}
                disabled={saving}
                onClick={() => setDetailsOpen(true)}
              >
                <Pencil className="mr-2 h-3.5 w-3.5" aria-hidden />
                Edit details
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleSave("preview")}
                disabled={saving}
                className={cn(
                  "hidden min-h-11 whitespace-nowrap px-4 lg:inline-flex lg:min-h-8",
                  ESTIMATE_HEADER_BUTTON
                )}
              >
                Save &amp; Preview
              </Button>
              <div className="hidden lg:contents">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleSave("detail")}
                  disabled={saving}
                  aria-busy={saving}
                  aria-label="Save Estimate"
                  className={cn(
                    "min-h-11 whitespace-nowrap px-5 font-medium lg:min-h-8",
                    ESTIMATE_HEADER_PRIMARY_BUTTON
                  )}
                >
                  <SubmitSpinner loading={saving} className="mr-2" />
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  asChild
                  className={cn(
                    "min-h-11 whitespace-nowrap px-4 lg:min-h-8",
                    ESTIMATE_HEADER_BUTTON
                  )}
                >
                  <Link href="/estimates">Cancel</Link>
                </Button>
              </div>
            </div>
          </EstimateWorkspaceCommandHeader>

          {formError ? (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
            >
              {formError}
            </div>
          ) : null}

          <div className="space-y-0">
            <EstimateTemplateSelector
              templates={templates}
              selectedTemplateId={selectedTemplateId}
              onTemplateChange={handleTemplateChange}
            />

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
              selectedCustomer={selectedCustomer}
              estimateSubtotal={summary.subtotal}
              preDiscountTotal={summary.subtotal + summary.tax}
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
              onCustomerPickerChange={handleCustomerPickerChange}
              documentStyle={documentStyle}
              onDocumentStyleChange={setDocumentStyle}
              detailsOpen={detailsOpen}
              onDetailsOpenChange={setDetailsOpen}
              showSummary={false}
            />

            <EstimateBuilderCompactSummary
              summary={{
                materialCost: summary.materialCost,
                laborCost: summary.laborCost,
                subcontractorCost: summary.subcontractorCost,
                subtotal: summary.subtotal,
                tax: summary.tax,
                discount: summary.discount,
                markup: 0,
                grandTotal: summary.grandTotal,
                overheadPct: 0,
                profitPct: 0,
                overhead: 0,
                profit: 0,
              }}
              showInternal
              paymentSummary={paymentHeaderSummary}
            />
          </div>

          <EstimateLineItemsLocal
            costCodes={costCodes}
            lineItems={
              lineItems.map((li) => ({
                ...li,
                status: li.status ?? DEFAULT_LINE_ITEM_STATUS,
              })) as EditorLineItem[]
            }
            onLineItemsChange={(items) =>
              setLineItems(
                items.map((li) => ({
                  ...li,
                  status: li.status ?? DEFAULT_LINE_ITEM_STATUS,
                })) as LineItem[]
              )
            }
            categoryNames={categoryNames}
            onCategoryNamesChange={setCategoryNames}
            sectionOrder={sectionOrder}
            onSectionOrderChange={setSectionOrder}
            disabled={saving}
            submitAttempted={submitAttempted}
            lineItemsError={
              submitAttempted && !hasValidLineItem ? "At least one line item is required." : null
            }
          />

          <EstimateNotesClarifications
            notes={estimateNotes}
            onNotesChange={setEstimateNotes}
            disabled={saving}
            defaultCollapsed
          />

          <EstimateBuilderAdvanced title="Payment schedule" defaultOpen>
            <section className={cn(EB.paymentSchedule, EB.paymentScheduleNested)}>
              <div className="flex flex-wrap items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <h3 className={cn(EB.paymentTitle, EB.paymentHeaderDuplicate)}>
                    Payment schedule
                  </h3>
                  <p className={EB.paymentSubtitle}>Client payment milestones</p>
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
                        "min-h-11 min-w-11 text-red-700 hover:bg-red-50 hover:text-red-800 md:h-8 md:min-h-8 md:w-8 md:min-w-8",
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
                          onChange={(e) => {
                            setPmTitle(e.target.value);
                            if (e.target.value.trim()) setPmError(null);
                          }}
                          placeholder="e.g. Deposit"
                          className={ebSheetInput("text-sm")}
                          aria-invalid={Boolean(pmError)}
                          aria-describedby={pmError ? "pm-title-error" : undefined}
                        />
                        {pmError ? (
                          <p id="pm-title-error" role="alert" className="text-xs text-rose-700">
                            {pmError}
                          </p>
                        ) : null}
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
                              inputMode="decimal"
                              placeholder="0.00"
                              className={ebSheetInput(
                                cn("text-sm text-right text-[#F4F7FB]", EB.inputNumeric)
                              )}
                              onWheel={(event) => event.currentTarget.blur()}
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
                              inputMode="decimal"
                              placeholder="Optional"
                              className={ebSheetInput(
                                cn("text-sm text-right text-[#F4F7FB]", EB.inputNumeric)
                              )}
                              aria-describedby={
                                pmPercentHelperText ? "pm-percent-helper" : undefined
                              }
                              onWheel={(event) => event.currentTarget.blur()}
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
      </div>

      <div
        className={cn(
          "fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 px-3 py-2 lg:hidden",
          EB.glassMobileBar
        )}
        aria-label="Estimate total"
      >
        <EstimateBuilderMobileSummary
          className="mb-1"
          summary={{
            materialCost: summary.materialCost,
            laborCost: summary.laborCost,
            subcontractorCost: summary.subcontractorCost,
            subtotal: summary.subtotal,
            tax: summary.tax,
            discount: summary.discount,
            markup: 0,
            grandTotal: summary.grandTotal,
            overheadPct: 0,
            profitPct: 0,
            overhead: 0,
            profit: 0,
          }}
        />
        <EstimateBuilderSaveStatus status={saveStatus} className="mb-1 block text-center" />
        <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.4fr)] gap-2">
          <Button
            type="button"
            variant="ghost"
            asChild
            className={cn("min-h-11 min-w-[44px] flex-1", EB.btnGhost)}
          >
            <Link href="/estimates">Cancel</Link>
          </Button>
          <Button
            onClick={() => void handleSave("detail")}
            disabled={saving}
            aria-busy={saving}
            aria-label="Save Estimate"
            className={cn("min-h-11 min-w-[44px] flex-1 px-2 font-medium", EB.btnPrimary)}
          >
            <SubmitSpinner loading={saving} className="mr-2" />
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleSave("preview")}
            disabled={saving}
            className={cn("min-h-11 min-w-[44px] px-2 font-medium", EB.btnGhost)}
          >
            Save &amp; Preview
          </Button>
        </div>
        {submitAttempted && validationErrors.length > 0 ? (
          <p className="mt-2 text-center text-xs text-muted-foreground">{validationErrors[0]}</p>
        ) : null}
      </div>
    </EstimateBuilderShell>
  );
}
