import React from "react";
import { EB } from "@/app/estimates/_components/estimate-builder-ui";
import { EstimateEditCustomerSection } from "@/app/estimates/_components/estimate-edit-customer-section";
import { EstimateBuilderSaveStatus } from "@/app/estimates/_components/estimate-builder-save-status";
import type { EditorLineItem } from "@/app/estimates/_components/estimate-line-item-model";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { ToastProvider } from "@/components/toast/toast-provider";
import { EstimateDocumentSaveProvider } from "@/app/estimates/_components/estimate-document-save-context";
import { EstimateWorkspaceCommandHeader } from "@/app/estimates/_components/estimate-workspace-command-header";
import { EstimateLineItemsLocal } from "@/app/estimates/_components/estimate-line-items-local";
import { EstimateBuilderCompactSummary } from "@/app/estimates/_components/estimate-builder-summary";
import { EstimateNotesClarifications } from "@/app/estimates/_components/estimate-notes-clarifications";
import { EstimatePaymentSchedule } from "@/app/estimates/_components/estimate-payment-schedule";
declare const __ESTIMATE_LEDGER__: {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  deposit: number;
  final: number;
};
const ledger = __ESTIMATE_LEDGER__;

// Browser-only composition of production components. No persistence, routes, or fixture DB writes.
const rejectWrite = async () => {
  throw new Error("Read-only visual fixture cannot persist");
};
function Fixture() {
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    const showSaving = () => setSaving(true);
    window.addEventListener("estimate-ultra-saving", showSaving);
    return () => window.removeEventListener("estimate-ultra-saving", showSaving);
  }, []);
  const [items, setItems] = React.useState<EditorLineItem[]>([
    {
      id: "ultra-1",
      costCode: "010000",
      title: "Remove existing flooring",
      description: "Protect adjacent finishes and prepare the existing substrate.",
      qty: 1,
      unit: "LS",
      unitPrice: 420.01,
      hideAmountOnPdf: false,
      status: "included" as const,
    },
    {
      id: "ultra-2",
      costCode: "020000",
      title: "Install SPC flooring",
      description: "Install flooring with clean perimeter transitions and finish details.",
      qty: 1,
      unit: "LS",
      unitPrice: 600,
      hideAmountOnPdf: false,
      status: "included" as const,
    },
  ]);
  const [names, setNames] = React.useState<Record<string, string>>({
    "010000": "Demolition",
    "020000": "Flooring",
  });
  const [order, setOrder] = React.useState(["010000", "020000"]);
  return (
    <div className="estimate-builder estimate-builder-new" id="estimate-ultra-fixture">
      <EstimateWorkspaceCommandHeader
        title="EST-0063"
        revisionLabel="Rev 0"
        status="Draft"
        context={["QA Test Customer", "QA Test Project"]}
      >
        <span />
      </EstimateWorkspaceCommandHeader>
      {saving && (
        <>
          <EstimateBuilderSaveStatus status="saving" />
          <EstimateEditCustomerSection
            meta={{
              client: { name: "QA Test Customer", phone: "", email: "", address: "" },
              project: { name: "QA Test Project", siteAddress: "" },
            }}
            estimateId="visual-fixture-only"
            today="2026-09-07"
            isReadOnly={false}
            detailsOpen
            detailsSurface="pricing"
            saving
            tax={ledger.tax}
            discount={ledger.discount}
            estimateSubtotal={ledger.subtotal}
            saveEstimateMetaAction={rejectWrite}
          />
        </>
      )}
      <div className="eb-estimate-editor-surface" data-estimate-editor-mode="edit">
        <div className={`${EB.workbench} eb-estimate-workbench--v3`}>
          <EstimateBuilderCompactSummary
            summary={{
              subtotal: ledger.subtotal,
              discount: ledger.discount,
              tax: ledger.tax,
              grandTotal: ledger.total,
              materialCost: 600,
              laborCost: 420.01,
              subcontractorCost: 0,
              markup: 0,
              overheadPct: 0,
              profitPct: 0,
              overhead: 0,
              profit: 0,
            }}
            paymentSummary={{ milestoneCount: 2, scheduledTotal: ledger.total }}
            onOpenPaymentSchedule={() => document.querySelector("#ultra-payment")?.scrollIntoView()}
            onOpenDetails={() => {}}
          />
          <div className="eb-v3-worksheet-flow">
            <EstimateLineItemsLocal
              costCodes={[]}
              lineItems={items}
              onLineItemsChange={setItems}
              categoryNames={names}
              onCategoryNamesChange={setNames}
              sectionOrder={order}
              onSectionOrderChange={setOrder}
              activeSectionId={null}
              explicitActiveSectionId={null}
              onActiveSectionChange={() => {}}
            />
            <section className="eb-v3-continuous-section" id="ultra-payment">
              <EstimatePaymentSchedule
                estimateId="visual-fixture-only"
                estimateTotal={ledger.total}
                isLocked
                paymentSchedule={[
                  {
                    id: "deposit",
                    estimateId: "visual-fixture-only",
                    sortOrder: 0,
                    title: "Deposit",
                    description: null,
                    amount: ledger.deposit,
                    status: "paid",
                    dueDate: null,
                    invoiceId: null,
                    createdAt: "2026-09-07",
                    updatedAt: "2026-09-07",
                  },
                  {
                    id: "final",
                    estimateId: "visual-fixture-only",
                    sortOrder: 1,
                    title: "Final",
                    description: null,
                    amount: ledger.final,
                    status: "paid",
                    dueDate: null,
                    invoiceId: null,
                    createdAt: "2026-09-07",
                    updatedAt: "2026-09-07",
                  },
                ]}
                addPaymentMilestoneAction={rejectWrite}
                updatePaymentMilestoneAction={rejectWrite}
                deletePaymentMilestoneAction={rejectWrite}
                markPaymentMilestonePaidAction={rejectWrite}
                reorderPaymentScheduleAction={rejectWrite}
                applyPaymentTemplateAction={rejectWrite}
                createPaymentTemplateAction={rejectWrite}
              />
            </section>
            <section className="eb-v3-continuous-section">
              <EstimateNotesClarifications
                notes={[
                  {
                    id: "scope-note",
                    type: "custom",
                    title: "Site access and protection",
                    body: "Maintain access to occupied areas. Confirm finish selections before installation.",
                  },
                ]}
                onNotesChange={() => {}}
              />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
document.querySelector(".estimate-builder-new")?.setAttribute("style", "display:none");
const host = document.createElement("div");
document.querySelector("main")!.append(host);
createRoot(host).render(
  <AppRouterContext.Provider
    value={{
      back() {},
      forward() {},
      refresh() {},
      push() {},
      replace() {},
      prefetch: async () => {},
    }}
  >
    <SearchParamsContext.Provider value={new URLSearchParams()}>
      <ToastProvider>
        <EstimateDocumentSaveProvider>
          <Fixture />
        </EstimateDocumentSaveProvider>
      </ToastProvider>
    </SearchParamsContext.Provider>
  </AppRouterContext.Provider>
);
