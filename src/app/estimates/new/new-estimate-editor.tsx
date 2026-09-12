"use client";
import { EstimatePaymentInlineRow } from "../_components/estimate-payment-inline-row";

import * as React from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SubmitSpinner } from "@/components/ui/submit-spinner";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createEstimateWithItemsAction } from "./actions";
import type { CostCode } from "@/lib/data";
import { FileText, MoreHorizontal, Plus } from "lucide-react";
import { useToast } from "@/components/toast/toast-provider";
import { cn } from "@/lib/utils";


import { EstimateBuilderMobileSummary } from "../_components/estimate-builder-summary";
import { EstimateBuilderSaveStatus } from "../_components/estimate-builder-save-status";
import { EstimateWorkspace } from "../_components/estimate-workspace";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EstimateNewCustomerSection } from "../_components/estimate-new-customer-section";
import { EstimateBuilderShell } from "../_components/estimate-builder-shell";
import { EstimateLineItemsLocal } from "../_components/estimate-line-items-local";

import { EB, ebInput, ebSheetGlassNarrow } from "../_components/estimate-builder-ui";
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
import { type EstimateSaveStatus } from "../_components/estimate-builder-save-status";
import { useEstimateUnsavedWarning } from "../_components/use-estimate-unsaved-warning";
import {
  buildOrderedEstimateCategoryNames,
  isEstimateSaveShortcut,
  reconcileEstimateSectionOrder,
} from "../_components/estimate-builder-productivity";
import {
  buildEstimatePreviewHref,
  captureEstimateBuilderReturnContext,
  reduceEstimateActiveSection,
} from "../_components/estimate-workflow-continuity";
import {
  ESTIMATE_HEADER_BUTTON,
  ESTIMATE_HEADER_PRIMARY_BUTTON,
  EstimateWorkspaceCommandHeader,
} from "../_components/estimate-workspace-command-header";
import {
  ESTIMATE_NEW_DRAFT_STORAGE_KEY,
  clearEstimateNewDraftRecovery,
  isMeaningfulEstimateNewDraft,
  parseEstimateNewDraftRecovery,
  readEstimateNewDraftRecovery,
  recoveryCandidateState,
  writeEstimateNewDraftRecovery,
  type EstimateDraftRecoveryState,
  type EstimateNewDraftData,
  type EstimateNewDraftReadResult,
} from "@/lib/estimate-new-draft-recovery";

type CostCodeType = "material" | "labor" | "subcontractor";

