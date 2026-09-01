"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FinanceDatePicker } from "@/components/ui/date-picker";
import {
  CustomerSelectWithAdd,
  type CustomerOption,
} from "@/components/customers/customer-select-with-add";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EB, ebSheetInput } from "./estimate-builder-ui";
import { estimateSurfaceSheetClassName } from "./estimate-surface-sheet-class";
import {
  EstimateDiscountOptionsPopover,
  EstimateTaxPresetMenu,
  EstimateValidUntilQuickChips,
} from "./estimate-details-drawer-controls";
import {
  EstimateDocumentStyleField,
  EstimateDocumentStyleReadOnly,
} from "./estimate-document-style-field";
import type { EstimateDocumentStyle } from "@/lib/estimate-document-style";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { formatEstimateCurrency } from "./estimate-currency";

const metaLabel =
  "eb-estimate-context-label mb-0.5 block text-hh-metadata font-medium leading-tight text-muted-foreground";
const metaPanel = cn(EB.draftPanel, "eb-estimate-context-panel px-3 py-3 sm:px-4");
const metaInput = ebSheetInput("text-sm");

export type EstimateEditCustomerMeta = {
  client: { name: string; phone: string; email: string; address: string };
  project: { name: string; siteAddress: string };
  estimateDate?: string | null;
  validUntil?: string | null;
  salesPerson?: string | null;
  notes?: string | null;
  documentStyle?: EstimateDocumentStyle;
};

function ReadOnlyMetaRows({
  customer,
  project,
  address,
  estimateDate,
  documentStyle,
}: {
  customer: string;
  project: string;
  address: string;
  estimateDate: string;
  documentStyle: EstimateDocumentStyle;
}): React.ReactElement {
  return (
    <>
      <dl className="hidden grid-cols-2 gap-x-5 gap-y-3 md:grid lg:grid-cols-5 lg:gap-x-6">
        <div className="eb-estimate-context-primary col-span-2 min-w-0 sm:col-span-1">
          <dt className={metaLabel}>Customer</dt>
          <dd className="truncate text-hh-body font-medium leading-snug text-foreground">
            {customer.trim() || "—"}
          </dd>
        </div>
        <div className="eb-estimate-context-primary col-span-2 min-w-0 sm:col-span-1">
          <dt className={metaLabel}>Project</dt>
          <dd className="break-words text-hh-body font-medium leading-snug text-foreground">
            {project.trim() || "—"}
          </dd>
        </div>
        <div className="eb-estimate-context-secondary col-span-2 min-w-0 lg:col-span-1">
          <dt className={metaLabel}>Address</dt>
          <dd className="text-hh-body leading-[1.4] text-muted-foreground">
            {address.trim() || "—"}
          </dd>
        </div>
        <div className="eb-estimate-context-secondary min-w-0">
          <dt className={metaLabel}>Estimate date</dt>
          <dd className="text-hh-body tabular-nums leading-snug text-muted-foreground hh-fin">
            {estimateDate}
          </dd>
        </div>
        <EstimateDocumentStyleReadOnly value={documentStyle} />
      </dl>

      <div className="eb-estimate-context-mobile md:hidden">
        <dl className="grid gap-2.5">
          <div className="eb-estimate-context-primary min-w-0">
            <dt className={metaLabel}>Customer</dt>
            <dd className="text-hh-body font-medium leading-snug text-foreground">
              {customer.trim() || "—"}
            </dd>
          </div>
          <div className="eb-estimate-context-primary min-w-0">
            <dt className={metaLabel}>Project</dt>
            <dd className="break-words text-hh-body font-medium leading-snug text-foreground">
              {project.trim() || "—"}
            </dd>
          </div>
        </dl>
        <details
          className="eb-estimate-mobile-supporting-context"
          data-testid="estimate-mobile-supporting-context"
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-hh-table-cell font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span>More details</span>
            <span className="ml-auto truncate text-hh-metadata font-normal tabular-nums">
              {estimateDate} · {documentStyle === "itemized" ? "Itemized" : "Proposal"}
            </span>
            <ChevronDown
              className="eb-estimate-mobile-supporting-chevron h-4 w-4 shrink-0"
              aria-hidden
            />
          </summary>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 pb-1 pt-2">
            <div className="eb-estimate-context-secondary col-span-2 min-w-0">
              <dt className={metaLabel}>Address</dt>
              <dd className="text-hh-body leading-[1.4] text-muted-foreground">
                {address.trim() || "—"}
              </dd>
            </div>
            <div className="eb-estimate-context-secondary min-w-0">
              <dt className={metaLabel}>Estimate date</dt>
              <dd className="text-hh-body tabular-nums leading-snug text-muted-foreground hh-fin">
                {estimateDate}
              </dd>
            </div>
            <EstimateDocumentStyleReadOnly value={documentStyle} />
          </dl>
        </details>
      </div>
    </>
  );
}