type PaymentMilestoneLocal = {
  id: string;
  title: string;
  description: string;
  amount: number;
  dueDate?: string;
  paymentTerm?: string | null;
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
    <section className="flex flex-wrap items-center gap-3" data-testid="estimate-template-selector">
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
  const [estimateDate, setEstimateDate] = React.useState(today);
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
  const [focusPaymentId, setFocusPaymentId] = React.useState<string | null>(null);
  const [paymentMilestones, setPaymentMilestones] = React.useState<PaymentMilestoneLocal[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState(initialTemplateId ?? "");

  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [templateOpen, setTemplateOpen] = React.useState(false);
  const [activeSectionState, setActiveSectionState] = React.useState<{
    id: string | null;
    explicit: boolean;
  }>({ id: null, explicit: false });

  const initialTemplateAppliedRef = React.useRef<string | null>(null);
  const dirtyTrackingReadyRef = React.useRef(false);
  const saveInFlightRef = React.useRef(false);
  const lastEditedAtRef = React.useRef(0);
  const lastPersistedAtRef = React.useRef(0);
  const [recoveryInitialized, setRecoveryInitialized] = React.useState(false);
  const [recoveryNotice, setRecoveryNotice] = React.useState<EstimateNewDraftReadResult>({
    state: "empty",
  });
  const [recoveryState, setRecoveryState] = React.useState<EstimateDraftRecoveryState>("unsaved");

  const recoveryDraft = React.useMemo<EstimateNewDraftData>(
    () => ({
      clientName,
      projectName,
      address,
      phone,
      email,
      selectedCustomer,
      estimateDate,
      validUntil,
      salesPerson,
      tax,
      taxTouched,
      templateDefaultTaxPct,
      discount,
      documentStyle,
      categoryNames,
      sectionOrder,
      lineItems,
      estimateNotes,
      paymentMilestones,
      selectedTemplateId,
    }),
    [
      address,
      categoryNames,
      clientName,
      discount,
      documentStyle,
      email,
      estimateDate,
      estimateNotes,
      lineItems,
      paymentMilestones,
      phone,
      projectName,
      salesPerson,
      sectionOrder,
      selectedCustomer,
      selectedTemplateId,
      tax,
      taxTouched,
      templateDefaultTaxPct,
      validUntil,
    ]
  );
  const hasMeaningfulDraft = React.useMemo(
    () => isMeaningfulEstimateNewDraft(recoveryDraft),
    [recoveryDraft]
  );

  React.useEffect(() => {
    const stored = readEstimateNewDraftRecovery();
    if (stored.state === "recoverable") {
      lastPersistedAtRef.current = stored.envelope.updatedAt;
      setRecoveryState("recoverable");
    } else if (stored.state === "stale") {
      setRecoveryState("stale");
    }
    setRecoveryNotice(stored);
    setRecoveryInitialized(true);
  }, []);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      dirtyTrackingReadyRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  React.useEffect(() => {
    if (!dirtyTrackingReadyRef.current) return;
    lastEditedAtRef.current = Date.now();
    setDirty(true);
    setRecoveryState("unsaved");
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

  React.useEffect(() => {
    if (!recoveryInitialized || recoveryNotice.state !== "empty" || !dirty) return;
    if (!hasMeaningfulDraft) {
      clearEstimateNewDraftRecovery();
      return;
    }

    const timeout = window.setTimeout(() => {
      const envelope = writeEstimateNewDraftRecovery(recoveryDraft);
      if (!envelope) {
        setRecoveryState("unsaved");
        return;
      }
      lastPersistedAtRef.current = envelope.updatedAt;
      setRecoveryState("recoverable");
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [dirty, hasMeaningfulDraft, recoveryDraft, recoveryInitialized, recoveryNotice.state]);

  React.useEffect(() => {
    const handleStorage = (event: StorageEvent): void => {
      if (event.key !== ESTIMATE_NEW_DRAFT_STORAGE_KEY) return;
      const next = parseEstimateNewDraftRecovery(event.newValue);
      if (next.state === "empty") return;
      if (next.state === "recoverable" && next.envelope.updatedAt <= lastPersistedAtRef.current) {
        return;
      }
      setRecoveryNotice(next);
      if (next.state === "stale") {
        setRecoveryState("stale");
        return;
      }
      setRecoveryState(
        dirty ? "stale" : recoveryCandidateState(next.envelope.updatedAt, lastEditedAtRef.current)
      );
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [dirty]);

  useEstimateUnsavedWarning(
    dirty && hasMeaningfulDraft && recoveryState !== "recoverable" && !saving
  );

  const applyRecoveredDraft = React.useCallback((): void => {
    if (recoveryNotice.state !== "recoverable") return;
    const recovered = recoveryNotice.envelope.draft;
    setClientName(recovered.clientName);
    setProjectName(recovered.projectName);
    setAddress(recovered.address);
    setPhone(recovered.phone);
    setEmail(recovered.email);
    setSelectedCustomer(recovered.selectedCustomer);
    setEstimateDate(recovered.estimateDate || today);
    setValidUntil(recovered.validUntil);
    setSalesPerson(recovered.salesPerson);
    setTax(recovered.tax);
    setTaxTouched(recovered.taxTouched);
    setTemplateDefaultTaxPct(recovered.templateDefaultTaxPct);
    setDiscount(recovered.discount);
    setDocumentStyle(recovered.documentStyle);
    setCategoryNames(recovered.categoryNames);
    setSectionOrder(recovered.sectionOrder);
    setLineItems(recovered.lineItems);
    setEstimateNotes(recovered.estimateNotes);
    setPaymentMilestones(recovered.paymentMilestones);
    setSelectedTemplateId(recovered.selectedTemplateId);
    setRecoveryNotice({ state: "empty" });
    lastEditedAtRef.current = Date.now();
    setDirty(true);
    setSaveStatus("unsaved");
    setRecoveryState("unsaved");
  }, [recoveryNotice, today]);

  const discardRecoveredDraft = React.useCallback((): void => {
    clearEstimateNewDraftRecovery();
    lastPersistedAtRef.current = 0;
    setRecoveryNotice({ state: "empty" });
    setRecoveryState("unsaved");
  }, []);

  const handleCancelNavigation = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>): void => {
      const hasDiscardableWork = hasMeaningfulDraft || recoveryNotice.state !== "empty";
      if (hasDiscardableWork && !window.confirm("Discard this unsaved Estimate draft?")) {
        event.preventDefault();
        return;
      }
      clearEstimateNewDraftRecovery();
      setDirty(false);
      setRecoveryState("saved");
    },
    [hasMeaningfulDraft, recoveryNotice.state]
  );

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

  const worksheetSections = React.useMemo(() => {
    const orderedCodes = [
      ...sectionOrder,
      ...lineItems.map((lineItem) => lineItem.costCode),
    ].filter((code, index, codes) => code && codes.indexOf(code) === index);
    const catalogNameByCode = new Map(costCodes.map((code) => [code.code, code.name]));

    return orderedCodes.map((code) => {
      const items = lineItems.filter((lineItem) => lineItem.costCode === code);
      return {
        id: code,
        name: categoryNames[code] ?? catalogNameByCode.get(code) ?? code,
        itemCount: items.length,
        subtotal: items.reduce((total, item) => total + lineTotal(item), 0),
        collapsed: false,
      };
    });
  }, [categoryNames, costCodes, lineItems, sectionOrder]);

  const selectedSectionId =
    activeSectionState.id &&
    worksheetSections.some((section) => section.id === activeSectionState.id)
      ? activeSectionState.id
      : (worksheetSections[0]?.id ?? null);
  const explicitActiveSectionId = activeSectionState.explicit ? selectedSectionId : null;
  const handleActiveSectionChange = React.useCallback(
    (sectionId: string, source: "explicit" | "inferred"): void => {
      setActiveSectionState((current) => reduceEstimateActiveSection(current, sectionId, source));
    },
    []
  );
  const activeSectionKey = worksheetSections.map((section) => section.id).join("|");
  React.useEffect(() => {
    setActiveSectionState((current) => {
      if (current.id && worksheetSections.some((section) => section.id === current.id)) {
        return current;
      }
      return { id: worksheetSections[0]?.id ?? null, explicit: false };
    });
  }, [activeSectionKey, worksheetSections]);

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
      
      
      

      setCategoryNames(nextCategoryNames);
      setSectionOrder(nextSectionOrder);
      setLineItems(nextLineItems);
      setEstimateNotes(
        templateNotes.map((note) => ({
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
            const description = li.description;
            return {
              costCode: li.costCode,
              itemName: title,
              desc: description,
              qty: li.qty,
              unit: li.unit,
              unitCost: li.unitPrice,
              markupPct: 0,
              hideAmountOnPdf: li.hideAmountOnPdf,
              status: li.status ?? DEFAULT_LINE_ITEM_STATUS,
              sortOrder: index,
            };
          })
          .filter((li) => li.itemName.length > 0 || li.desc.trim().length > 0),
        paymentSchedule: paymentMilestones.length
          ? paymentMilestones.map((m) => ({
              title: m.title,
              description: m.description || null,
              amount: m.amount,
              dueDate: m.dueDate || null,
              paymentTerm: m.paymentTerm ?? null,
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
      clearEstimateNewDraftRecovery();
      lastPersistedAtRef.current = 0;
      setRecoveryNotice({ state: "empty" });
      setRecoveryState("saved");
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
  

  const paymentHeaderSummary = React.useMemo(() => {
    if (!paymentMilestones.length) return null;
    return {
      milestoneCount: paymentMilestones.length,
      scheduledTotal: totalScheduled,
    };
  }, [paymentMilestones, totalScheduled]);

  return (
    <EstimateBuilderShell className="estimate-builder-new">
      <div
        data-estimate-editor-mode="new"
        data-estimate-active-section-id={selectedSectionId ?? undefined}
      >
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
            <div className="estimate-workspace-header-actions flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={ESTIMATE_HEADER_BUTTON}
                disabled={saving}
                onClick={() => void handleSave("preview")}
              >
                Preview
              </Button>
              <Button
                type="button"
                size="sm"
                className={ESTIMATE_HEADER_PRIMARY_BUTTON}
                disabled={saving}
                aria-busy={saving}
                aria-label="Save Estimate"
                onClick={() => void handleSave("detail")}
              >
                <SubmitSpinner loading={saving} className="mr-2" />
                {saving ? "Saving…" : "Save"}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={ESTIMATE_HEADER_BUTTON}
                    disabled={saving}
                    aria-label="More estimate actions"
                  >
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setDetailsOpen(true)}>
                    Edit details
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setTemplateOpen(true)}>
                    Start from template
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      href="/estimates"
                      data-ignore-unsaved-warning="true"
                      onClick={handleCancelNavigation}
                    >
                      Cancel
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </EstimateWorkspaceCommandHeader>

          {formError ? (
            <div
              role="alert"
              className="rounded-hh-standard border border-[var(--hh-danger-border)] bg-[var(--hh-danger-soft-fill)] p-3 text-hh-error text-[var(--hh-danger)]"
            >
              {formError}
            </div>
          ) : null}

          {recoveryNotice.state !== "empty" ? (
            <div
              className="flex flex-col gap-3 rounded-hh-standard border border-[var(--hh-warning-border)] bg-[var(--hh-warning-soft-fill)] p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              data-testid="estimate-recovery-notice"
              data-recovery-state={recoveryState}
              role="status"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {recoveryState === "stale" ? "Local draft needs review" : "Local draft available"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {recoveryNotice.state === "recoverable"
                    ? `${recoveryNotice.envelope.draft.clientName || "Untitled Estimate"} · ${recoveryNotice.envelope.draft.lineItems.length} item${recoveryNotice.envelope.draft.lineItems.length === 1 ? "" : "s"} · saved locally ${new Date(recoveryNotice.envelope.updatedAt).toLocaleString()}. It will not replace this page unless you recover it.`
                    : `${recoveryNotice.reason} Discard it to continue with a clean recovery state.`}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {recoveryNotice.state === "recoverable" ? (
                  <Button
                    type="button"
                    size="sm"
                    className={EB.btnPrimary}
                    onClick={applyRecoveredDraft}
                  >
                    {recoveryState === "stale" ? "Replace with recovered draft" : "Recover"}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={EB.btnGhost}
                  onClick={discardRecoveredDraft}
                >
                  Discard local draft
                </Button>
              </div>
            </div>
          ) : dirty && hasMeaningfulDraft ? (
            <p
              className="text-xs font-medium text-muted-foreground"
              data-testid="estimate-recovery-state"
              data-recovery-state={recoveryState}
              role="status"
            >
              {recoveryState === "recoverable"
                ? "Recoverable locally — authoritative Estimate is created only when you save."
                : "Unsaved — preparing local recovery."}
            </p>
          ) : null}

          <EstimateWorkspace
            mode="new"
            empty={lineItems.length === 0}
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
            paymentSummary={paymentHeaderSummary}
            onOpenDetails={() => setDetailsOpen(true)}
            onOpenPricing={() => setDetailsOpen(true)}
            details={
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
            }
            payment={
              <section className="estimate-inline-payments" aria-label="Payment Schedule">
                <h3>PAYMENT SCHEDULE</h3>
                <div
                  className="estimate-payment-entry-fields estimate-payment-columns"
                  aria-hidden="true"
                ><span /><span>Payment Name</span><span>Due</span><span>Amount</span><span className="sr-only">Actions</span></div>
                {paymentMilestones.map((milestone) => (
                  <EstimatePaymentInlineRow
                    key={milestone.id}
                    value={milestone}
                    onReorder={(sourceId, targetId) =>
                      setPaymentMilestones((previous) => {
                        const next = [...previous];
                        const from = next.findIndex((item) => item.id === sourceId),
                          to = next.findIndex((item) => item.id === targetId);
                        if (from < 0 || to < 0) return previous;
                        next.splice(to, 0, ...next.splice(from, 1));
                        return next;
                      })
                    }
                    total={summary.grandTotal}
                    disabled={saving}
                    autoFocus={milestone.id === focusPaymentId}
                    onChange={(next) =>
                      setPaymentMilestones((previous) =>
                        previous.map((item) =>
                          item.id === next.id
                            ? {
                                ...item,
                                title: next.title,
                                amount: next.amount,
                                description: next.description ?? "",
                                dueDate: next.dueDate || undefined,
                                paymentTerm: next.paymentTerm ?? null,
                              }
                            : item
                        )
                      )
                    }
                    actions={
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={saving}
                            aria-label={`Actions for ${milestone.title}`}
                          >
                            <MoreHorizontal size={16} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            onSelect={() =>
                              setPaymentMilestones((previous) => [
                                ...previous,
                                { ...milestone, id: crypto.randomUUID() },
                              ])
                            }
                          >
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className={EB.lineItemMoreMenuItemDanger}
                            onSelect={() =>
                              setPaymentMilestones((previous) =>
                                previous.filter((item) => item.id !== milestone.id)
                              )
                            }
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    }
                  />
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => {
                    const id = crypto.randomUUID();
                    setFocusPaymentId(id);
                    setPaymentMilestones((previous) => [
                      ...previous,
                      { id, title: "Payment", amount: 0, description: "" },
                    ]);
                  }}
                >
                  <Plus size={14} />
                  Add Payment
                </Button>
                
                
              </section>
            }
            notes={
              <section
                className="eb-v3-continuous-section"
                tabIndex={-1}
                aria-label="Customer Notes"
              >
                <EstimateNotesClarifications
                  notes={estimateNotes}
                  onNotesChange={setEstimateNotes}
                  disabled={saving}
                  defaultCollapsed={false}
                />
              </section>
            }
          >
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
              activeSectionId={selectedSectionId}
              explicitActiveSectionId={explicitActiveSectionId}
              onActiveSectionChange={handleActiveSectionChange}
              disabled={saving}
              submitAttempted={submitAttempted}
              lineItemsError={
                submitAttempted && !hasValidLineItem ? "At least one line item is required." : null
              }
            />
          </EstimateWorkspace>
          <Sheet open={templateOpen} onOpenChange={setTemplateOpen}>
            <SheetContent side="right" className={ebSheetGlassNarrow(EB.shellNew)}>
              <SheetHeader className={EB.sheetHeader}>
                <SheetTitle>Start from template</SheetTitle>
                <SheetDescription>Choose a saved estimate template.</SheetDescription>
              </SheetHeader>
              <div className={EB.sheetContent}>
                <EstimateTemplateSelector
                  templates={templates}
                  selectedTemplateId={selectedTemplateId}
                  onTemplateChange={handleTemplateChange}
                />
              </div>
            </SheetContent>
          </Sheet>
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
            <Link
              href="/estimates"
              data-ignore-unsaved-warning="true"
              onClick={handleCancelNavigation}
            >
              Cancel
            </Link>
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