export function EstimateEditCustomerSection({
  meta,
  estimateId,
  customerId,
  today,
  isReadOnly,
  detailsOpen: controlledDetailsOpen,
  onDetailsOpenChange,
  detailsSurface = "information",
  tax,
  discount,
  estimateSubtotal,
  saveEstimateMetaAction,
  onSaveDetails,
}: {
  meta: EstimateEditCustomerMeta;
  estimateId: string;
  customerId?: string | null;
  today: string;
  isReadOnly: boolean;
  detailsOpen?: boolean;
  onDetailsOpenChange?: (open: boolean) => void;
  detailsSurface?: "information" | "pricing";
  tax: number;
  discount: number;
  estimateSubtotal: number;
  saveEstimateMetaAction: (formData: FormData) => Promise<void>;
  onSaveDetails?: () => void;
}): React.ReactElement {
  const [uncontrolledDetailsOpen, setUncontrolledDetailsOpen] = React.useState(false);
  const detailsOpen = controlledDetailsOpen ?? uncontrolledDetailsOpen;
  const [formResetKey, setFormResetKey] = React.useState(0);
  const [estimateDate, setEstimateDate] = React.useState(meta.estimateDate ?? today);
  const [validUntil, setValidUntil] = React.useState(meta.validUntil ?? "");
  const [taxDraft, setTaxDraft] = React.useState(tax);
  const [discountDraft, setDiscountDraft] = React.useState(discount);
  const [selectedCustomerId, setSelectedCustomerId] = React.useState<string | null>(
    customerId ?? null
  );
  const [clientNameDraft, setClientNameDraft] = React.useState(meta.client.name);
  const [clientPhoneDraft, setClientPhoneDraft] = React.useState(meta.client.phone);
  const [clientEmailDraft, setClientEmailDraft] = React.useState(meta.client.email);
  const [clientAddressDraft, setClientAddressDraft] = React.useState(meta.client.address);
  const [projectNameDraft, setProjectNameDraft] = React.useState(meta.project.name);
  const [projectAddressDraft, setProjectAddressDraft] = React.useState(meta.project.siteAddress);
  const [projectOptions, setProjectOptions] = React.useState<
    Array<{ id: string; name: string; address?: string }>
  >([]);
  const [selectedProjectId, setSelectedProjectId] = React.useState("");
  const [projectsLoading, setProjectsLoading] = React.useState(false);
  const projectedCustomerTotal = estimateSubtotal + taxDraft - discountDraft;
  const discountExceedsPreDiscountTotal = projectedCustomerTotal < 0;
  const [documentStyleDraft, setDocumentStyleDraft] = React.useState<EstimateDocumentStyle>(
    meta.documentStyle ?? "proposal"
  );
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const detailsOpenerRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    // Same-value RSC refreshes replace the `meta` object identity. Depend on the
    // server-authoritative scalar values so they cannot overwrite an active draft.
    setEstimateDate(meta.estimateDate ?? today);
    setValidUntil(meta.validUntil ?? "");
    setTaxDraft(tax);
    setDiscountDraft(discount);
    setSelectedCustomerId(customerId ?? null);
    setClientNameDraft(meta.client.name);
    setClientPhoneDraft(meta.client.phone);
    setClientEmailDraft(meta.client.email);
    setClientAddressDraft(meta.client.address);
    setProjectNameDraft(meta.project.name);
    setProjectAddressDraft(meta.project.siteAddress);
    setDocumentStyleDraft(meta.documentStyle ?? "proposal");
  }, [
    customerId,
    discount,
    meta.client.address,
    meta.client.email,
    meta.client.name,
    meta.client.phone,
    meta.documentStyle,
    meta.estimateDate,
    meta.project.name,
    meta.project.siteAddress,
    meta.validUntil,
    tax,
    today,
  ]);

  React.useEffect(() => {
    if (!detailsOpen || detailsSurface !== "information" || projectOptions.length > 0) return;
    let cancelled = false;
    setProjectsLoading(true);
    fetch("/api/projects", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { projects?: Array<{ id: string; name: string; address?: string }> }) => {
        if (cancelled) return;
        const projects = Array.isArray(payload.projects) ? payload.projects : [];
        setProjectOptions(projects);
        const current = projects.find(
          (project) =>
            project.name.trim() === meta.project.name.trim() &&
            (project.address ?? "").trim() === meta.project.siteAddress.trim()
        );
        setSelectedProjectId(current?.id ?? "");
      })
      .catch(() => {
        if (!cancelled) setProjectOptions([]);
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    detailsOpen,
    detailsSurface,
    meta.project.name,
    meta.project.siteAddress,
    projectOptions.length,
  ]);

  const setDetailsOpen = React.useCallback(
    (open: boolean): void => {
      if (controlledDetailsOpen === undefined) setUncontrolledDetailsOpen(open);
      onDetailsOpenChange?.(open);
    },
    [controlledDetailsOpen, onDetailsOpenChange]
  );

  React.useEffect(() => {
    if (isReadOnly && detailsOpen) setDetailsOpen(false);
  }, [detailsOpen, isReadOnly, setDetailsOpen]);

  const displayDate = meta.estimateDate ?? today;

  const discardDetails = (): void => {
    setEstimateDate(meta.estimateDate ?? today);
    setValidUntil(meta.validUntil ?? "");
    setTaxDraft(tax);
    setDiscountDraft(discount);
    setSelectedCustomerId(customerId ?? null);
    setClientNameDraft(meta.client.name);
    setClientPhoneDraft(meta.client.phone);
    setClientEmailDraft(meta.client.email);
    setClientAddressDraft(meta.client.address);
    setProjectNameDraft(meta.project.name);
    setProjectAddressDraft(meta.project.siteAddress);
    setSelectedProjectId("");
    setDocumentStyleDraft(meta.documentStyle ?? "proposal");
    setFormResetKey((k) => k + 1);
  };

  const handleDetailsOpenChange = (open: boolean): void => {
    if (!open) {
      discardDetails();
    }
    setDetailsOpen(open);
  };

  return (
    <>
      {isReadOnly ? (
        <section
          className={cn(EB.section, "eb-estimate-details-summary-section pb-3")}
          data-testid="estimate-details-summary"
        >
          <div className={metaPanel}>
            <ReadOnlyMetaRows
              customer={meta.client.name}
              project={meta.project.name}
              address={meta.client.address}
              estimateDate={displayDate}
              documentStyle={meta.documentStyle ?? "proposal"}
            />
          </div>
        </section>
      ) : null}

      {!isReadOnly ? (
        <Sheet open={detailsOpen} onOpenChange={handleDetailsOpenChange}>
          <SheetContent
            side="right"
            className={estimateSurfaceSheetClassName(detailsSurface, "eb-estimate-details-sheet")}
            data-estimate-surface={detailsSurface}
            onOpenAutoFocus={() => {
              const activeElement = document.activeElement;
              detailsOpenerRef.current =
                activeElement instanceof HTMLElement ? activeElement : null;
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              window.requestAnimationFrame(() => detailsOpenerRef.current?.focus());
            }}
          >
            <div className="flex max-h-[100dvh] min-h-0 flex-1 flex-col overflow-hidden">
              <SheetHeader className={EB.sheetHeader}>
                <SheetTitle className={EB.sheetTitle}>
                  <span aria-hidden>
                    {detailsSurface === "pricing" ? "Estimate Terms" : "Estimate Information"}
                  </span>
                  <span className="sr-only">Customer, project, and estimate details</span>
                </SheetTitle>
                <SheetDescription className="eb-estimate-details-subtitle">
                  {detailsSurface === "pricing"
                    ? "Commercial terms, tax, discount, and validity."
                    : "Customer, project, and document context."}
                </SheetDescription>
              </SheetHeader>

              <div className={EB.sheetContent}>
                <form
                  ref={formRef}
                  key={formResetKey}
                  id="estimate-meta-form"
                  data-estimate-details-open={detailsOpen ? "true" : "false"}
                  action={saveEstimateMetaAction}
                  className={cn(EB.sheetContentInner, "eb-estimate-details-form")}
                >
                  <input type="hidden" name="estimateId" value={estimateId} />
                  <input type="hidden" name="customerId" value={selectedCustomerId ?? ""} />
                  <section
                    className={cn(
                      "eb-estimate-details-group eb-estimate-details-primary",
                      detailsSurface === "pricing" && "!hidden"
                    )}
                    data-testid="estimate-details-primary-relationships"
                    aria-label="Primary relationships"
                  >
                    <div className="eb-estimate-details-group-heading">
                      <p
                        id="estimate-primary-relationships-title"
                        className="eb-estimate-details-group-title"
                      >
                        Customer &amp; project
                      </p>
                      <p className="eb-estimate-details-group-copy">
                        The primary relationships for this estimate.
                      </p>
                    </div>
                    <div className={EB.sheetField}>
                      <CustomerSelectWithAdd
                        label="Link customer"
                        value={selectedCustomerId}
                        selectedOption={
                          selectedCustomerId
                            ? {
                                id: selectedCustomerId,
                                name: clientNameDraft,
                                phone: clientPhoneDraft,
                                email: clientEmailDraft,
                                address: clientAddressDraft,
                              }
                            : null
                        }
                        onChange={(nextCustomerId, customer?: CustomerOption | null) => {
                          setSelectedCustomerId(nextCustomerId);
                          if (!customer) return;
                          setClientNameDraft(customer.name ?? "");
                          setClientPhoneDraft(customer.phone ?? "");
                          setClientEmailDraft(customer.email ?? "");
                          setClientAddressDraft(customer.address ?? "");
                        }}
                        triggerClassName={cn(metaInput, "h-hh-control-standard justify-between")}
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className={cn(EB.sheetField, "min-w-0")}>
                        <Label htmlFor="clientName" className={EB.sheetLabel}>
                          Customer
                        </Label>
                        <Input
                          id="clientName"
                          name="clientName"
                          value={clientNameDraft}
                          onChange={(event) => setClientNameDraft(event.target.value)}
                          placeholder="Client or company name"
                          className={metaInput}
                        />
                      </div>
                      <div className={cn(EB.sheetField, "min-w-0")}>
                        <Label htmlFor="clientPhone" className={EB.sheetLabel}>
                          Phone
                        </Label>
                        <Input
                          id="clientPhone"
                          name="clientPhone"
                          type="tel"
                          value={clientPhoneDraft}
                          onChange={(event) => setClientPhoneDraft(event.target.value)}
                          placeholder="Customer phone"
                          className={metaInput}
                        />
                      </div>
                      <div className={cn(EB.sheetField, "min-w-0 sm:col-span-2")}>
                        <Label htmlFor="clientEmail" className={EB.sheetLabel}>
                          Email
                        </Label>
                        <Input
                          id="clientEmail"
                          name="clientEmail"
                          type="email"
                          value={clientEmailDraft}
                          onChange={(event) => setClientEmailDraft(event.target.value)}
                          placeholder="Customer email"
                          className={metaInput}
                        />
                      </div>
                      <div className={cn(EB.sheetField, "min-w-0 sm:col-span-2")}>
                        <Label htmlFor="clientAddress" className={EB.sheetLabel}>
                          Billing address
                        </Label>
                        <Input
                          id="clientAddress"
                          name="clientAddress"
                          value={clientAddressDraft}
                          onChange={(event) => setClientAddressDraft(event.target.value)}
                          placeholder="Customer billing address"
                          className={metaInput}
                        />
                      </div>
                      <div className={cn(EB.sheetField, "min-w-0 sm:col-span-2")}>
                        <Label htmlFor="projectPicker" className={EB.sheetLabel}>
                          Existing project
                        </Label>
                        <select
                          id="projectPicker"
                          value={selectedProjectId}
                          onChange={(event) => {
                            const id = event.target.value;
                            setSelectedProjectId(id);
                            const project = projectOptions.find((option) => option.id === id);
                            if (!project) return;
                            setProjectNameDraft(project.name);
                            setProjectAddressDraft(project.address ?? "");
                          }}
                          className={cn(metaInput, "w-full")}
                          disabled={projectsLoading}
                        >
                          <option value="">
                            {projectsLoading ? "Loading projects…" : "Choose a project to copy"}
                          </option>
                          {projectOptions.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                        <p className="eb-estimate-details-helper text-xs leading-snug">
                          Copies the canonical project name and site address. This Estimate does not
                          persist a project ID relationship.
                        </p>
                      </div>
                      <div className={cn(EB.sheetField, "min-w-0 sm:col-span-2")}>
                        <Label htmlFor="projectName" className={EB.sheetLabel}>
                          Project / reference
                        </Label>
                        <Input
                          id="projectName"
                          name="projectName"
                          value={projectNameDraft}
                          onChange={(event) => setProjectNameDraft(event.target.value)}
                          placeholder="Project name"
                          className={metaInput}
                        />
                      </div>
                    </div>
                  </section>

                  <section
                    className={cn(
                      "eb-estimate-details-group eb-estimate-details-supporting",
                      detailsSurface === "pricing" && "!hidden"
                    )}
                    data-testid="estimate-details-supporting-context"
                    aria-label="Supporting context"
                  >
                    <p id="estimate-supporting-context-title" className={EB.sheetSectionLabel}>
                      Estimate context
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className={cn(EB.sheetField, "min-w-0 sm:col-span-2")}>
                        <Label htmlFor="projectAddress" className={EB.sheetLabel}>
                          Site address
                        </Label>
                        <Input
                          id="projectAddress"
                          name="projectAddress"
                          value={projectAddressDraft}
                          onChange={(event) => setProjectAddressDraft(event.target.value)}
                          placeholder="Site or client address"
                          className={metaInput}
                        />
                      </div>
                      <div className={cn(EB.sheetField, "min-w-0 sm:col-span-2")}>
                        <Label htmlFor="estimateDate" className={EB.sheetLabel}>
                          Estimate date
                        </Label>
                        <input type="hidden" name="estimateDate" value={estimateDate} />
                        <FinanceDatePicker
                          size="sm"
                          value={estimateDate}
                          onChange={setEstimateDate}
                          className={ebSheetInput(cn(EB.dateField, "text-sm"))}
                        />
                      </div>
                    </div>

                    <EstimateDocumentStyleField
                      value={documentStyleDraft}
                      onChange={setDocumentStyleDraft}
                    />
                  </section>

                  <section
                    className={cn(
                      "eb-estimate-details-group eb-estimate-details-terms",
                      detailsSurface === "information" && "!hidden"
                    )}
                    data-testid="estimate-details-terms"
                    aria-label="Commercial terms"
                  >
                    <p id="estimate-terms-title" className={EB.sheetSectionLabel}>
                      Quote terms
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className={cn(EB.sheetField, "min-w-0")}>
                        <Label htmlFor="validUntil" className={EB.sheetLabel}>
                          Valid until
                        </Label>
                        <input type="hidden" name="validUntil" value={validUntil} />
                        <FinanceDatePicker
                          size="sm"
                          value={validUntil}
                          onChange={setValidUntil}
                          className={ebSheetInput(cn(EB.dateField, "text-sm"))}
                          allowClear
                        />
                        <EstimateValidUntilQuickChips
                          estimateDate={estimateDate}
                          onValidUntilChange={setValidUntil}
                        />
                      </div>
                      <div className={cn(EB.sheetField, "min-w-0")}>
                        <Label htmlFor="salesPerson" className={EB.sheetLabel}>
                          Sales
                        </Label>
                        <Input
                          id="salesPerson"
                          name="salesPerson"
                          defaultValue={meta.salesPerson ?? ""}
                          placeholder="Name"
                          className={metaInput}
                        />
                      </div>
                      <div className={cn(EB.sheetField, "min-w-0")}>
                        <div className={EB.sheetLabelRow}>
                          <Label htmlFor="tax" className={EB.sheetLabel}>
                            Tax amount
                          </Label>
                          <EstimateTaxPresetMenu
                            estimateSubtotal={estimateSubtotal}
                            tax={taxDraft}
                            onApplyTax={setTaxDraft}
                            onTaxTouched={() => undefined}
                          />
                        </div>
                        <Input
                          id="tax"
                          name="tax"
                          type="number"
                          step="0.01"
                          min={0}
                          value={taxDraft}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setTaxDraft(Number.isFinite(n) ? Math.max(0, n) : 0);
                          }}
                          className={ebSheetInput(cn("text-sm text-foreground", EB.inputNumeric))}
                        />
                      </div>
                      <div className={cn(EB.sheetField, "min-w-0")}>
                        <div className={EB.sheetLabelRow}>
                          <Label htmlFor="discount" className={EB.sheetLabel}>
                            Discount
                          </Label>
                          <EstimateDiscountOptionsPopover
                            discount={discountDraft}
                            preDiscountTotal={estimateSubtotal + taxDraft}
                            onDiscountChange={setDiscountDraft}
                          />
                        </div>
                        <Input
                          id="discount"
                          name="discount"
                          type="number"
                          step="0.01"
                          min={0}
                          value={discountDraft}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setDiscountDraft(Number.isFinite(n) ? Math.max(0, n) : 0);
                          }}
                          className={ebSheetInput(cn("text-sm text-foreground", EB.inputNumeric))}
                        />
                      </div>
                    </div>
                    <div
                      className="rounded-md border border-[var(--hh-border)] bg-[var(--hh-l2-operational-surface)] p-3"
                      data-testid="estimate-pricing-live-summary"
                    >
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        <dt className="text-[var(--hh-text-tertiary)]">Subtotal</dt>
                        <dd className="hh-fin text-right text-[var(--hh-text-secondary)]">
                          {formatEstimateCurrency(estimateSubtotal)}
                        </dd>
                        <dt className="text-[var(--hh-text-tertiary)]">Tax</dt>
                        <dd className="hh-fin text-right text-[var(--hh-text-secondary)]">
                          {formatEstimateCurrency(taxDraft)}
                        </dd>
                        <dt className="text-[var(--hh-text-tertiary)]">Discount</dt>
                        <dd className="hh-fin text-right text-[var(--hh-text-secondary)]">
                          −{formatEstimateCurrency(discountDraft)}
                        </dd>
                        <dt className="border-t border-[var(--hh-border)] pt-1.5 font-medium text-[var(--hh-text-primary)]">
                          Customer total
                        </dt>
                        <dd className="hh-fin border-t border-[var(--hh-border)] pt-1.5 text-right font-semibold text-[var(--hh-text-primary)]">
                          {formatEstimateCurrency(projectedCustomerTotal)}
                        </dd>
                      </dl>
                      {discountExceedsPreDiscountTotal ? (
                        <p className="mt-2 text-xs text-destructive" role="alert">
                          Discount exceeds subtotal plus tax. Review the customer total before
                          saving.
                        </p>
                      ) : null}
                    </div>
                  </section>
                </form>
              </div>

              <SheetFooter className={EB.sheetFooter}>
                <div className={EB.sheetFooterActions}>
                  <Button
                    type="button"
                    size="sm"
                    className={EB.sheetPrimary}
                    onClick={() => {
                      if (onSaveDetails) {
                        onSaveDetails();
                        return;
                      }
                      formRef.current?.requestSubmit();
                    }}
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={EB.sheetSecondary}
                    onClick={() => handleDetailsOpenChange(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </SheetFooter>
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </>
  );
}
